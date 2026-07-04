'use strict';

const express = require('express');
const data = require('../lib/data');
const { normKey } = require('../lib/dict');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

const profile = require('../lib/profile');

function loadVocab() {
  const v = readJSON(profile.file('vocab.json'), { stars: [] });
  if (!v || !Array.isArray(v.stars)) return { stars: [] };
  return v;
}
function saveVocab(v) {
  writeJSONAtomic(profile.file('vocab.json'), v);
}

function dedupeStars(stars) {
  const seen = new Set();
  const out = [];
  for (const s of stars) {
    const k = normKey(s.word);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

// 把所有课的 words 拍平，附带 lesson/book/title 引用
function flattenWords(book) {
  const lessons = data.getLessons();
  const out = [];
  for (const l of lessons) {
    if (book && String(l.book) !== String(book)) continue;
    for (const w of l.words || []) {
      out.push({
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
  return out;
}

// 只保留收藏本需要的字段
function pickStar(o) {
  return {
    word: o.word,
    phon: o.phon || '',
    pos: o.pos || '',
    cn: o.cn || '',
    eg: o.eg || '',
    book: o.book,
    lesson: o.lesson,
  };
}

// GET /vocab/words?book=1 —— 全部单词（拍平，含课内重复）
router.get('/vocab/words', (req, res) => {
  const words = flattenWords(req.query.book);
  res.json({ count: words.length, words });
});

// GET /vocab/stars —— 收藏列表
router.get('/vocab/stars', (req, res) => {
  const v = loadVocab();
  v.stars = dedupeStars(v.stars);
  res.json({ count: v.stars.length, words: v.stars });
});

// POST /vocab/star —— 加入收藏（按 normKey 去重）
router.post('/vocab/star', (req, res) => {
  const body = req.body || {};
  if (!body.word) return res.status(400).json({ ok: false, error: 'word 不能为空' });
  const key = normKey(body.word);
  const v = loadVocab();
  v.stars = dedupeStars(v.stars);
  if (!v.stars.some((s) => normKey(s.word) === key)) {
    v.stars.push(pickStar(body));
    saveVocab(v);
  }
  res.json({ ok: true, count: v.stars.length });
});

// POST /vocab/unstar —— 移除收藏
router.post('/vocab/unstar', (req, res) => {
  const word = req.body && req.body.word;
  if (!word) return res.status(400).json({ ok: false, error: 'word 不能为空' });
  const key = normKey(word);
  const v = loadVocab();
  v.stars = v.stars.filter((s) => normKey(s.word) !== key);
  saveVocab(v);
  res.json({ ok: true, count: v.stars.length });
});

module.exports = router;
