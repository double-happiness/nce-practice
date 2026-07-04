'use strict';
// 词条 → 课内出现、课次 → 课程 索引（供词典详情等查询）

const { normKey } = require('./dict');

let hitsByKey = null;
let lessonByKey = null;

function rebuild() {
  const data = require('./data');
  hitsByKey = new Map();
  lessonByKey = new Map();
  for (const l of data.getLessons()) {
    lessonByKey.set(`${l.book}-${l.lesson}`, l);
    for (const w of l.words || []) {
      const k = normKey(w.word);
      if (!k) continue;
      if (!hitsByKey.has(k)) hitsByKey.set(k, []);
      hitsByKey.get(k).push({
        word: w.word,
        phon: w.phon || '',
        pos: w.pos || '',
        cn: w.cn || '',
        eg: w.eg || '',
        book: l.book,
        lesson: l.lesson,
        lessonTitle: l.title || '',
      });
    }
  }
}

function ensure() {
  if (!hitsByKey) rebuild();
}

function getHits(word) {
  ensure();
  return hitsByKey.get(normKey(word)) || [];
}

function getLesson(book, lesson) {
  ensure();
  return lessonByKey.get(`${book}-${lesson}`) || null;
}

function invalidateWordIndex() {
  hitsByKey = null;
  lessonByKey = null;
}

module.exports = { getHits, getLesson, rebuild, invalidateWordIndex };
