'use strict';

// 文本批量导入的共用部分（被 import.js / import-transforms.js 使用）：
// 草稿分块解析、命令行参数解析、输出文件检查、写盘 + 全量校验 + 失败回滚

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { writeJSONAtomic } = require('../lib/store');
const { validate } = require('./validate');

function splitList(s) {
  return String(s)
    .split(/[,，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function fail(lineNo, msg) {
  return new Error(`第 ${lineNo} 行: ${msg}`);
}

// 查重用的归一化：小写 + 合并空白
function normText(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

// 把草稿文本切成「条目块」，每块附带当时的公共字段快照。
// # 行设置 book/lesson/grammar，对后续条目生效；空行分隔条目。
function parseBlocks(text) {
  const ctx = { book: null, lesson: null, grammar: [] };
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (cur.length) blocks.push({ lines: cur, ctx: { ...ctx, grammar: [...ctx.grammar] } });
    cur = [];
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const no = i + 1;
    if (!line) return flush();
    if (line.startsWith('#')) {
      flush();
      const pairs = [...line.slice(1).matchAll(/(\w+)\s*=\s*(\S+)/g)];
      if (!pairs.length) throw fail(no, '# 行里没有 key=value 公共字段');
      for (const [, k, v] of pairs) {
        if (k === 'book') ctx.book = Number(v);
        else if (k === 'lesson') ctx.lesson = Number(v);
        else if (k === 'grammar') ctx.grammar = splitList(v);
        else throw fail(no, `未知公共字段 "${k}"（支持 book / lesson / grammar）`);
      }
      return;
    }
    cur.push({ no, text: line });
  });
  flush();
  return blocks;
}

// 命令行参数：<草稿.txt> [--out 批次名] [--dry-run] [--force]
// 解析失败时打印用法并退出
function parseArgs(argv, usage) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    usage();
    process.exit(argv.length ? 0 : 1);
  }
  const outIdx = argv.indexOf('--out');
  const outName = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (outIdx >= 0 && (!outName || outName.startsWith('--'))) {
    console.error('❌ --out 后面需要跟批次名');
    process.exit(1);
  }
  const input = argv.find((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
  if (!input) {
    console.error('❌ 缺少草稿文件参数');
    usage();
    process.exit(1);
  }
  return {
    input,
    name: outName || path.basename(input).replace(/\.[^.]*$/, ''),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  };
}

// 批次名合法性 + 目标分片不存在检查，返回输出文件完整路径
function resolveOutFile(dir, name) {
  if (!/^[\w.-]+$/.test(name)) {
    console.error(`❌ 批次名 "${name}" 只能包含字母、数字、下划线、点、连字符`);
    process.exit(1);
  }
  const outFile = path.join(dir, `${name}.json`);
  if (fs.existsSync(outFile)) {
    console.error(`❌ ${path.relative(process.cwd(), outFile)} 已存在，换个批次名（--out xxx）`);
    process.exit(1);
  }
  return outFile;
}

function readDraft(input) {
  try {
    return fs.readFileSync(input, 'utf8');
  } catch (e) {
    console.error(`❌ 读不到草稿文件 ${input}: ${e.message}`);
    process.exit(1);
  }
}

// 写盘 → 全量校验 → 相比 baseline 出现新错误则删除文件回滚
function commitShard(outFile, items, baselineErrors) {
  writeJSONAtomic(outFile, items);
  data.reload();
  const newErrors = validate().errors.filter((e) => !baselineErrors.has(e));
  if (newErrors.length) {
    fs.unlinkSync(outFile);
    data.reload();
    newErrors.forEach((e) => console.error('❌ ' + e));
    console.error('\n导入后校验出现新错误，已回滚（文件未保留）');
    process.exit(1);
  }
}

module.exports = { splitList, fail, normText, parseBlocks, parseArgs, resolveOutFile, readDraft, commitShard };
