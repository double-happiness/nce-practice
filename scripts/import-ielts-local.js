'use strict';

// 雅思自有资料导入：把自己整理的词汇 / 写作 / 口语资料校验后写到 data/ielts/local/<type>/<name>.json
// 用法： node scripts/import-ielts-local.js <文件或目录> --type vocab|writing|speaking [--name 分片名] [--dry-run]
//
// 输入格式：
//   - JSON：与 data/ielts/<type>/ 内置分片同 schema 的数组（schema 见 docs/雅思自有资料导入.md）
//   - CSV（仅 --type vocab）：表头 word,pos,cn,eg,egCn,topic,cefr,phon,collocations，collocations 用 | 分隔；
//     含逗号、换行或双引号的字段用双引号包起来，字段内的双引号写成 ""
//   - 目录：读取目录下（不递归）全部 *.json / *.csv，合并成一个分片，默认分片名取目录名
//
// 规则：
//   - schema 校验复用 scripts/validate.js 的 validateIelts：必填字段、枚举、id 格式、批内重复
//   - 与内置内容、已有 local 分片冲突（词汇按 normKey(word)，写作 / 口语按 id，两者共用一个 id 命名空间）一律报错
//   - 不提供 --force：lib/ielts.js 合并时同一 word / id 只保留首次出现的那条，内置分片先于 local 加载，
//     local 无法覆盖内置；重复项还会让 npm run validate 报错
//   - 目标分片已存在时报错、不覆盖（要替换就先删掉旧文件）
//   - 整批校验通过才写入，不做部分导入；写盘后跑全量校验，出现新错误则回滚（import-common.commitShard）
//   - 加载器有内存缓存、没有运行时重载接口，导入后需重启服务才能生效

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const ielts = require('../lib/ielts');
const { normKey } = require('../lib/dict');
const { validate, validateIelts } = require('./validate');
const { commitShard } = require('./import-common');

const TYPES = ['vocab', 'writing', 'speaking'];
const CSV_COLUMNS = ['word', 'pos', 'cn', 'eg', 'egCn', 'topic', 'cefr', 'phon', 'collocations'];
const CSV_REQUIRED = ['word', 'cn', 'topic', 'cefr'];
// 分片名会拼进文件路径：只允许字母（含中文）、数字、- 和 _，杜绝 ../ 之类的路径穿越
const NAME_RE = /^[\p{L}\p{N}_-]{1,64}$/u;
const MAX_WARNINGS_SHOWN = 20;
const COPYRIGHT_NOTICE = '提示：自有资料仅本地使用，不会提交到仓库（data/ielts/local/ 已列入 .gitignore）';
const FORCE_UNSUPPORTED =
  '不支持 --force：内容加载器（lib/ielts.js）合并分片时同一 word / id 只保留首次出现的那条，' +
  '内置分片先于 local 加载，local 无法覆盖内置内容；重复项还会让 npm run validate 报错。请改掉冲突的 word / id 再导入';

// validateIelts 的条目级消息格式：「ielts/<来源> <kind>[<下标>] word=… / id=…: 说明」。
// 这里传入的条目没有在加载器登记来源，来源固定显示为 ?
const ITEM_MSG_RE = /^ielts\/\? (?:vocab|writing|speaking)\[(\d+)\] ([\s\S]*)$/;
// 只传入条目时 validateIelts 会提示 rubrics.json / plan.json 缺失，这两个文件不在导入范围内，忽略这类提示
const IGNORED_PREFIXES = ['ielts/rubrics.json:', 'ielts/plan.json:'];

const rel = (file) => path.relative(process.cwd(), file);
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------- 命令行参数 ----------

function usage() {
  console.log('用法: node scripts/import-ielts-local.js <文件或目录> --type vocab|writing|speaking [--name 分片名] [--dry-run]');
  console.log('  --type     资料类型（必填）：vocab 词汇 / writing 写作 / speaking 口语');
  console.log('  --name     分片名（默认取文件名或目录名），写到 data/ielts/local/<type>/<名>.json');
  console.log('  --dry-run  只校验并打印摘要，不写文件');
  console.log('  输入支持与内置分片同 schema 的 JSON 数组；vocab 另支持 CSV。详见 docs/雅思自有资料导入.md');
}

function argError(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

function parseArgs(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    usage();
    process.exit(argv.length ? 0 : 1);
  }
  const opts = { input: null, type: null, name: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const flag = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    if (flag === '--type' || flag === '--name') {
      const value = flag !== arg ? arg.slice(eq + 1) : argv[++i];
      if (!value || value.startsWith('--')) argError(`${flag} 后面需要跟值`);
      opts[flag.slice(2)] = value;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (flag === '--force') {
      argError(FORCE_UNSUPPORTED);
    } else if (arg.startsWith('-')) {
      argError(`未知参数 ${arg}（可用 --type / --name / --dry-run）`);
    } else if (opts.input) {
      argError(`只能指定一个文件或目录（多出 ${arg}）`);
    } else {
      opts.input = arg;
    }
  }
  if (!opts.input) {
    usage();
    argError('缺少 <文件或目录> 参数');
  }
  if (!TYPES.includes(opts.type)) argError(`--type 必须是 ${TYPES.join(' / ')}（实际 ${opts.type || '未指定'}）`);
  if (!opts.name) opts.name = path.basename(path.resolve(opts.input)).replace(/\.(json|csv)$/i, '');
  if (!NAME_RE.test(opts.name)) {
    argError(`分片名 "${opts.name}" 只能包含字母（含中文）、数字、- 和 _（不超过 64 字），请用 --name 指定`);
  }
  return opts;
}

// 输入是文件就只读它；是目录就读其中（不递归）全部 .json / .csv，按文件名排序
function collectSources(input) {
  const isSupported = (f) => /\.(json|csv)$/i.test(f);
  let stat;
  try {
    stat = fs.statSync(input);
  } catch (e) {
    argError(`读不到 ${input}: ${e.message}`);
  }
  if (!stat.isDirectory()) {
    if (!isSupported(input)) argError(`只支持 .json 或 .csv 文件（${input}）`);
    return [input];
  }
  let names;
  try {
    names = fs.readdirSync(input);
  } catch (e) {
    argError(`目录读取失败 ${input}: ${e.message}`);
  }
  const files = names
    .filter(isSupported)
    .sort()
    .map((f) => path.join(input, f))
    .filter((f) => fs.statSync(f).isFile());
  if (!files.length) argError(`目录 ${input} 下没有 .json 或 .csv 文件`);
  return files;
}

// ---------- 报告：条目、跳过数、错误、警告 ----------
// item = { seq: 读入顺序, loc: '文件名 第 N 行' | '文件名 [i]', entry: 对象或 null（本身无法解析）, bad: 是否有错误 }
// errors / warnings 元素为 { seq, text }：seq 为 -1 表示文件级问题；输出时按 seq 排序，条目问题按读入顺序排列

function createReport() {
  return { items: [], skipped: 0, errors: [], warnings: [] };
}

function addItem(report, loc, entry) {
  const item = { seq: report.items.length, loc, entry, bad: false };
  report.items.push(item);
  return item;
}

function fileError(report, text) {
  report.errors.push({ seq: -1, text });
}

function fileWarning(report, text) {
  report.warnings.push({ seq: -1, text });
}

function itemError(report, item, msg) {
  item.bad = true;
  report.errors.push({ seq: item.seq, text: `${item.loc} ${msg}` });
}

function itemWarning(report, item, msg) {
  report.warnings.push({ seq: item.seq, text: `${item.loc} ${msg}` });
}

function labelOf(entry, type) {
  if (type === 'vocab') return `word=${entry.word == null ? '?' : entry.word}`;
  return `id=${entry.id == null ? '?' : entry.id}`;
}

// 用户的输入文件不走 store.readJSON：它在 JSON 损坏时会在用户文件旁生成 .corrupt 备份，且拿不到解析错误位置
function readText(file, base, report) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    fileError(report, `${base}: 读取失败 ${e.message}`);
    return null;
  }
  // Excel 导出的 UTF-8 CSV 开头带 BOM（U+FEFF），去掉
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ---------- JSON 输入 ----------

function loadJson(file, base, report) {
  const text = readText(file, base, report);
  if (text == null) return;
  let arr;
  try {
    arr = JSON.parse(text);
  } catch (e) {
    fileError(report, `${base}: JSON 解析失败 ${e.message}`);
    return;
  }
  if (!Array.isArray(arr)) {
    fileError(report, `${base}: 必须是 JSON 数组（与内置分片相同），实际是 ${arr === null ? 'null' : typeof arr}`);
    return;
  }
  arr.forEach((x, i) => {
    const item = addItem(report, `${base} [${i}]`, isPlainObject(x) ? x : null);
    if (!item.entry) {
      const value = JSON.stringify(x);
      itemError(report, item, `值=${value.length > 40 ? value.slice(0, 40) + '…' : value}: 条目必须是 JSON 对象`);
    }
  });
}

// ---------- CSV 输入（仅词汇）----------

/**
 * 解析 CSV 文本（RFC 4180）：逗号分隔；双引号包裹的字段可含逗号、换行，"" 表示一个双引号。
 * 宽松处理两种手写常见情况：逗号后的空格再接引号仍按引号字段处理；未加引号字段中间的 " 按普通字符保留。
 * @returns {{ line: number, fields: string[] }[]} 每条记录的起始行号与字段
 * @throws {Error} 引号未闭合、引号字段后有多余字符时抛出带行号的错误
 */
function parseCsv(text) {
  const src = text.replace(/\r\n?/g, '\n');
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false; // 刚结束一个引号字段：之后只允许空白、逗号或换行
  let line = 1;
  let recordLine = 1;
  let quoteLine = 0;

  const endField = () => {
    fields.push(field);
    field = '';
    afterQuote = false;
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
        afterQuote = true;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n') {
      endRecord();
      line++;
      recordLine = line;
    } else if (afterQuote) {
      if (ch !== ' ' && ch !== '\t') {
        throw new Error(`第 ${line} 行: 引号字段结束后出现多余字符「${ch}」（字段内的双引号要写成 ""）`);
      }
    } else if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      quoteLine = line;
      field = '';
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    throw new Error(`第 ${quoteLine} 行: 双引号没有闭合（之后的内容都会被当成同一个字段；字段内的双引号要写成 ""）`);
  }
  // 文件末尾没有换行时补上最后一条记录
  if (field !== '' || fields.length || afterQuote) endRecord();
  return records;
}

// 表头 → 列名数组（大小写不敏感，列顺序不限）；有未知 / 重复 / 缺必需列时记错误并返回 null
function mapHeader(header, base, report) {
  const canonical = new Map(CSV_COLUMNS.map((c) => [c.toLowerCase(), c]));
  const columns = header.fields.map((f) => canonical.get(f.trim().toLowerCase()) || null);
  const unknown = header.fields.filter((f, i) => !columns[i]).map((f) => f.trim() || '(空列名)');
  const dup = [...new Set(columns.filter((c, i) => c && columns.indexOf(c) !== i))];
  const missing = CSV_REQUIRED.filter((c) => !columns.includes(c));
  const problems = [];
  if (unknown.length) problems.push(`未知列 ${unknown.join(', ')}`);
  if (dup.length) problems.push(`重复列 ${dup.join(', ')}`);
  if (missing.length) problems.push(`缺少必需列 ${missing.join(', ')}`);
  if (problems.length) {
    fileError(report, `${base} 第 ${header.line} 行（表头）: ${problems.join('；')}（表头应为 ${CSV_COLUMNS.join(',')}）`);
    return null;
  }
  return columns;
}

// CSV 一行 → 词条：去首尾空白，空的可选字段不写入；collocations 按 | 拆成数组；字段按固定顺序输出
function rowToVocab(columns, fields) {
  const values = {};
  columns.forEach((col, i) => {
    values[col] = fields[i].trim();
  });
  const entry = {};
  for (const col of CSV_COLUMNS) {
    const value = values[col];
    if (!value) continue;
    if (col === 'collocations') {
      const list = value.split('|').map((s) => s.trim()).filter(Boolean);
      if (list.length) entry.collocations = list;
    } else {
      entry[col] = value;
    }
  }
  return entry;
}

function loadCsv(file, base, report) {
  const text = readText(file, base, report);
  if (text == null) return;
  let records;
  try {
    records = parseCsv(text);
  } catch (e) {
    fileError(report, `${base} ${e.message}`);
    return;
  }
  const isBlank = (r) => r.fields.every((f) => f.trim() === '');
  const headerIdx = records.findIndex((r) => !isBlank(r));
  if (headerIdx < 0) {
    fileError(report, `${base}: 文件是空的，缺少表头 ${CSV_COLUMNS.join(',')}`);
    return;
  }
  const columns = mapHeader(records[headerIdx], base, report);
  if (!columns) return;

  for (const rec of records.slice(headerIdx + 1)) {
    if (isBlank(rec)) {
      report.skipped++;
      continue;
    }
    const item = addItem(report, `${base} 第 ${rec.line} 行`, null);
    if (rec.fields.length !== columns.length) {
      const word = (rec.fields[columns.indexOf('word')] || '').trim() || '?';
      itemError(
        report,
        item,
        `word=${word}: 字段数 ${rec.fields.length} 与表头 ${columns.length} 列不一致（字段里有英文逗号时，要用双引号把整个字段包起来）`
      );
      continue;
    }
    item.entry = rowToVocab(columns, rec.fields);
  }
}

function loadSource(file, type, report) {
  const base = path.basename(file);
  if (/\.csv$/i.test(file)) {
    if (type !== 'vocab') {
      fileError(report, `${base}: CSV 只支持 --type vocab，写作 / 口语请用 JSON 数组`);
      return;
    }
    loadCsv(file, base, report);
  } else {
    loadJson(file, base, report);
  }
}

// ---------- 校验 ----------

function keyOf(entry, type) {
  if (type === 'vocab') return typeof entry.word === 'string' ? normKey(entry.word) : '';
  return typeof entry.id === 'string' ? entry.id : '';
}

// schema 校验：复用 validateIelts，把消息里的数组下标换回「文件 + 行号 / 下标」
function schemaCheck(report, type) {
  const checked = report.items.filter((it) => it.entry);
  // validateIelts 的词汇批内去重依赖加载器补上的 key 字段，这里同样补上（只用于校验，不写入文件）
  const list = checked.map((it) => (type === 'vocab' ? { ...it.entry, key: normKey(it.entry.word) } : it.entry));
  const content = { vocab: [], writing: [], speaking: [], rubrics: null, plan: null, issues: [] };
  content[type] = list;
  const result = validateIelts(content);

  // 批内重复时 validateIelts 只能写「首次出现于 ielts/?」（来源登记在加载器内部），换成本批的位置
  const firstLoc = new Map();
  for (const it of checked) {
    const k = keyOf(it.entry, type);
    if (k && !firstLoc.has(k)) firstLoc.set(k, it.loc);
  }
  const route = (msg, onItem, onGeneral) => {
    if (IGNORED_PREFIXES.some((p) => msg.startsWith(p))) return;
    const m = msg.match(ITEM_MSG_RE);
    const item = m && checked[Number(m[1])];
    if (!item) return onGeneral(msg);
    const first = firstLoc.get(keyOf(item.entry, type)) || '?';
    onItem(item, m[2].replace('首次出现于 ielts/?', `首次出现于本批 ${first}`));
  };
  result.errors.forEach((msg) =>
    route(msg, (item, text) => itemError(report, item, text), (text) => fileError(report, text))
  );
  result.warnings.forEach((msg) =>
    route(msg, (item, text) => itemWarning(report, item, text), (text) => fileWarning(report, text))
  );
}

// 与现有内容冲突：词汇按 normKey(word)；写作 / 口语按 id，且两类共用 id 命名空间（与 validate 一致）。
// 目标分片若已存在会单独报错，这里把它排除在基线外，避免同一批词全部重复报一遍
function checkConflicts(report, type, content, targetRel) {
  const owner = new Map();
  const add = (key, item) => {
    const origin = ielts.originOf(item);
    if (key && origin !== targetRel && !owner.has(key)) owner.set(key, origin);
  };
  if (type === 'vocab') content.vocab.forEach((v) => add(v.key, v));
  else [...content.writing, ...content.speaking].forEach((x) => add(typeof x.id === 'string' ? x.id : '', x));

  for (const item of report.items) {
    if (!item.entry) continue;
    const origin = owner.get(keyOf(item.entry, type));
    if (!origin) continue;
    const where = origin.startsWith('local/') ? '已有 local 分片' : '内置内容';
    const field = type === 'vocab' ? 'word' : 'id';
    itemError(report, item, `${labelOf(item.entry, type)}: 与${where} ${origin} 冲突（${field} 相同）`);
  }
}

// ---------- 输出 ----------

// 文件级问题在前，条目问题按读入顺序（Array#sort 稳定，同一条目的多条消息保持原顺序）
const bySeq = (list) => [...list].sort((a, b) => a.seq - b.seq);

function printReport(report) {
  const warnings = bySeq(report.warnings);
  warnings.slice(0, MAX_WARNINGS_SHOWN).forEach((w) => console.warn('⚠️  ' + w.text));
  if (warnings.length > MAX_WARNINGS_SHOWN) {
    console.warn(`⚠️  …另有 ${warnings.length - MAX_WARNINGS_SHOWN} 条警告未列出`);
  }
  bySeq(report.errors).forEach((e) => console.error('❌ ' + e.text));
  const bad = report.items.filter((it) => it.bad).length;
  console.log(
    `\n读取 ${report.items.length} 条，跳过 ${report.skipped} 条（空行），${bad} 条有错误；` +
      `错误 ${report.errors.length} 处，警告 ${report.warnings.length} 条`
  );
}

function previewKeys(entries, type) {
  const keys = entries.map((e) => (type === 'vocab' ? e.word : e.id));
  const head = keys.slice(0, 10).join(', ');
  return keys.length > 10 ? `${head} …（共 ${keys.length} 条）` : head;
}

// ---------- 主流程 ----------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(COPYRIGHT_NOTICE);
  const sources = collectSources(opts.input);
  const outFile = path.join(ielts.dataDir(), 'local', opts.type, `${opts.name}.json`);
  const targetRel = `local/${opts.type}/${opts.name}.json`; // 与 ielts.originOf 的来源格式一致
  console.log(`类型 ${opts.type} · 来源 ${sources.map((f) => path.basename(f)).join(', ')} · 目标 ${rel(outFile)}`);

  const report = createReport();
  if (fs.existsSync(outFile)) {
    fileError(report, `目标分片 ${rel(outFile)} 已存在：不覆盖，要替换请先删除它，或用 --name 换个分片名`);
  }
  for (const file of sources) loadSource(file, opts.type, report);
  if (!report.items.length && !report.errors.length) fileError(report, '没有读到任何条目');

  // 现有内容（内置 + 已有 local）重新加载后做冲突检查
  data.reload();
  const content = ielts.getContent();
  content.issues.forEach((m) => fileWarning(report, `现有内容加载问题（冲突检查未覆盖该处）: ielts/${m}`));
  schemaCheck(report, opts.type);
  checkConflicts(report, opts.type, content, targetRel);

  printReport(report);
  if (report.errors.length) {
    console.error('❌ 校验未通过，未写入任何文件（导入 0 条）');
    process.exit(1);
  }

  const entries = report.items.map((it) => it.entry);
  if (opts.dryRun) {
    console.log(`[dry-run] 校验通过，将导入 ${entries.length} 条 → ${rel(outFile)}，未写文件`);
    console.log(`   条目: ${previewKeys(entries, opts.type)}`);
    return;
  }

  // 基线：写盘前的全量校验错误；写盘后出现新错误则由 commitShard 删除文件回滚
  const baselineErrors = new Set(validate().errors);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  commitShard(outFile, entries, baselineErrors);
  console.log(`✅ 已导入 ${entries.length} 条 → ${rel(outFile)}`);
  console.log(`   条目: ${previewKeys(entries, opts.type)}`);
  console.log('   重启服务（npm start）后生效：雅思内容加载器有内存缓存，运行中不会重新读取');
}

if (require.main === module) main();
