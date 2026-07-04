'use strict';
// 累计去重词表：routes/words.js（背单词）、routes/listenvocab.js（听力词汇量）、
// routes/readvocab.js（阅读词汇量）共用，保证「词汇总量」口径一致。

// 归一化 word：去首尾空格 + 转小写，作为去重键与掌握度键
function normKey(w) {
  return String(w == null ? '' : w).trim().toLowerCase();
}

let dictCacheAll = null;
const dictCacheByBook = new Map();

function invalidateDictCache() {
  dictCacheAll = null;
  dictCacheByBook.clear();
}

// 遍历所有课程的 words，按归一化 word 去重，只保留首次出现的那条，
// 并记录首现的 lesson/lessonTitle。跳过空 word。book 为空则不限册。
function buildDict(book) {
  const data = require('./data');
  const cacheKey = book ? String(book) : '__all__';
  if (book) {
    if (dictCacheByBook.has(cacheKey)) return dictCacheByBook.get(cacheKey);
  } else if (dictCacheAll) {
    return dictCacheAll;
  }

  const seen = new Set();
  const out = [];
  for (const l of data.getLessons()) {
    if (book && String(l.book) !== String(book)) continue;
    for (const w of l.words || []) {
      const key = normKey(w.word);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        word: w.word,
        key,
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

  if (book) dictCacheByBook.set(cacheKey, out);
  else dictCacheAll = out;
  return out;
}

module.exports = { buildDict, normKey, invalidateDictCache };
