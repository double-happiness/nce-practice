'use strict';

// 从本地新概念原声目录导入课文 LRC 原文 + MP3，供系统原声朗读。
// 默认将 MP3 复制到 public/audio/nce/（随项目分发，不依赖本机路径）。
// 用法：
//   npm run import:official -- --source "/path/to/New_Concept_English/英音"
//   npm run import:official -- --source "..." --link    # 开发机符号链接，不入库
//   npm run import:official -- --dry-run

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { parseLrc, parseFileBase, BOOK_DIRS, normSpeakLine } = require('../lib/nce-official-util');

const DEFAULT_SOURCE = path.join(__dirname, '..', '..', 'New_Concept_English', '英音');
const OUT_DIR = path.join(data.DATA_DIR, 'official');
const AUDIO_DIR = path.join(__dirname, '..', 'public', 'audio', 'nce');

function parseArgs() {
  const args = process.argv.slice(2);
  let source = DEFAULT_SOURCE;
  const si = args.indexOf('--source');
  if (si >= 0 && args[si + 1]) source = path.resolve(args[si + 1]);
  return {
    source,
    link: args.includes('--link'),
    copy: !args.includes('--link'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  };
}

function audioRel(book, lesson) {
  return `/audio/nce/b${book}-l${String(lesson).padStart(3, '0')}.mp3`;
}

function audioDest(book, lesson) {
  return path.join(AUDIO_DIR, `b${book}-l${String(lesson).padStart(3, '0')}.mp3`);
}

function ensureAudio(srcMp3, book, lesson, opts) {
  const dest = audioDest(book, lesson);
  if (!opts.copy && !opts.link) return true;
  if (!opts.force && fs.existsSync(dest) && !fs.lstatSync(dest).isSymbolicLink()) return true;
  if (opts.dryRun) return true;
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  if (opts.link) {
    fs.symlinkSync(path.resolve(srcMp3), dest);
  } else {
    fs.copyFileSync(srcMp3, dest);
  }
  return true;
}

function importBook(book, sourceRoot, opts) {
  const dirName = BOOK_DIRS[book];
  if (!dirName) return [];
  const dir = path.join(sourceRoot, dirName);
  if (!fs.existsSync(dir)) {
    console.warn(`  [book ${book}] 目录不存在: ${dir}`);
    return [];
  }
  const entries = [];
  const files = fs.readdirSync(dir).filter((f) => /\.mp3$/i.test(f));
  for (const mp3 of files.sort()) {
    const base = mp3.replace(/\.mp3$/i, '');
    const parsed = parseFileBase(book, base);
    if (!parsed) {
      console.warn(`  [book ${book}] 无法解析文件名: ${mp3}`);
      continue;
    }
    const { lesson } = parsed;
    const lrcPath = path.join(dir, base + '.lrc');
    const lrcAlt = path.join(dir, base + '.LRC');
    const lrcFile = fs.existsSync(lrcPath) ? lrcPath : (fs.existsSync(lrcAlt) ? lrcAlt : null);
    let lrc = { title: base, lines: [], en: '' };
    if (lrcFile) {
      const raw = fs.readFileSync(lrcFile, 'utf8');
      lrc = parseLrc(raw);
      if (!lrc.title) lrc.title = base.replace(/^\d+-?/, '').replace(/^[－\-—\s]+/, '').trim();
    }
    const srcMp3 = path.join(dir, mp3);
    ensureAudio(srcMp3, book, lesson, opts);
    entries.push({
      book,
      lesson,
      title: lrc.title || base,
      audio: audioRel(book, lesson),
      lines: lrc.lines,
      en: lrc.en,
      cn: '',
    });
  }
  return entries;
}

function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.source)) {
    console.error('源目录不存在:', opts.source);
    console.error('请指定: npm run import:official -- --source "/path/to/英音"');
    process.exit(1);
  }

  console.log('源目录:', opts.source);
  console.log('音频:', opts.link ? '符号链接（仅开发）' : '复制到 public/audio/nce/');
  if (opts.dryRun) console.log('(dry-run)');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const all = [];
  for (const book of [1, 2, 3, 4]) {
    const list = importBook(book, opts.source, opts);
    console.log(`  第 ${book} 册: ${list.length} 课`);
    all.push(...list);
  }

  if (!opts.dryRun) {
    const shard = path.join(OUT_DIR, 'passages.json');
    fs.writeFileSync(shard, JSON.stringify(all, null, 2) + '\n');
    console.log('写入', shard, '共', all.length, '课');

    const segIndex = {};
    for (const e of all) {
      const key = `${e.book}-${e.lesson}`;
      segIndex[key] = [];
      for (let i = 0; i < e.lines.length; i++) {
        const line = e.lines[i];
        const next = e.lines[i + 1];
        const n = normSpeakLine(line.en);
        if (!n) continue;
        segIndex[key].push({
          n,
          audio: e.audio,
          start: line.t,
          end: next ? next.t : line.t + 5,
        });
      }
    }
    const segPath = path.join(__dirname, '..', 'public', 'audio', 'official-segments.json');
    fs.writeFileSync(segPath, JSON.stringify(segIndex) + '\n');
    console.log('写入', segPath);
  } else {
    console.log('将写入', all.length, '课');
  }
}

main();
