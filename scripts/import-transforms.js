'use strict';

// 句型转换练习文本批量导入：纯文本草稿 → data/transforms/ 下的 JSON 分片
// 用法： npm run import:tf -- <草稿.txt> [--out 批次名] [--dry-run] [--force]
//
// 草稿格式（# 行设置公共字段，空行分隔条目，和题库导入一致）：
//
//   # book=1 lesson=25 grammar=一般现在时,疑问句
//   中文: 她每天喝咖啡。
//   翻译: She drinks coffee every day.
//   疑问: Does she drink coffee every day?
//   否定: She does not drink coffee every day. | She doesn't drink coffee every day.
//   提问(对「coffee」提问，问"什么"): What does she drink every day?
//   解析: 一般现在时三单句借助 does 构成疑问和否定，动词还原为原形。
//
// 规则：
//   - 「中文:」为必填的中文原句；步骤行按书写顺序生成转换链
//   - 步骤关键字 → kind：翻译=translate 疑问=yesno 否定=negative
//     提问=wh 引语=indirect 被动=passive（也可直接写英文 kind 名）
//   - 关键字后可用括号自定义提问语，如「提问(对「She」提问，问"谁"): ...」，
//     不写则用默认提问语；多个可接受答案用 | 分隔
//   - 「语法:」行可覆盖 # 行的 grammar；「解析:」为转换规则讲解
//   - id 自动按 tf-b{册}-{三位序号} 全册续号；写盘前跑全量校验，有新错误则回滚

const path = require('path');
const data = require('../lib/data');
const { validate } = require('./validate');
const { KIND_LABEL } = require('../lib/transform-util');
const { splitList, fail, normText, parseBlocks, parseArgs, resolveOutFile, readDraft, commitShard } = require('./import-common');

const TRANSFORMS_DIR = path.join(data.DATA_DIR, 'transforms');

const KIND_ALIAS = {
  翻译: 'translate',
  疑问: 'yesno',
  否定: 'negative',
  提问: 'wh',
  引语: 'indirect',
  被动: 'passive',
};
const DEFAULT_PROMPT = {
  translate: '翻译成英文',
  yesno: '改为一般疑问句',
  negative: '改为否定句',
  wh: '改为特殊疑问句',
  indirect: '改为间接引语',
  passive: '改为被动语态',
};
// 步骤/字段行统一匹配：关键字 + 可选括号提问语 + 冒号 + 内容
const KEYWORDS = ['中文', '解析', '语法', ...Object.keys(KIND_ALIAS), ...Object.keys(DEFAULT_PROMPT)];
const LINE_RE = new RegExp(`^(${KEYWORDS.join('|')})\\s*(?:[（(]([^）)]+)[）)])?\\s*[:：]\\s*(.*)$`);

// 一个条目块 → 转换练习对象（id 之后统一补）
function blockToTransform(block) {
  const { lines, ctx } = block;
  const first = lines[0].no;
  if (ctx.book == null || ctx.lesson == null) {
    throw fail(first, '缺少 book/lesson，请先写一行如 "# book=1 lesson=25"');
  }

  let cn = null;
  let explanation = null;
  let grammar = null;
  const steps = [];
  const stepWarnings = [];

  for (const { no, text } of lines) {
    const m = text.match(LINE_RE);
    if (!m) {
      throw fail(no, `无法识别的行（可用关键字：${KEYWORDS.join(' / ')}，后接冒号）`);
    }
    const [, keyword, customPrompt, rawVal] = m;
    const val = rawVal.trim();
    if (!val) throw fail(no, `「${keyword}:」后面是空的`);

    if (keyword === '中文') {
      if (cn != null) throw fail(no, '一个条目只能有一行「中文:」');
      cn = val;
    } else if (keyword === '解析') {
      explanation = val;
    } else if (keyword === '语法') {
      grammar = splitList(val);
    } else {
      const kind = KIND_ALIAS[keyword] || keyword;
      const answers = val.split('|').map((s) => s.trim()).filter(Boolean);
      if (!answers.length) throw fail(no, '答案不能为空');
      if (kind === 'wh' && !customPrompt) {
        stepWarnings.push(`第 ${no} 行: 提问步骤建议用括号注明提问对象，如「提问(对「She」提问，问"谁"): ...」`);
      }
      steps.push({ kind, prompt: (customPrompt || '').trim() || DEFAULT_PROMPT[kind], answers });
    }
  }

  if (!cn) throw fail(first, '缺少「中文:」行（中文原句）');
  if (!steps.length) throw fail(first, '至少要有一个转换步骤（如「翻译: ...」）');
  if (steps[0].kind !== 'translate') {
    stepWarnings.push(`第 ${first} 行: 第一步建议是「翻译:」（${KIND_LABEL[steps[0].kind]} 前先建立英文原句）`);
  }

  const t = { id: null, book: ctx.book, lesson: ctx.lesson, grammar: grammar || ctx.grammar, cn, steps };
  if (explanation) t.explanation = explanation;
  return { t, lineNo: first, stepWarnings };
}

// id 格式 tf-b{册}-{三位序号}，按册取现有最大号续编
function makeIdAllocator(existing) {
  const max = new Map();
  for (const t of existing) {
    const m = String(t.id).match(/^tf-b(\d+)-(\d+)$/);
    if (m) max.set(m[1], Math.max(max.get(m[1]) || 0, Number(m[2])));
  }
  return (t) => {
    const book = String(t.book);
    const n = (max.get(book) || 0) + 1;
    max.set(book, n);
    return `tf-b${book}-${String(n).padStart(3, '0')}`;
  };
}

// ---------- 主流程 ----------

function usage() {
  console.log('用法: npm run import:tf -- <草稿.txt> [--out 批次名] [--dry-run] [--force]');
  console.log('  --out      输出分片名（默认取草稿文件名），写到 data/transforms/<名>.json');
  console.log('  --dry-run  只解析并预览 JSON，不写文件');
  console.log('  --force    中文原句与现有条目重复时仍然导入（默认视为错误）');
  console.log('  草稿格式见本文件头部注释。');
}

function main() {
  const { input, name, dryRun, force } = parseArgs(process.argv.slice(2), usage);
  const outFile = resolveOutFile(TRANSFORMS_DIR, name);
  const text = readDraft(input);

  // 基线：现有数据 + 现有校验错误（导入后只关心「新增」的错误）
  data.reload();
  const baselineErrors = new Set(validate().errors);
  const existing = data.getTransforms();
  const cnOwner = new Map(existing.map((t) => [normText(t.cn), t.id]));

  let parsed;
  try {
    parsed = parseBlocks(text).map(blockToTransform);
  } catch (e) {
    console.error(`❌ ${input} ${e.message}`);
    process.exit(1);
  }
  if (!parsed.length) {
    console.error('❌ 草稿里没有解析到任何条目');
    process.exit(1);
  }

  // 中文原句查重（对现有条目 + 本批内部），默认报错，--force 降级为警告
  const dupMsgs = [];
  for (const { t, lineNo } of parsed) {
    const key = normText(t.cn);
    if (cnOwner.has(key)) dupMsgs.push(`第 ${lineNo} 行: 中文原句与已有条目 ${cnOwner.get(key)} 重复`);
    else cnOwner.set(key, `本批第 ${lineNo} 行`);
  }
  if (dupMsgs.length && !force) {
    dupMsgs.forEach((m) => console.error('❌ ' + m));
    console.error('（确认不是重复录入的话，加 --force 强制导入）');
    process.exit(1);
  }
  dupMsgs.forEach((m) => console.warn('⚠️  ' + m));

  // 补 id，汇总警告
  const allocId = makeIdAllocator(existing);
  const warnings = [];
  const items = parsed.map(({ t, lineNo, stepWarnings }) => {
    t.id = allocId(t);
    warnings.push(...stepWarnings.map((w) => `${w} (${t.id})`));
    if (!t.explanation) warnings.push(`第 ${lineNo} 行 (${t.id}): 缺少解析（建议补上转换规则讲解）`);
    if (!t.grammar.length) warnings.push(`第 ${lineNo} 行 (${t.id}): 没有语法标签（# grammar= 或「语法:」行）`);
    return t;
  });

  warnings.forEach((w) => console.warn('⚠️  ' + w));

  if (dryRun) {
    console.log(JSON.stringify(items, null, 2));
    const nSteps = items.reduce((s, t) => s + t.steps.length, 0);
    console.log(`\n[dry-run] 解析出 ${items.length} 个条目（共 ${nSteps} 个转换步骤），未写文件`);
    return;
  }

  commitShard(outFile, items, baselineErrors);
  console.log(`✅ 已导入 ${items.length} 个句型转换条目 → ${path.relative(process.cwd(), outFile)}`);
  console.log(`   id: ${items.map((t) => t.id).join(', ')}`);
  console.log('   （服务运行中的话，重启或调用 data.reload() 后生效）');
}

if (require.main === module) main();

module.exports = { blockToTransform };
