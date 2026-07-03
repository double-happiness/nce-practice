'use strict';

// 阶段测验 / 模考 —— 选区间限时组卷、交卷判分出成绩单、保存历次成绩
const express = require('express');
const data = require('../lib/data');
const progress = require('../lib/progress');
const profile = require('../lib/profile');
const { isCorrect } = require('../lib/grade');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

// ---- 工具 ----
const stripAnswer = data.publicQuestion; // 去答案 + 打乱选项
// 洗牌（Fisher-Yates）
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 历次成绩持久化 ----
function loadExams() {
  const v = readJSON(profile.file('exams.json'), { exams: [] });
  if (!v || !Array.isArray(v.exams)) return { exams: [] };
  return v;
}
function saveExams(v) {
  writeJSONAtomic(profile.file('exams.json'), v);
}

// GET /exam/generate?book=1&lessonMin=&lessonMax=&count=20 —— 随机组卷（去掉答案/解析）
router.get('/exam/generate', (req, res) => {
  const { book, lessonMin, lessonMax } = req.query;
  const count = Math.max(1, parseInt(req.query.count, 10) || 20);
  let list = data.getQuestions().slice();
  if (book) list = list.filter((q) => String(q.book) === String(book));
  if (lessonMin) list = list.filter((q) => q.lesson >= Number(lessonMin));
  if (lessonMax) list = list.filter((q) => q.lesson <= Number(lessonMax));

  const picked = shuffle(list).slice(0, count).map(stripAnswer);
  res.json({ count: picked.length, questions: picked });
});

// POST /exam/submit —— 判分出成绩单 + 计入 progress + 追加历史
router.post('/exam/submit', (req, res) => {
  const body = req.body || {};
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const durationSec = Number(body.durationSec) || 0;
  const scope = body.scope || {};

  const QMAP = data.getQMAP();
  const p = progress.load();
  const ts = Date.now();
  const results = [];
  const wrongIds = [];
  const grammarMap = new Map(); // tag -> { total, correct }
  let correctCount = 0;

  for (const item of answers) {
    const q = QMAP.get(item && item.id);
    if (!q) continue;
    const correct = isCorrect(q, item.response);
    if (correct) correctCount++;
    else wrongIds.push(q.id);

    // 按语法标签汇总（每个标签都计入）
    for (const tag of Array.isArray(q.grammar) ? q.grammar : []) {
      const g = grammarMap.get(tag) || { total: 0, correct: 0 };
      g.total++;
      if (correct) g.correct++;
      grammarMap.set(tag, g);
    }

    results.push({
      id: q.id,
      correct,
      response: item.response,
      answer: q.answer,
      explanation: q.explanation || '',
      stem: q.stem,
      lesson: q.lesson,
      lessonTitle: q.lessonTitle,
      grammar: q.grammar || [],
    });

    // 计入 progress（与刷题一致）
    p.attempts.push({ id: q.id, correct, response: item.response, ts });
    const pq = p.perQuestion[q.id] || { seen: 0, correct: 0 };
    pq.seen++;
    if (correct) pq.correct++;
    p.perQuestion[q.id] = pq;
    if (correct) delete p.wrong[q.id];
    else p.wrong[q.id] = (p.wrong[q.id] || 0) + 1;
  }
  progress.save(p);

  const total = results.length;
  const accuracy = total ? Math.round((correctCount / total) * 100) : 0;
  const passed = accuracy >= 60;

  const byGrammar = [];
  for (const [tag, g] of grammarMap) {
    byGrammar.push({
      tag,
      total: g.total,
      correct: g.correct,
      accuracy: g.total ? Math.round((g.correct / g.total) * 100) : 0,
    });
  }
  byGrammar.sort((a, b) => a.accuracy - b.accuracy); // 最弱在前

  // 追加历史记录
  const db = loadExams();
  db.exams.push({ ts, scope, total, correct: correctCount, accuracy, passed, durationSec });
  saveExams(db);

  res.json({ total, correct: correctCount, accuracy, passed, byGrammar, results, wrongIds });
});

// GET /exam/history?limit=20 —— 最近成绩（按时间倒序）
router.get('/exam/history', (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
  const db = loadExams();
  const exams = db.exams.slice().sort((a, b) => b.ts - a.ts).slice(0, limit);
  res.json({ count: exams.length, exams });
});

module.exports = router;
