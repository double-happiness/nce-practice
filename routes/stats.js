'use strict';
// 薄弱点分析 / 语法正确率热力图 —— 统计接口
const express = require('express');
const data = require('../lib/data');
const progress = require('../lib/progress');

const router = express.Router();

function acc(correct, seen) {
  return seen > 0 ? Math.round((correct / seen) * 100) : 0;
}

// 遍历 perQuestion，用 QMAP 取每题 grammar 标签，把 seen/correct 累加到每个标签
function buildGrammar() {
  const QMAP = data.getQMAP();
  const perQuestion = progress.load().perQuestion || {};
  const map = new Map(); // tag -> { seen, correct }
  for (const id of Object.keys(perQuestion)) {
    const q = QMAP.get(id);
    if (!q || !Array.isArray(q.grammar)) continue;
    const pq = perQuestion[id] || {};
    const seen = Number(pq.seen) || 0;
    const correct = Number(pq.correct) || 0;
    if (seen <= 0) continue;
    for (const tag of q.grammar) {
      const cur = map.get(tag) || { seen: 0, correct: 0 };
      cur.seen += seen;
      cur.correct += correct;
      map.set(tag, cur);
    }
  }
  const list = [];
  for (const [tag, v] of map) {
    if (v.seen <= 0) continue;
    list.push({
      tag,
      seen: v.seen,
      correct: v.correct,
      accuracy: acc(v.correct, v.seen),
      wrong: v.seen - v.correct,
    });
  }
  list.sort((a, b) => a.accuracy - b.accuracy); // 最弱在前
  return list;
}

// GET /stats/grammar
router.get('/stats/grammar', (req, res) => {
  res.json({ grammar: buildGrammar() });
});

// GET /stats/overview
router.get('/stats/overview', (req, res) => {
  const p = progress.load();
  const attempts = Array.isArray(p.attempts) ? p.attempts : [];
  const perQuestion = p.perQuestion || {};
  const correct = attempts.reduce((n, a) => n + (a && a.correct ? 1 : 0), 0);
  const totalAttempts = attempts.length;
  const grammar = buildGrammar();
  res.json({
    totalAttempts,
    correct,
    accuracy: acc(correct, totalAttempts),
    practicedQuestions: Object.keys(perQuestion).length,
    grammarCovered: grammar.length,
    weakest: grammar.slice(0, 3).map((g) => ({ tag: g.tag, accuracy: g.accuracy })),
  });
});

// GET /stats/lesson —— 按 book+lesson 聚合
router.get('/stats/lesson', (req, res) => {
  const QMAP = data.getQMAP();
  const perQuestion = progress.load().perQuestion || {};
  const map = new Map(); // key book|lesson -> {book,lesson,lessonTitle,seen,correct}
  for (const id of Object.keys(perQuestion)) {
    const q = QMAP.get(id);
    if (!q) continue;
    const pq = perQuestion[id] || {};
    const seen = Number(pq.seen) || 0;
    const correct = Number(pq.correct) || 0;
    if (seen <= 0) continue;
    const key = q.book + '|' + q.lesson;
    const cur = map.get(key) || {
      book: q.book,
      lesson: q.lesson,
      lessonTitle: q.lessonTitle || '',
      seen: 0,
      correct: 0,
    };
    cur.seen += seen;
    cur.correct += correct;
    map.set(key, cur);
  }
  const lessons = [];
  for (const v of map.values()) {
    lessons.push({
      book: v.book,
      lesson: v.lesson,
      lessonTitle: v.lessonTitle,
      seen: v.seen,
      correct: v.correct,
      accuracy: acc(v.correct, v.seen),
    });
  }
  lessons.sort((a, b) => a.accuracy - b.accuracy); // 最弱在前
  res.json({ lessons });
});

module.exports = router;
