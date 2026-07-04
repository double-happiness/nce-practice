'use strict';
// 为课内词条选取例句、从参考词表补音标

const fs = require('fs');
const path = require('path');
const { normKey } = require('./dict');
const { readJSON } = require('./store');
const { lineMatchesWord, invalidateWordMatchCache } = require('./word-match');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TEXTS = readJSON(path.join(DATA_DIR, 'lesson-texts.json'), { texts: {} }).texts || {};

let REF_PHON = null;
let ENRICH_EX = null;
let ENRICH_COLL = null;
let ARTICLES = null;
let TRANSFORMS = null;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordRe(word) {
  return new RegExp(`\\b${escapeRe(word)}\\b`, 'i');
}

function enFromGrammarExample(ex) {
  return String(ex)
    .replace(/\s*[（(][^）)]+[）)]\s*$/, '')
    .replace(/\s*（[^）]+）\s*$/, '')
    .trim();
}

function cnFromGrammarExample(ex) {
  const m = String(ex).match(/[（(]([^）)]+)[）)]\s*$/);
  return m ? m[1].trim() : '';
}

function formatEg(en, cn) {
  const line = String(en || '').trim();
  if (!line) return '';
  const c = String(cn || '').trim();
  return c ? `${line} ${c}` : line;
}

function loadRefPhon() {
  if (REF_PHON) return REF_PHON;
  const map = new Map();
  for (let book = 1; book <= 4; book++) {
    const arr = readJSON(path.join(DATA_DIR, 'reference', `nce-vocab-b${book}.json`), []);
    for (const entry of arr) {
      const k = normKey(entry.name);
      if (!k || map.has(k)) continue;
      const p = entry.ukphone || entry.usphone || '';
      if (!p) continue;
      const clean = String(p).replace(/^\/|\/$/g, '');
      map.set(k, `/${clean}/`);
    }
  }
  REF_PHON = map;
  return map;
}

function loadEnrichExamples() {
  if (ENRICH_EX) return ENRICH_EX;
  const raw = readJSON(path.join(DATA_DIR, 'word-enrich.json'), {});
  const map = new Map();
  for (const [k, v] of Object.entries(raw)) {
    const ex = (v.examples || []).find((e) => e && e.en);
    if (ex) map.set(normKey(k), ex);
  }
  ENRICH_EX = map;
  return map;
}

function loadEnrichCollocations() {
  if (ENRICH_COLL) return ENRICH_COLL;
  const raw = readJSON(path.join(DATA_DIR, 'word-enrich.json'), {});
  const map = new Map();
  for (const [k, v] of Object.entries(raw)) {
    const coll = (v.collocations || []).find((c) => c && c.en);
    if (coll) map.set(normKey(k), coll);
  }
  ENRICH_COLL = map;
  return map;
}

function loadArticles() {
  if (ARTICLES) return ARTICLES;
  const out = [];
  const dir = path.join(DATA_DIR, 'articles');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const arr = readJSON(path.join(dir, f), []);
      if (Array.isArray(arr)) out.push(...arr);
    }
  } catch (_) { /* */ }
  ARTICLES = out;
  return out;
}

function loadTransforms() {
  if (TRANSFORMS) return TRANSFORMS;
  const out = [];
  const dir = path.join(DATA_DIR, 'transforms');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const arr = readJSON(path.join(dir, f), []);
      if (Array.isArray(arr)) out.push(...arr);
    }
  } catch (_) { /* */ }
  TRANSFORMS = out;
  return out;
}

function invalidateWordPickCache() {
  REF_PHON = null;
  ENRICH_EX = null;
  ENRICH_COLL = null;
  ARTICLES = null;
  TRANSFORMS = null;
  invalidateWordMatchCache();
}

function phonFromReference(word) {
  return loadRefPhon().get(normKey(word)) || '';
}

function linesFromText(text) {
  return String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

function pickFromText(word, text, loose = false) {
  const lines = linesFromText(text);
  if (!loose) {
    const re = wordRe(word);
    return lines.find((l) => re.test(l)) || '';
  }
  return lines.find((l) => lineMatchesWord(word, l, true)) || '';
}

function pickFromArticle(lesson, word) {
  const en = lesson.article && lesson.article.en;
  if (!en) return '';
  return pickFromText(word, en);
}

function pickFromGrammar(lesson, word) {
  const re = wordRe(word);
  for (const g of lesson.grammar || []) {
    for (const ex of g.examples || []) {
      const en = typeof ex === 'string' ? enFromGrammarExample(ex) : (ex.en || '');
      if (!en || !re.test(en)) continue;
      const cn = typeof ex === 'string' ? cnFromGrammarExample(ex) : (ex.cn || '');
      return formatEg(en, cn);
    }
  }
  return '';
}

function lessonsByDistance(lessons, lesson) {
  return lessons
    .slice()
    .sort((a, b) => Math.abs(a.lesson - lesson) - Math.abs(b.lesson - lesson));
}

function pickFromLessonTexts(word, entries, loose = false) {
  for (const { key } of entries) {
    const line = pickFromText(word, TEXTS[key]?.en || '', loose);
    if (line) return line;
  }
  return '';
}

function textKeysForLessons(lessons) {
  return lessons.map((l) => ({ key: `${l.book}-${l.lesson}`, lesson: l.lesson }));
}

function pickFromCrossBookArticles(word, book, loose = false) {
  const articles = loadArticles()
    .filter((a) => a && a.book !== book && a.en)
    .sort((a, b) => (a.book - b.book) || (a.lesson - b.lesson));
  for (const a of articles) {
    const line = pickFromText(word, a.en, loose);
    if (line) return line;
  }
  return '';
}

function pickFromTransforms(word, loose = false) {
  for (const t of loadTransforms()) {
    for (const step of t.steps || []) {
      if (step.kind !== 'translate') continue;
      for (const ans of step.answers || []) {
        if (!lineMatchesWord(word, ans, loose)) continue;
        return formatEg(ans, step.cn || t.cn || '');
      }
    }
  }
  return '';
}

/**
 * 为本课词条选例句：本课课文 → 同册他课课文/精读 → 本课语法 →
 * 同册课文 loose → 跨册课文 → 跨册精读 → 句型转换 → enrich 例句/搭配
 */
function pickEgForWord(word, book, lesson, lessonsByBook) {
  const re = wordRe(word);
  if (!re) return '';

  const key = `${book}-${lesson}`;
  const text = TEXTS[key]?.en || '';
  const fromLesson = pickFromText(word, text);
  if (fromLesson) return fromLesson;

  const lessons = lessonsByBook.get(book) || [];
  const current = lessons.find((l) => l.lesson === lesson);

  if (current) {
    const fromArticle = pickFromArticle(current, word);
    if (fromArticle) return fromArticle;
    const fromGrammar = pickFromGrammar(current, word);
    if (fromGrammar) return fromGrammar;
  }

  const others = lessons
    .filter((l) => l.lesson !== lesson)
    .sort((a, b) => Math.abs(a.lesson - lesson) - Math.abs(b.lesson - lesson));

  for (const l of others) {
    const lk = `${l.book}-${l.lesson}`;
    const line = pickFromText(word, TEXTS[lk]?.en || '');
    if (line) return line;
    const art = pickFromArticle(l, word);
    if (art) return art;
  }

  for (const l of others) {
    const g = pickFromGrammar(l, word);
    if (g) return g;
  }

  // 同册课文 loose（按课次距离优先）
  const sameBookKeys = textKeysForLessons(lessonsByDistance(lessons, lesson));
  const fromSameBookLoose = pickFromLessonTexts(word, sameBookKeys, true);
  if (fromSameBookLoose) return fromSameBookLoose;

  // 跨册课文：先 strict 后 loose
  for (let b = 1; b <= 4; b++) {
    if (b === book) continue;
    const crossKeys = textKeysForLessons(lessonsByBook.get(b) || []);
    const line = pickFromLessonTexts(word, crossKeys, false);
    if (line) return line;
  }
  for (let b = 1; b <= 4; b++) {
    if (b === book) continue;
    const crossKeys = textKeysForLessons(lessonsByBook.get(b) || []);
    const line = pickFromLessonTexts(word, crossKeys, true);
    if (line) return line;
  }

  const fromArticlesStrict = pickFromCrossBookArticles(word, book, false);
  if (fromArticlesStrict) return fromArticlesStrict;
  const fromArticlesLoose = pickFromCrossBookArticles(word, book, true);
  if (fromArticlesLoose) return fromArticlesLoose;

  const fromTfStrict = pickFromTransforms(word, false);
  if (fromTfStrict) return fromTfStrict;
  const fromTfLoose = pickFromTransforms(word, true);
  if (fromTfLoose) return fromTfLoose;

  const enrichEx = loadEnrichExamples().get(normKey(word));
  if (enrichEx) return formatEg(enrichEx.en, enrichEx.cn);

  const enrichColl = loadEnrichCollocations().get(normKey(word));
  if (enrichColl) return formatEg(enrichColl.en, enrichColl.cn);

  return '';
}

function buildLessonsByBook() {
  const data = require('./data');
  const map = new Map();
  for (const l of data.getLessons()) {
    if (!map.has(l.book)) map.set(l.book, []);
    map.get(l.book).push(l);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.lesson - b.lesson);
  }
  return map;
}

module.exports = {
  pickEgForWord,
  phonFromReference,
  buildLessonsByBook,
  invalidateWordPickCache,
  formatEg,
  pickFromText,
  pickFromCrossBookArticles,
  pickFromTransforms,
};
