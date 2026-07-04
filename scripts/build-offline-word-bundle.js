'use strict';
// 生成 public/data/word-bundle.json —— 客户端离线词典回退数据（教材去重词表）

const fs = require('fs');
const path = require('path');
const { buildDict } = require('../lib/dict');

const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const OUT = path.join(OUT_DIR, 'word-bundle.json');
const pkg = require('../package.json');

function main() {
  const words = buildDict().map((w) => ({
    key: w.key,
    word: w.word,
    phon: w.phon || '',
    pos: w.pos || '',
    cn: w.cn || '',
    eg: w.eg || '',
    book: w.book,
    lesson: w.lesson,
    lessonTitle: w.lessonTitle || '',
  }));

  const bundle = {
    version: pkg.version || '1.0.0',
    generatedAt: new Date().toISOString(),
    count: words.length,
    words,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bundle));
  console.log(`Wrote ${words.length} words → ${OUT}`);
}

main();
