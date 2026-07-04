'use strict';
// 按册将官方词表（data/reference/nce-vocab-b*.json）同步进各课 words[]。
// 参考词表来源：qwerty-learner 项目 NCE_1–4 词库（开源社区整理）。
// 用法：node scripts/sync-lesson-words.js [--dry-run]

const fs = require('fs');
const path = require('path');
const { readJSON, writeJSONAtomic } = require('../lib/store');
const { normKey } = require('../lib/dict');
const { pickEgForWord, phonFromReference, buildLessonsByBook } = require('../lib/word-pick');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REF_DIR = path.join(DATA_DIR, 'reference');
const LESSONS_DIR = path.join(DATA_DIR, 'lessons');
const DRY = process.argv.includes('--dry-run');
const COMPLETE_LESSONS = { 1: 72, 2: 96, 3: 60, 4: 48 };

const POS_MAP = {
  'ad.': 'adv.', 'art.': 'art.', 'prep.': 'prep.', 'conj.': 'conj.',
  'pron.': 'pron.', 'int.': 'int.', 'interj.': 'int.', 'aux.': 'aux.',
  'det.': 'det.', 'num.': 'num.', 'abbr.': 'abbr.',
};

function loadOfficial(book) {
  const file = path.join(REF_DIR, `nce-vocab-b${book}.json`);
  const arr = readJSON(file, []);
  if (!arr.length) throw new Error(`缺少参考词表 ${file}`);
  return arr;
}

function loadLessonFiles() {
  const files = new Map();
  const base = path.join(DATA_DIR, 'lessons.json');
  files.set(base, readJSON(base, []));
  for (const f of fs.readdirSync(LESSONS_DIR)) {
    if (!f.endsWith('.json')) continue;
    files.set(path.join(LESSONS_DIR, f), readJSON(path.join(LESSONS_DIR, f), []));
  }
  return files;
}

function parseTrans(transArr) {
  const raw = (transArr && transArr[0]) ? String(transArr[0]) : '';
  const m = raw.match(/^((?:[a-z]{1,6}\.\s*)+)(.*)$/i);
  if (!m) return { pos: '', cn: raw.trim() };
  let pos = m[1].trim().split(/\s+/)[0].toLowerCase();
  if (POS_MAP[pos]) pos = POS_MAP[pos];
  return { pos, cn: m[2].trim() || raw.trim() };
}

function toPhon(entry) {
  const p = entry.ukphone || entry.usphone || '';
  if (!p) return '';
  const clean = String(p).replace(/^\/|\/$/g, '');
  return `/${clean}/`;
}

function convertEntry(entry, book, lesson, lessonsByBook) {
  const word = String(entry.name || '').trim();
  if (!word) return null;
  const { pos, cn } = parseTrans(entry.trans);
  return {
    word,
    phon: toPhon(entry) || phonFromReference(word),
    pos,
    cn,
    eg: pickEgForWord(word, book, lesson, lessonsByBook),
  };
}

function partitionOfficial(lessons, official) {
  const slices = [];
  let idx = 0;
  for (let i = 0; i < lessons.length; i++) {
    const remaining = official.length - idx;
    const left = lessons.length - i;
    const count = Math.max(1, Math.round(remaining / left));
    slices.push({ start: idx, end: Math.min(idx + count, official.length) });
    idx += count;
  }
  slices[slices.length - 1].end = official.length;
  return slices;
}

/** 课程未齐时，按课次在全书中的位置截取对应词表段 */
function officialSubset(book, lessons, official) {
  const total = COMPLETE_LESSONS[book];
  const minL = lessons[0].lesson;
  const maxL = lessons[lessons.length - 1].lesson;
  const start = Math.floor(((minL - 1) / total) * official.length);
  const end = Math.ceil((maxL / total) * official.length);
  return { subset: official.slice(start, end), start, end };
}

function mergeLessonWords(lesson, officialSlice, lessonsByBook) {
  const existing = new Map();
  for (const w of lesson.words || []) {
    const k = normKey(w.word);
    if (k) existing.set(k, w);
  }
  let added = 0;
  for (const entry of officialSlice) {
    const k = normKey(entry.name);
    if (!k || existing.has(k)) continue;
    const nw = convertEntry(entry, lesson.book, lesson.lesson, lessonsByBook);
    if (!nw) continue;
    existing.set(k, nw);
    added++;
  }
  // 保留原有词顺序，新词按官方顺序追加
  const oldKeys = (lesson.words || []).map((w) => normKey(w.word)).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const w of lesson.words || []) {
    const k = normKey(w.word);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  for (const entry of officialSlice) {
    const k = normKey(entry.name);
    if (!k || seen.has(k) || oldKeys.includes(k)) continue;
    seen.add(k);
    out.push(existing.get(k));
  }
  lesson.words = out;
  return added;
}

function main() {
  const data = require('../lib/data');
  data.reload();
  const lessonsByBook = buildLessonsByBook();
  const files = loadLessonFiles();
  const allLessons = [];
  for (const arr of files.values()) allLessons.push(...arr);
  allLessons.sort((a, b) => (a.book - b.book) || (a.lesson - b.lesson));

  const stats = { added: 0, perBook: {} };

  for (let book = 1; book <= 4; book++) {
    const official = loadOfficial(book);
    const bookLessons = allLessons.filter((l) => l.book === book);
    if (!bookLessons.length) {
      console.log(`  第${book}册: 无课程数据，跳过`);
      continue;
    }
    const need = COMPLETE_LESSONS[book];
    const partial = bookLessons.length < need;
    let pool = official;
    if (partial) {
      const { subset, start, end } = officialSubset(book, bookLessons, official);
      pool = subset;
      console.log(`  第${book}册: ${bookLessons.length}/${need} 课，按 L${bookLessons[0].lesson}–L${bookLessons[bookLessons.length - 1].lesson} 同步词表 [${start}..${end})`);
    }
    const slices = partitionOfficial(bookLessons, pool);
    let bookAdded = 0;
    bookLessons.forEach((lesson, i) => {
      const slice = pool.slice(slices[i].start, slices[i].end);
      bookAdded += mergeLessonWords(lesson, slice, lessonsByBook);
    });
    stats.perBook[book] = { lessons: bookLessons.length, official: official.length, added: bookAdded, partial };
    stats.added += bookAdded;
  }

  if (!DRY) {
    for (const [file, arr] of files.entries()) {
      writeJSONAtomic(file, arr);
    }
  }

  console.log(DRY ? '[dry-run] ' : '', '同步完成');
  for (const [b, s] of Object.entries(stats.perBook)) {
    console.log(`  第${b}册: 参考词 ${s.official}, 新增 ${s.added}`);
  }
  console.log(`  合计新增: ${stats.added}`);
}

main();
