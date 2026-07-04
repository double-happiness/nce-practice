'use strict';

// 从本地新概念 LRC 字幕导入教材原文到 data/lesson-texts.json（📖 教材原文标签）
// 用法：
//   npm run import:lesson-texts
//   npm run import:lesson-texts -- --source "/path/to/New_Concept_English/英音"
//   npm run import:lesson-texts -- --force   # 覆盖已有条目（保留原 cn）
//   npm run import:lesson-texts -- --dry-run

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { parseLrc, parseFileBase, BOOK_DIRS } = require('../lib/nce-official-util');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const DEFAULT_SOURCE = path.join(__dirname, '..', '..', 'New_Concept_English', '英音');
const OUT_FILE = path.join(data.DATA_DIR, 'lesson-texts.json');

function parseArgs() {
  const args = process.argv.slice(2);
  let source = DEFAULT_SOURCE;
  const si = args.indexOf('--source');
  if (si >= 0 && args[si + 1]) source = path.resolve(args[si + 1]);
  return {
    source,
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
  };
}

function importBook(book, sourceRoot) {
  const dirName = BOOK_DIRS[book];
  if (!dirName) return [];
  const dir = path.join(sourceRoot, dirName);
  if (!fs.existsSync(dir)) {
    console.warn(`  [第 ${book} 册] 目录不存在: ${dir}`);
    return [];
  }
  const out = [];
  const files = fs.readdirSync(dir).filter((f) => /\.lrc$/i.test(f)).sort();
  for (const file of files) {
    const base = file.replace(/\.lrc$/i, '');
    const parsed = parseFileBase(book, base);
    if (!parsed) {
      console.warn(`  [第 ${book} 册] 无法解析: ${file}`);
      continue;
    }
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const lrc = parseLrc(raw);
    if (!lrc.en || !lrc.en.trim()) {
      console.warn(`  [第 ${book} 册] L${parsed.lesson} 无英文正文: ${file}`);
      continue;
    }
    out.push({ book, lesson: parsed.lesson, en: lrc.en.trim() });
  }
  return out;
}

function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.source)) {
    console.error('源目录不存在:', opts.source);
    console.error('用法: npm run import:lesson-texts -- --source "/path/to/英音"');
    process.exit(1);
  }

  const store = readJSON(OUT_FILE, { texts: {} });
  if (!store.texts) store.texts = {};

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const ts = Date.now();

  console.log('源目录:', opts.source);
  if (opts.dryRun) console.log('(dry-run)');

  for (const book of [1, 2, 3, 4]) {
    const list = importBook(book, opts.source);
    console.log(`  第 ${book} 册: ${list.length} 个 LRC`);
    for (const { book: b, lesson, en } of list) {
      const key = `${b}-${lesson}`;
      const existing = store.texts[key];
      if (existing && existing.en && !opts.force) {
        skipped++;
        continue;
      }
      const cn = (existing && existing.cn) || '';
      if (existing && existing.en) updated++;
      else added++;
      if (!opts.dryRun) {
        store.texts[key] = { en, cn, ts };
      }
    }
  }

  if (!opts.dryRun) {
    writeJSONAtomic(OUT_FILE, store);
  }

  const total = Object.keys(store.texts).length;
  console.log(`完成: 新增 ${added}，更新 ${updated}，跳过 ${skipped}（已有）`);
  console.log(opts.dryRun ? `将共有 ${total} 课教材原文` : `已写入 ${OUT_FILE}，共 ${total} 课`);
}

main();
