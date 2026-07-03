'use strict';

// 背单词 / 单词记忆 / 默写 —— 累计去重词表 + 掌握度持久化
const express = require('express');
const path = require('path');
const data = require('../lib/data');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

const profile = require('../lib/profile');

// 归一化 word：去首尾空格 + 转小写，作为去重键与掌握度键
function normKey(w) {
  return String(w == null ? '' : w).trim().toLowerCase();
}

// 累计去重词表：遍历所有课程的 words，按归一化 word 去重，只保留首次出现的那条，
// 并记录首现的 lesson/lessonTitle。跳过空 word。
function buildDict() {
  const lessons = data.getLessons();
  const seen = new Set();
  const out = [];
  for (const l of lessons) {
    for (const w of l.words || []) {
      const key = normKey(w.word);
      if (!key) continue; // 跳过空 word
      if (seen.has(key)) continue; // 只保留首次出现
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
  return out;
}

// 掌握度持久化：{ states: { [word小写]: { level, correct, wrong, ts } } }
function loadStates() {
  const v = readJSON(profile.file('words.json'), { states: {} });
  if (!v || typeof v.states !== 'object' || v.states === null) return { states: {} };
  return v;
}
function saveStates(v) {
  writeJSONAtomic(profile.file('words.json'), v);
}
function levelOf(states, key) {
  const s = states[key];
  return s && typeof s.level === 'number' ? s.level : 0;
}

// 取出（或初始化）某词的 state 记录
function ensureState(states, key) {
  if (!states[key]) states[key] = { level: 0, correct: 0, wrong: 0, ts: 0 };
  return states[key];
}

// 组装对外输出（附带当前 level，剔除内部 key 字段）
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
    level: levelOf(states, e.key),
  };
}

// filter 语义：new=level0 / learning=level1-2 / mastered=level3
function matchFilter(level, filter) {
  if (filter === 'new') return level === 0;
  if (filter === 'learning') return level === 1 || level === 2;
  if (filter === 'mastered') return level === 3;
  return true; // all / 未知
}

// 按 book 过滤（book 为空则不限）
function byBook(list, book) {
  if (!book) return list;
  return list.filter((e) => String(e.book) === String(book));
}

// GET /words/list —— 去重词表（含掌握度），支持 book / filter / q
router.get('/words/list', (req, res) => {
  const { book, q } = req.query;
  const filter = req.query.filter || 'all';
  const states = loadStates().states;
  let list = byBook(buildDict(), book);

  const kw = q ? String(q).trim().toLowerCase() : '';
  if (kw) {
    list = list.filter(
      (e) => e.key.includes(kw) || String(e.cn).toLowerCase().includes(kw)
    );
  }
  list = list.filter((e) => matchFilter(levelOf(states, e.key), filter));
  list.sort((a, b) => a.lesson - b.lesson); // 按 lesson 升序

  const words = list.map((e) => decorate(e, states));
  res.json({ count: words.length, words });
});

// GET /words/stats —— 总词数 / 未学 / 学习中 / 已掌握
router.get('/words/stats', (req, res) => {
  const states = loadStates().states;
  const list = byBook(buildDict(), req.query.book);
  let newCount = 0;
  let learning = 0;
  let mastered = 0;
  for (const e of list) {
    const lv = levelOf(states, e.key);
    if (lv === 0) newCount++;
    else if (lv === 3) mastered++;
    else learning++; // level 1-2
  }
  res.json({ total: list.length, newCount, learning, mastered });
});

// POST /words/rate —— 背诵自评：known/vague/unknown
router.post('/words/rate', (req, res) => {
  const body = req.body || {};
  const key = normKey(body.word);
  if (!key) return res.status(400).json({ ok: false, error: 'word 不能为空' });
  const rating = body.rating;
  const v = loadStates();
  const s = ensureState(v.states, key);
  if (rating === 'known') s.level = Math.min(3, s.level + 1);
  else if (rating === 'unknown') s.level = 0;
  else if (rating === 'vague') {
    /* level 不变，仅更新 ts */
  } else {
    return res.status(400).json({ ok: false, error: 'rating 非法' });
  }
  s.ts = Date.now();
  saveStates(v);
  res.json({ ok: true, level: s.level });
});

// POST /words/spell —— 默写判分
router.post('/words/spell', (req, res) => {
  const body = req.body || {};
  const key = normKey(body.word);
  if (!key) return res.status(400).json({ correct: false, error: 'word 不能为空' });
  const correct = String(body.input == null ? '' : body.input).trim().toLowerCase() === key;
  const v = loadStates();
  const s = ensureState(v.states, key);
  if (correct) {
    s.correct++;
    s.level = Math.min(3, s.level + 1);
  } else {
    s.wrong++;
    s.level = Math.max(0, s.level - 1);
  }
  s.ts = Date.now();
  saveStates(v);
  res.json({ correct, answer: body.word, level: s.level });
});

// 洗牌（Fisher-Yates），随机抽词顺序
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// GET /words/study —— 抽词：new=level0 / due=level1或2 / all=全部
router.get('/words/study', (req, res) => {
  const mode = req.query.mode || 'new';
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
  const states = loadStates().states;
  let list = byBook(buildDict(), req.query.book);
  list = list.filter((e) => {
    const lv = levelOf(states, e.key);
    if (mode === 'new') return lv === 0;
    if (mode === 'due') return lv === 1 || lv === 2;
    return true; // all
  });
  const picked = shuffle(list).slice(0, limit).map((e) => decorate(e, states));
  res.json({ count: picked.length, words: picked });
});

module.exports = router;
