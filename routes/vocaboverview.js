'use strict';

// 听/读词汇量合并概览 —— 首页卡片、结果页听读对比
const express = require('express');
const profile = require('../lib/profile');
const { readJSON } = require('../lib/store');
const { listAvailableBooks } = require('../lib/vocabtest');

const router = express.Router();

function loadTests(key) {
  const v = readJSON(profile.file(`${key}.json`), { tests: [] });
  return Array.isArray(v.tests) ? v.tests : [];
}

function bookSummary(tests, book) {
  const list = tests
    .filter((t) => String(t.book) === String(book))
    .sort((a, b) => b.ts - a.ts);
  if (!list.length) return { count: 0, latest: null, avg: null, avgN: 0 };
  const recent = list.slice(0, 3);
  const avgN = recent.length;
  const avg = Math.round(recent.reduce((s, t) => s + t.estimate, 0) / avgN);
  return { count: list.length, latest: list[0], avg, avgN };
}

function trendPoints(tests, book) {
  return tests
    .filter((t) => String(t.book) === String(book))
    .sort((a, b) => a.ts - b.ts)
    .map((t) => ({
      ts: t.ts,
      estimate: t.estimate,
      dictTotal: t.dictTotal,
      correct: t.correct,
      asked: t.asked,
    }));
}

function allTrendPoints(tests) {
  return tests
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((t) => ({
      ts: t.ts,
      estimate: t.estimate,
      dictTotal: t.dictTotal,
      correct: t.correct,
      asked: t.asked,
    }));
}

function allSummary(tests) {
  const list = tests.slice().sort((a, b) => b.ts - a.ts);
  if (!list.length) return { count: 0, latest: null, avg: null, avgN: 0 };
  const recent = list.slice(0, 3);
  const avgN = recent.length;
  const avg = Math.round(recent.reduce((s, t) => s + t.estimate, 0) / avgN);
  return { count: list.length, latest: list[0], avg, avgN };
}

// GET /vocab-test/trend?book=1
router.get('/vocab-test/trend', (req, res) => {
  const book = req.query.book || '1';
  res.json({
    book,
    books: listAvailableBooks(),
    listen: trendPoints(loadTests('listen-vocab'), book),
    read: trendPoints(loadTests('read-vocab'), book),
    global: allTrendPoints(loadTests('global-vocab')),
  });
});

// GET /vocab-test/overview?book=1
router.get('/vocab-test/overview', (req, res) => {
  const book = req.query.book || '1';
  const listen = bookSummary(loadTests('listen-vocab'), book);
  const read = bookSummary(loadTests('read-vocab'), book);
  const global = allSummary(loadTests('global-vocab'));
  let gap = null;
  if (listen.latest && read.latest) {
    gap = read.latest.estimate - listen.latest.estimate;
  }
  res.json({
    book,
    books: listAvailableBooks(),
    listen,
    read,
    global,
    gap,
  });
});

module.exports = router;
