'use strict';

// 题库文本批量导入：把纯文本题目草稿转换成 data/questions/ 下的 JSON 分片
// 用法： npm run import -- <草稿.txt> [--out 批次名] [--dry-run] [--force]
//
// 草稿格式（# 行设置公共字段，空行分隔题目）：
//
//   # book=1 lesson=7 grammar=冠词a/an
//   He is ___ engineer.
//   * an | a | the | -
//   解析: engineer 以元音音素 /e/ 开头，不定冠词用 an。
//
//   She ___ (drink) tea every morning.
//   答案: drinks
//   解析: 第三人称单数一般现在时，drink 加 -s。
//
// 规则：
//   - # 行的 book/lesson/grammar 对后续题目生效，可在文件中途用新的 # 行覆盖
//   - 选项行用 | 分隔，正确答案前加 *；没有选项行则视为 fill 填空题
//   - fill 题用「答案:」行给出答案，多个可接受答案用 | 分隔
//   - 「语法:」行可覆盖 # 行的 grammar（逗号分隔多个）
//   - id 自动按 b{册}-{课}-q{序}（选择）/ b{册}-{课}-f{序}（填空）分配
//   - lessonTitle 自动从课程数据带出；写盘前跑全量校验，有新错误则回滚

const path = require('path');
const data = require('../lib/data');
const { validate } = require('./validate');
const { splitList, fail, normText, parseBlocks, parseArgs, resolveOutFile, readDraft, commitShard } = require('./import-common');

const QUESTIONS_DIR = path.join(data.DATA_DIR, 'questions');

// ---------- 草稿块 → 题目 ----------

// 选项行判定：含 | 且某段以 * 开头，如 "* an | a | the | -"
function isOptionsLine(s) {
  return s.includes('|') && /(^|\|)\s*\*/.test(s);
}

function parseOptions(line, no) {
  const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) throw fail(no, '选项至少 2 个（用 | 分隔）');
  let answer = null;
  const options = parts.map((p) => {
    if (!p.startsWith('*')) return p;
    if (answer != null) throw fail(no, '只能有一个 * 标记的正确答案');
    answer = p.slice(1).trim();
    return answer;
  });
  if (answer == null || answer === '') throw fail(no, '缺少 * 标记的正确答案');
  return { options, answer };
}

// 一个题目块 → 题目对象（id / lessonTitle 之后统一补）
function blockToQuestion(block) {
  const { lines, ctx } = block;
  const first = lines[0].no;
  if (ctx.book == null || ctx.lesson == null) {
    throw fail(first, '缺少 book/lesson，请先写一行如 "# book=1 lesson=7"');
  }

  let stem = null;
  let mcq = null;
  let fillAnswer = null;
  let explanation = null;
  let grammar = null;

  for (const { no, text } of lines) {
    const m = text.match(/^(解析|答案|语法)\s*[:：]\s*(.*)$/);
    if (m) {
      const val = m[2].trim();
      if (!val) throw fail(no, `「${m[1]}:」后面是空的`);
      if (m[1] === '解析') explanation = val;
      else if (m[1] === '语法') grammar = splitList(val);
      else {
        const alts = val.split('|').map((s) => s.trim()).filter(Boolean);
        fillAnswer = alts.length > 1 ? alts : alts[0];
      }
    } else if (isOptionsLine(text)) {
      if (mcq) throw fail(no, '一道题只能有一行选项');
      mcq = parseOptions(text, no);
    } else if (stem == null) {
      stem = text;
    } else {
      throw fail(no, `无法识别的行（题干只能一行；选项行需含 | 和 *，解析用「解析:」开头）`);
    }
  }

  if (!stem) throw fail(first, '缺少题干');
  if (mcq && fillAnswer != null) throw fail(first, '同时有选项行和「答案:」行，无法判断题型');
  if (!mcq && fillAnswer == null) throw fail(first, '既无选项行也无「答案:」行（填空题请用「答案: xxx」）');

  const q = {
    id: null,
    book: ctx.book,
    lesson: ctx.lesson,
    lessonTitle: null,
    grammar: grammar || ctx.grammar,
    type: mcq ? 'mcq' : 'fill',
    stem,
  };
  if (mcq) q.options = mcq.options;
  q.answer = mcq ? mcq.answer : fillAnswer;
  if (explanation) q.explanation = explanation;
  return { q, lineNo: first };
}

// 沿用现有主流 id 格式 b{册}-{课}-q{N} / b{册}-{课}-f{N}，按 册+课+题型 续号
function makeIdAllocator(existing) {
  const max = new Map();
  for (const q of existing) {
    const m = String(q.id).match(/^b(\d+)-(\d+)-([qf])(\d+)$/);
    if (m) {
      const key = `${m[1]}-${m[2]}-${m[3]}`;
      max.set(key, Math.max(max.get(key) || 0, Number(m[4])));
    }
  }
  return (q) => {
    const key = `${q.book}-${q.lesson}-${q.type === 'mcq' ? 'q' : 'f'}`;
    const n = (max.get(key) || 0) + 1;
    max.set(key, n);
    return `b${key}${n}`;
  };
}

// ---------- 主流程 ----------

function usage() {
  console.log('用法: npm run import -- <草稿.txt> [--out 批次名] [--dry-run] [--force]');
  console.log('  --out      输出分片名（默认取草稿文件名），写到 data/questions/<名>.json');
  console.log('  --dry-run  只解析并预览 JSON，不写文件');
  console.log('  --force    题干与现有题目重复时仍然导入（默认视为错误）');
  console.log('  草稿格式见本文件头部注释。');
}

function main() {
  const { input, name, dryRun, force } = parseArgs(process.argv.slice(2), usage);
  const outFile = resolveOutFile(QUESTIONS_DIR, name);
  const text = readDraft(input);

  // 基线：现有数据 + 现有校验错误（导入后只关心「新增」的错误）
  data.reload();
  const baselineErrors = new Set(validate().errors);
  const existing = data.getQuestions();
  const stemOwner = new Map(existing.map((q) => [normText(q.stem), q.id]));

  // 解析草稿（任一错误都指明行号后退出）
  let parsed;
  try {
    parsed = parseBlocks(text).map(blockToQuestion);
  } catch (e) {
    console.error(`❌ ${input} ${e.message}`);
    process.exit(1);
  }
  if (!parsed.length) {
    console.error('❌ 草稿里没有解析到任何题目');
    process.exit(1);
  }

  // 题干查重（对现有题库 + 本批内部），默认报错，--force 降级为警告
  const dupMsgs = [];
  for (const { q, lineNo } of parsed) {
    const key = normText(q.stem);
    if (stemOwner.has(key)) dupMsgs.push(`第 ${lineNo} 行: 题干与已有题目 ${stemOwner.get(key)} 重复`);
    else stemOwner.set(key, `本批第 ${lineNo} 行`);
  }
  if (dupMsgs.length && !force) {
    dupMsgs.forEach((m) => console.error('❌ ' + m));
    console.error('（确认不是重复录入的话，加 --force 强制导入）');
    process.exit(1);
  }
  dupMsgs.forEach((m) => console.warn('⚠️  ' + m));

  // 补 id 与 lessonTitle
  const allocId = makeIdAllocator(existing);
  const titleMap = new Map(data.getLessons().map((l) => [`${l.book}-${l.lesson}`, l.title]));
  const warnings = [];
  const questions = parsed.map(({ q, lineNo }) => {
    q.id = allocId(q);
    const title = titleMap.get(`${q.book}-${q.lesson}`);
    if (title) q.lessonTitle = title;
    else {
      delete q.lessonTitle;
      warnings.push(`第 ${lineNo} 行 (${q.id}): 课程数据里没有 book=${q.book} lesson=${q.lesson}，lessonTitle 留空`);
    }
    if (!q.explanation) warnings.push(`第 ${lineNo} 行 (${q.id}): 缺少解析（建议补上）`);
    if (!q.grammar.length) warnings.push(`第 ${lineNo} 行 (${q.id}): 没有语法标签（# grammar= 或「语法:」行）`);
    return q;
  });

  warnings.forEach((w) => console.warn('⚠️  ' + w));

  if (dryRun) {
    console.log(JSON.stringify(questions, null, 2));
    console.log(`\n[dry-run] 解析出 ${questions.length} 道题（mcq ${questions.filter((q) => q.type === 'mcq').length} / fill ${questions.filter((q) => q.type === 'fill').length}），未写文件`);
    return;
  }

  commitShard(outFile, questions, baselineErrors);
  console.log(`✅ 已导入 ${questions.length} 道题 → ${path.relative(process.cwd(), outFile)}`);
  console.log(`   id: ${questions.map((q) => q.id).join(', ')}`);
  console.log('   （服务运行中的话，重启或调用 data.reload() 后生效）');
}

if (require.main === module) main();

module.exports = { blockToQuestion };
