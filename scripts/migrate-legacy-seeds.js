'use strict';

// 将 data/questions.json 中剩余种子题迁入分片，修正 lessonTitle，并按题干去重
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data', 'questions.json');
const QUESTIONS_DIR = path.join(ROOT, 'data', 'questions');
const LESSONS_PATH = path.join(ROOT, 'data', 'lessons.json');

const LEGACY_FILES = {
  1: 'b1-legacy-seeds.json',
  2: 'b2-legacy-seeds.json',
  3: 'b3-legacy-seeds.json',
};

function normStem(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function loadLessons() {
  const titleMap = new Map();
  const base = JSON.parse(fs.readFileSync(LESSONS_PATH, 'utf8'));
  for (const l of base) {
    if (l.book != null && l.lesson != null) titleMap.set(`${l.book}-${l.lesson}`, l.title || '');
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'data', 'lessons'))) {
    if (!f.endsWith('.json')) continue;
    const arr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lessons', f), 'utf8'));
    for (const l of arr) {
      if (l.book != null && l.lesson != null) titleMap.set(`${l.book}-${l.lesson}`, l.title || '');
    }
  }
  return titleMap;
}

function loadShardStems() {
  const stems = new Set();
  for (const f of fs.readdirSync(QUESTIONS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const arr = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, f), 'utf8'));
    if (!Array.isArray(arr)) continue;
    for (const q of arr) stems.add(normStem(q.stem));
  }
  return stems;
}

function fixTitles(questions, titleMap) {
  let fixed = 0;
  for (const q of questions) {
    const t = titleMap.get(`${q.book}-${q.lesson}`);
    if (t && q.lessonTitle !== t) {
      q.lessonTitle = t;
      fixed++;
    }
  }
  return fixed;
}

const titleMap = loadLessons();
const shardStems = loadShardStems();
const seeds = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

const byBook = { 1: [], 2: [], 3: [], 4: [] };
for (const q of seeds) {
  const book = q.book || 0;
  if (!byBook[book]) byBook[book] = [];
  byBook[book].push(q);
}

// 修正已有 legacy 分片中的 lessonTitle
for (const [book, file] of Object.entries(LEGACY_FILES)) {
  const fp = path.join(QUESTIONS_DIR, file);
  if (!fs.existsSync(fp)) continue;
  const arr = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const n = fixTitles(arr, titleMap);
  fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
  console.log(`${file}: 修正 lessonTitle ${n} 条`);
}

// 迁入 questions.json 剩余种子
for (const [book, file] of Object.entries(LEGACY_FILES)) {
  const incoming = byBook[Number(book)] || [];
  if (!incoming.length) continue;

  const fp = path.join(QUESTIONS_DIR, file);
  const existing = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : [];
  const existingIds = new Set(existing.map((q) => q.id));

  let added = 0;
  let skipped = 0;
  for (const q of incoming) {
    fixTitles([q], titleMap);
    const key = normStem(q.stem);
    if (shardStems.has(key)) {
      skipped++;
      continue;
    }
    if (existingIds.has(q.id)) {
      skipped++;
      continue;
    }
    shardStems.add(key);
    existingIds.add(q.id);
    existing.push(q);
    added++;
  }

  fs.writeFileSync(fp, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log(`B${book} 种子迁入 ${file}: +${added}，跳过 ${skipped}`);
}

fs.writeFileSync(SEED_PATH, '[]\n', 'utf8');
console.log('questions.json 已清空');
