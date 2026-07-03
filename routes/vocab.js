'use strict';

const express = require('express');
const path = require('path');
const data = require('../lib/data');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

const profile = require('../lib/profile');

// 读取收藏本，结构 { stars: [ {word, phon, pos, cn, eg, book, lesson} ] }
function loadVocab() {
  const v = readJSON(profile.file('vocab.json'), { stars: [] });
  if (!v || !Array.isArray(v.stars)) return { stars: [] };
  return v;
}
function saveVocab(v) {
  writeJSONAtomic(profile.file('vocab.json'), v);
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

// GET /vocab/words?book=1 —— 全部单词（拍平）
router.get('/vocab/words', (req, res) => {
  const words = flattenWords(req.query.book);
  res.json({ count: words.length, words });
});

// GET /vocab/stars —— 收藏列表
router.get('/vocab/stars', (req, res) => {
  const v = loadVocab();
  res.json({ count: v.stars.length, words: v.stars });
});

// POST /vocab/star —— 加入收藏（按 word 去重）
router.post('/vocab/star', (req, res) => {
  const body = req.body || {};
  if (!body.word) return res.status(400).json({ ok: false, error: 'word 不能为空' });
  const v = loadVocab();
  if (!v.stars.some((s) => s.word === body.word)) {
    v.stars.push(pickStar(body));
    saveVocab(v);
  }
  res.json({ ok: true, count: v.stars.length });
});

// POST /vocab/unstar —— 移除收藏
router.post('/vocab/unstar', (req, res) => {
  const word = req.body && req.body.word;
  if (!word) return res.status(400).json({ ok: false, error: 'word 不能为空' });
  const v = loadVocab();
  v.stars = v.stars.filter((s) => s.word !== word);
  saveVocab(v);
  res.json({ ok: true, count: v.stars.length });
});

module.exports = router;
