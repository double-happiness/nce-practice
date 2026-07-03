'use strict';
// 词汇量测试共用逻辑：分层抽样、选项生成、猜中基线剔除、历次成绩持久化
// 供 routes/listenvocab.js（听力）与 routes/readvocab.js（阅读）复用

const express = require('express');
const profile = require('./profile');
const { buildDict, normKey } = require('./dict');
const { readJSON, writeJSONAtomic } = require('./store');

const BAND_COUNT = 3;
const OPTION_COUNT = 4;
const BAND_LABELS = ['前段（入门词）', '中段（进阶词）', '后段（较难词）'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitBands(dict) {
  const sorted = dict.slice().sort((a, b) => a.lesson - b.lesson);
  const per = Math.ceil(sorted.length / BAND_COUNT);
  const bands = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const words = sorted.slice(i * per, (i + 1) * per);
    if (!words.length) continue;
    bands.push({
      band: i,
      label: BAND_LABELS[i] || `第 ${i + 1} 段`,
      lessonMin: words[0].lesson,
      lessonMax: words[words.length - 1].lesson,
      total: words.length,
      words,
    });
  }
  return bands;
}

function buildOptions(entry, dict) {
  const used = new Set([entry.cn]);
  const pick = [];
  const samePos = shuffle(dict.filter((e) => e.key !== entry.key && e.pos === entry.pos && e.cn && !used.has(e.cn)));
  for (const e of samePos) {
    if (pick.length >= OPTION_COUNT - 1) break;
    if (used.has(e.cn)) continue;
    used.add(e.cn);
    pick.push(e.cn);
  }
  if (pick.length < OPTION_COUNT - 1) {
    for (const e of shuffle(dict)) {
      if (pick.length >= OPTION_COUNT - 1) break;
      if (e.key === entry.key || !e.cn || used.has(e.cn)) continue;
      used.add(e.cn);
      pick.push(e.cn);
    }
  }
  return shuffle([entry.cn, ...pick]);
}

function adjustedAccuracy(correct, asked) {
  if (!asked) return 0;
  const p = correct / asked;
  const guess = 1 / OPTION_COUNT;
  return Math.max(0, (p - guess) / (1 - guess));
}

// 返回词表足够出题的册别列表（供前端册别下拉）
function listAvailableBooks() {
  const books = [];
  for (let b = 1; b <= 4; b++) {
    const total = buildDict(String(b)).length;
    if (total >= OPTION_COUNT * 3) books.push({ id: String(b), total });
  }
  return books;
}

function createRouter({ dataKey, apiPrefix, label }) {
  const router = express.Router();

  function loadTests() {
    const v = readJSON(profile.file(`${dataKey}.json`), { tests: [] });
    if (!v || !Array.isArray(v.tests)) return { tests: [] };
    return v;
  }
  function saveTests(v) {
    writeJSONAtomic(profile.file(`${dataKey}.json`), v);
  }

  router.get(`/${apiPrefix}/books`, (req, res) => {
    res.json({ books: listAvailableBooks() });
  });

  router.get(`/${apiPrefix}/sample`, (req, res) => {
    const book = req.query.book || '1';
    const size = Math.min(60, Math.max(6, parseInt(req.query.size, 10) || 24));
    const dict = buildDict(book);
    if (dict.length < OPTION_COUNT * 3) {
      return res.status(400).json({ error: `该册收录单词还太少，暂无法进行${label}词汇量测试` });
    }
    const bands = splitBands(dict);
    const per = Math.ceil(size / bands.length);
    let items = [];
    for (const b of bands) {
      items = items.concat(
        shuffle(b.words)
          .slice(0, Math.min(per, b.words.length))
          .map((e) => ({
            word: e.word,
            phon: e.phon,
            pos: e.pos,
            band: b.band,
            options: buildOptions(e, dict),
          }))
      );
    }
    res.json({
      count: items.length,
      dictTotal: dict.length,
      bands: bands.map((b) => ({ band: b.band, label: b.label, lessonMin: b.lessonMin, lessonMax: b.lessonMax, total: b.total })),
      items: shuffle(items),
    });
  });

  router.post(`/${apiPrefix}/grade`, (req, res) => {
    const { word, chosen } = req.body || {};
    const book = (req.body && req.body.book) || '1';
    const entry = buildDict(book).find((e) => e.key === normKey(word));
    if (!entry) return res.status(404).json({ error: '单词不在词表中' });
    const correct = chosen != null && String(chosen).trim() === entry.cn;
    res.json({
      correct,
      word: entry.word,
      phon: entry.phon,
      pos: entry.pos,
      cn: entry.cn,
      eg: entry.eg,
      lesson: entry.lesson,
    });
  });

  router.post(`/${apiPrefix}/finish`, (req, res) => {
    const body = req.body || {};
    const book = body.book || '1';
    const results = Array.isArray(body.results) ? body.results : [];
    if (!results.length) return res.status(400).json({ error: 'results 不能为空' });

    const dict = buildDict(book);
    const bands = splitBands(dict);
    const report = bands.map((b) => {
      const rs = results.filter((r) => Number(r.band) === b.band);
      const asked = rs.length;
      const correct = rs.filter((r) => r.correct).length;
      const est = Math.round(adjustedAccuracy(correct, asked) * b.total);
      return { band: b.band, label: b.label, lessonMin: b.lessonMin, lessonMax: b.lessonMax, total: b.total, asked, correct, est };
    });
    const estimate = Math.min(dict.length, report.reduce((n, b) => n + b.est, 0));
    const correct = results.filter((r) => r.correct).length;

    const db = loadTests();
    db.tests.push({
      ts: Date.now(),
      book: Number(book) || book,
      asked: results.length,
      correct,
      estimate,
      dictTotal: dict.length,
      bands: report,
    });
    if (db.tests.length > 50) db.tests = db.tests.slice(-50);
    saveTests(db);

    res.json({ estimate, dictTotal: dict.length, asked: results.length, correct, bands: report });
  });

  router.get(`/${apiPrefix}/history`, (req, res) => {
    const book = req.query.book;
    let tests = loadTests().tests.slice().reverse();
    if (book) tests = tests.filter((t) => String(t.book) === String(book));
    res.json({ count: tests.length, tests: tests.slice(0, 10) });
  });

  return router;
}

module.exports = { createRouter, listAvailableBooks, BAND_COUNT, OPTION_COUNT, splitBands, buildOptions, adjustedAccuracy };
