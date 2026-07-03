'use strict';
// 单词间隔复习：SRS key 形如 w:hello

const { normKey } = require('./dict');
const { findEntry, buildLookupDict } = require('./wordlookup');

const PREFIX = 'w:';

function isWordKey(id) {
  return String(id || '').startsWith(PREFIX);
}

function wordKey(key) {
  return PREFIX + normKey(key);
}

function parseWordKey(id) {
  if (!isWordKey(id)) return null;
  return normKey(id.slice(PREFIX.length));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildMcqOptions(entry) {
  const used = new Set([entry.cn]);
  const opts = [entry.cn];
  const pool = shuffle(buildLookupDict().filter((e) => e.key !== entry.key && e.cn));
  for (const e of pool) {
    if (used.has(e.cn)) continue;
    used.add(e.cn);
    opts.push(e.cn);
    if (opts.length >= 4) break;
  }
  while (opts.length < 4) opts.push('（无）');
  return shuffle(opts);
}

function wordQuestion(entry, id) {
  const src =
    entry.source === 'global'
      ? (entry.bandLabel || '全局词库')
      : entry.lesson
        ? `L${entry.lesson}`
        : '单词';
  return {
    id,
    type: 'mcq',
    book: entry.book || 0,
    lesson: entry.lesson || 0,
    lessonTitle: src,
    grammar: ['单词'],
    stem: `【单词】${entry.word}${entry.pos ? ` (${entry.pos})` : ''} 的中文意思是？`,
    options: buildMcqOptions(entry),
  };
}

function gradeWord(entry, response) {
  return response != null && String(response).trim() === String(entry.cn).trim();
}

function resolve(id) {
  const key = parseWordKey(id);
  if (!key) return null;
  const entry = findEntry(key);
  if (!entry || !entry.cn) return null;
  return { entry, id };
}

module.exports = {
  PREFIX,
  isWordKey,
  wordKey,
  parseWordKey,
  wordQuestion,
  gradeWord,
  resolve,
};
