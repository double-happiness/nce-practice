'use strict';
// 批量回填课内词条的空 eg / phon
// 用法：node scripts/backfill-word-eg.js [--dry-run]

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { normKey } = require('../lib/dict');
const { readJSON, writeJSONAtomic } = require('../lib/store');
const { pickEgForWord, phonFromReference, buildLessonsByBook } = require('../lib/word-pick');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DRY = process.argv.includes('--dry-run');

function loadLessonFiles() {
  const files = new Map();
  files.set(path.join(DATA_DIR, 'lessons.json'), readJSON(path.join(DATA_DIR, 'lessons.json'), []));
  const dir = path.join(DATA_DIR, 'lessons');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    files.set(path.join(dir, f), readJSON(path.join(dir, f), []));
  }
  return files;
}

function main() {
  data.reload();
  const lessonsByBook = buildLessonsByBook();
  const files = loadLessonFiles();
  const stats = { eg: 0, phon: 0, touched: 0 };

  for (const [filePath, lessons] of files) {
    let fileChanged = false;
    for (const lesson of lessons) {
      for (const w of lesson.words || []) {
        if (!w.word) continue;
        let changed = false;
        if (!w.eg) {
          const eg = pickEgForWord(w.word, lesson.book, lesson.lesson, lessonsByBook);
          if (eg) {
            w.eg = eg;
            stats.eg++;
            changed = true;
          }
        }
        if (!w.phon) {
          const phon = phonFromReference(w.word);
          if (phon) {
            w.phon = phon;
            stats.phon++;
            changed = true;
          }
        }
        if (changed) {
          stats.touched++;
          fileChanged = true;
        }
      }
    }
    if (fileChanged && !DRY) writeJSONAtomic(filePath, lessons);
  }

  console.log(DRY ? '[dry-run] ' : '', `回填完成：${stats.touched} 条更新（eg +${stats.eg}，phon +${stats.phon}）`);
  if (!DRY && stats.touched) {
    data.reload();
    console.log('已 reload 数据；建议运行 npm run audit:words');
  }
}

main();
