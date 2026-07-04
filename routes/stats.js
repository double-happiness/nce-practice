'use strict';
// 薄弱点分析 / 语法正确率热力图 —— 统计接口
const express = require('express');
const data = require('../lib/data');
const progress = require('../lib/progress');
const profile = require('../lib/profile');
const { readJSON } = require('../lib/store');
const { KIND_LABEL } = require('../lib/transform-util');
const { buildGrammarStats, buildRecommendations } = require('../lib/weak-recommend');

const router = express.Router();

function acc(correct, seen) {
  return seen > 0 ? Math.round((correct / seen) * 100) : 0;
}

function loadGrammar() {
  const p = progress.load();
  const tfDb = readJSON(profile.file('transforms.json'), { attempts: [], perStep: {} });
  return buildGrammarStats(p, tfDb);
}

// GET /stats/grammar —— 刷题 + 句型转换合并统计
router.get('/stats/grammar', (req, res) => {
  res.json({ grammar: loadGrammar() });
});

// GET /stats/recommend —— 高频薄弱语法自动推荐练习
router.get('/stats/recommend', (req, res) => {
  const minSeen = Math.max(1, parseInt(req.query.minSeen, 10) || 4);
  const maxAccuracy = Math.min(100, parseInt(req.query.maxAccuracy, 10) || 85);
  const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || 5));
  const preferredBook = req.query.book != null ? parseInt(req.query.book, 10) : null;
  const grammar = loadGrammar();
  const recommendations = buildRecommendations(grammar, { minSeen, maxAccuracy, limit, preferredBook });
  res.json({
    grammar,
    recommendations,
    params: { minSeen, maxAccuracy, limit, preferredBook },
  });
});

// GET /stats/overview
router.get('/stats/overview', (req, res) => {
  const p = progress.load();
  const attempts = Array.isArray(p.attempts) ? p.attempts : [];
  const perQuestion = p.perQuestion || {};
  const correct = attempts.reduce((n, a) => n + (a && a.correct ? 1 : 0), 0);
  const totalAttempts = attempts.length;
  const grammar = loadGrammar();
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

// GET /stats/training —— 句型转换 / 情景对话 / 阶段测验薄弱项
router.get('/stats/training', (req, res) => {
  const tfDb = readJSON(profile.file('transforms.json'), { attempts: [], perStep: {} });
  const dlgDb = readJSON(profile.file('dialogues.json'), { attempts: [], completed: {} });
  const examDb = readJSON(profile.file('exams.json'), { exams: [] });

  const byKind = {};
  for (const a of tfDb.attempts || []) {
    if (!a.kind) continue;
    const k = byKind[a.kind] || { seen: 0, correct: 0 };
    k.seen++;
    if (a.correct) k.correct++;
    byKind[a.kind] = k;
  }
  const transformKinds = Object.keys(byKind)
    .map((kind) => ({
      kind,
      label: KIND_LABEL[kind] || kind,
      seen: byKind[kind].seen,
      correct: byKind[kind].correct,
      accuracy: byKind[kind].seen
        ? Math.round((byKind[kind].correct / byKind[kind].seen) * 100)
        : 0,
    }))
    .filter((x) => x.seen >= 3)
    .sort((a, b) => a.accuracy - b.accuracy);

  const dlgAttempts = dlgDb.attempts || [];
  const dlgTotal = dlgAttempts.length;
  const dlgCorrect = dlgAttempts.filter((a) => a.correct).length;
  const weakDialogues = [];
  const byDlg = {};
  for (const a of dlgAttempts) {
    if (!a.id) continue;
    const cur = byDlg[a.id] || { seen: 0, correct: 0 };
    cur.seen++;
    if (a.correct) cur.correct++;
    byDlg[a.id] = cur;
  }
  const DLGMAP = data.getDLGMAP();
  for (const [id, v] of Object.entries(byDlg)) {
    if (v.seen < 2) continue;
    const d = DLGMAP.get(id);
    const accuracy = Math.round((v.correct / v.seen) * 100);
    if (accuracy >= 70) continue;
    weakDialogues.push({
      id,
      title: d ? (d.titleCn || d.title) : id,
      seen: v.seen,
      accuracy,
    });
  }
  weakDialogues.sort((a, b) => a.accuracy - b.accuracy);

  const recentExams = (examDb.exams || []).slice().sort((a, b) => b.ts - a.ts).slice(0, 5);
  const examAvg = recentExams.length
    ? Math.round(recentExams.reduce((n, e) => n + (e.accuracy || 0), 0) / recentExams.length)
    : null;

  res.json({
    transform: {
      total: (tfDb.attempts || []).length,
      weakestKind: transformKinds[0] || null,
      kinds: transformKinds.slice(0, 5),
    },
    dialogue: {
      total: dlgTotal,
      accuracy: dlgTotal ? Math.round((dlgCorrect / dlgTotal) * 100) : 0,
      completed: Object.keys(dlgDb.completed || {}).length,
      weak: weakDialogues.slice(0, 3),
    },
    exam: {
      recentCount: recentExams.length,
      recentAvg: examAvg,
      last: recentExams[0] || null,
    },
  });
});

module.exports = router;
