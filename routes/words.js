'use strict';

// 背单词 / 单词记忆 / 默写 —— 累计去重词表 + 掌握度持久化
const express = require('express');
const profile = require('../lib/profile');
const activity = require('../lib/activity');
const { buildDict, normKey } = require('../lib/dict');
const { search, buildLookupDict } = require('../lib/wordlookup');
const { getWordDetail } = require('../lib/word-detail');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

function loadWords() {
  let v = readJSON(profile.file('words.json'), { states: {}, extras: {} });
  if (!v || typeof v.states !== 'object' || v.states === null) {
    v = { states: {}, extras: {} };
  }
  if (!v.extras || typeof v.extras !== 'object') v.extras = {};
  return v;
}
function saveWords(v) {
  writeJSONAtomic(profile.file('words.json'), v);
}
function levelOf(states, key) {
  const s = states[key];
  return s && typeof s.level === 'number' ? s.level : 0;
}
function ensureState(states, key) {
  if (!states[key]) states[key] = { level: 0, correct: 0, wrong: 0, ts: 0 };
  return states[key];
}

function saveExtra(v, key, meta) {
  if (!meta || !meta.cn) return;
  v.extras[key] = {
    word: meta.word || key,
    phon: meta.phon || '',
    pos: meta.pos || '',
    cn: meta.cn,
    eg: meta.eg || '',
    book: meta.book,
    lesson: meta.lesson,
    lessonTitle: meta.lessonTitle || '',
    band: meta.band,
    bandLabel: meta.bandLabel || '',
    source: meta.source || 'extra',
  };
}

function mergedList(book) {
  let list = buildLookupDict();
  if (book) list = list.filter((e) => e.source !== 'textbook' || String(e.book) === String(book));
  return list;
}

function decorate(e, states) {
  return {
    word: e.word,
    phon: e.phon,
    pos: e.pos,
    cn: e.cn,
    eg: e.eg,
    book: e.book,
    lesson: e.lesson,
    lessonTitle: e.lessonTitle,
    band: e.band,
    bandLabel: e.bandLabel,
    source: e.source,
    level: levelOf(states, e.key),
  };
}

function matchFilter(level, filter) {
  if (filter === 'new') return level === 0;
  if (filter === 'learning') return level === 1 || level === 2;
  if (filter === 'mastered') return level === 3;
  return true;
}

// GET /words/list —— 检索（教材 + 全局 + extras），支持 scope= all|textbook|global
router.get('/words/list', (req, res) => {
  const { book, q } = req.query;
  const filter = req.query.filter || 'all';
  const scope = req.query.scope || 'all';
  const states = loadWords().states;
  let list = search({ q, book, scope });
  list = list.filter((e) => matchFilter(levelOf(states, e.key), filter));
  const words = list.map((e) => decorate(e, states));
  res.json({ count: words.length, words });
});

// GET /words/detail —— 词条详情：搭配、课内句型、多条例句
router.get('/words/detail', (req, res) => {
  const word = req.query.word || req.query.q || '';
  const detail = getWordDetail(word);
  if (!detail) return res.status(404).json({ ok: false, error: '未找到该词' });
  res.json(detail);
});

// GET /words/stats
router.get('/words/stats', (req, res) => {
  const states = loadWords().states;
  const list = mergedList(req.query.book);
  let newCount = 0;
  let learning = 0;
  let mastered = 0;
  for (const e of list) {
    const lv = levelOf(states, e.key);
    if (lv === 0) newCount++;
    else if (lv === 3) mastered++;
    else learning++;
  }
  res.json({ total: list.length, newCount, learning, mastered });
});

// POST /words/rate
router.post('/words/rate', (req, res) => {
  const body = req.body || {};
  const key = normKey(body.word);
  if (!key) return res.status(400).json({ ok: false, error: 'word 不能为空' });
  const rating = body.rating;
  const v = loadWords();
  const s = ensureState(v.states, key);
  let correct = false;
  if (rating === 'known') {
    s.level = Math.min(3, s.level + 1);
    correct = true;
  } else if (rating === 'unknown') s.level = 0;
  else if (rating === 'vague') { /* keep */ }
  else return res.status(400).json({ ok: false, error: 'rating 非法' });
  s.ts = Date.now();
  if (body.cn) saveExtra(v, key, body);
  saveWords(v);
  activity.record(correct, 'words');
  res.json({ ok: true, level: s.level });
});

// POST /words/mark-missed
router.post('/words/mark-missed', (req, res) => {
  const body = req.body || {};
  const raw = Array.isArray(body.words) ? body.words : [];
  if (!raw.length) return res.status(400).json({ ok: false, error: 'words 不能为空' });
  const v = loadWords();
  let marked = 0;
  const ts = Date.now();
  for (const item of raw) {
    const word = typeof item === 'string' ? item : item.word;
    const key = normKey(word);
    if (!key) continue;
    const s = ensureState(v.states, key);
    if (s.level < 1) {
      s.level = 1;
      marked++;
    }
    s.ts = ts;
    if (typeof item === 'object' && item.cn) {
      saveExtra(v, key, {
        word: item.word || word,
        phon: item.phon,
        pos: item.pos,
        cn: item.cn,
        eg: item.eg,
        lesson: item.lesson,
        lessonTitle: item.lessonTitle,
        book: item.book != null ? item.book : body.book,
        band: item.band,
        bandLabel: item.bandLabel,
        source: item.source || 'vocab-test',
      });
    }
  }
  saveWords(v);
  res.json({ ok: true, marked, total: raw.length });
});

// POST /words/spell
router.post('/words/spell', (req, res) => {
  const body = req.body || {};
  const key = normKey(body.word);
  if (!key) return res.status(400).json({ correct: false, error: 'word 不能为空' });
  const correct = String(body.input == null ? '' : body.input).trim().toLowerCase() === key;
  const v = loadWords();
  const s = ensureState(v.states, key);
  if (correct) {
    s.correct++;
    s.level = Math.min(3, s.level + 1);
  } else {
    s.wrong++;
    s.level = Math.max(0, s.level - 1);
  }
  s.ts = Date.now();
  saveWords(v);
  activity.record(correct, 'words');
  res.json({ correct, answer: body.word, level: s.level });
});

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// GET /words/study
router.get('/words/study', (req, res) => {
  const mode = req.query.mode || 'new';
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
  const states = loadWords().states;
  let list = mergedList(req.query.book);
  list = list.filter((e) => {
    const lv = levelOf(states, e.key);
    if (mode === 'new') return lv === 0;
    if (mode === 'due') return lv === 1 || lv === 2;
    return true;
  });
  const picked = shuffle(list).slice(0, limit).map((e) => decorate(e, states));
  res.json({ count: picked.length, words: picked });
});

module.exports = router;
