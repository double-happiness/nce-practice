'use strict';

// 将 data/questions.json 中的第一册种子题迁入分片，并按题干去重（分片已有则丢弃）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data', 'questions.json');
const OUT_PATH = path.join(ROOT, 'data', 'questions', 'b1-legacy-seeds.json');
const QUESTIONS_DIR = path.join(ROOT, 'data', 'questions');

function normStem(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function loadDir(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'b1-legacy-seeds.json') continue;
    const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

const seeds = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const shardQs = loadDir(QUESTIONS_DIR);
const shardStems = new Set(shardQs.map((q) => normStem(q.stem)));

const b1Seeds = seeds.filter((q) => q.book === 1);
const otherSeeds = seeds.filter((q) => q.book !== 1);

const migrated = [];
const skipped = [];
for (const q of b1Seeds) {
  const key = normStem(q.stem);
  if (shardStems.has(key)) {
    skipped.push(q.id);
    continue;
  }
  shardStems.add(key);
  migrated.push(q);
}

fs.writeFileSync(OUT_PATH, JSON.stringify(migrated, null, 2) + '\n', 'utf8');
fs.writeFileSync(SEED_PATH, JSON.stringify(otherSeeds, null, 2) + '\n', 'utf8');

console.log(`B1 种子题：${b1Seeds.length} 条`);
console.log(`  迁入分片：${migrated.length} → ${path.relative(ROOT, OUT_PATH)}`);
console.log(`  题干重复跳过：${skipped.length}`);
console.log(`questions.json 保留 B2/B3：${otherSeeds.length} 条`);
