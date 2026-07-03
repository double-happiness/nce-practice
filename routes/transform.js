'use strict';

// 句型转换训练 —— 中译英 → 一般疑问句 → 否定句 → 对句子成分提问，自动挂载到 /api
const express = require('express');
const data = require('../lib/data');
const profile = require('../lib/profile');
const { readJSON, writeJSONAtomic } = require('../lib/store');
const { KINDS, isCorrectStep } = require('../lib/transform-util');

const router = express.Router();

// ---- 持久化（按当前档案隔离）----
const DEFAULT = { attempts: [], perStep: {} };
function load() {
  const obj = readJSON(profile.file('transforms.json'), null);
  if (!obj || !Array.isArray(obj.attempts) || typeof obj.perStep !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  return obj;
}
function save(obj) {
  writeJSONAtomic(profile.file('transforms.json'), obj);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 下发练习时去掉答案与解析，步骤只保留 kind/prompt
function publicExercise(t) {
  return {
    id: t.id,
    book: t.book,
    lesson: t.lesson,
    grammar: t.grammar || [],
    cn: t.cn,
    steps: t.steps.map((s) => ({ kind: s.kind, prompt: s.prompt })),
  };
}

// GET /transform/meta —— 各册练习数，供前端筛选 chips
router.get('/transform/meta', (req, res) => {
  const byBook = {};
  for (const t of data.getTransforms()) byBook[t.book] = (byBook[t.book] || 0) + 1;
  res.json({ total: data.getTransforms().length, byBook });
});

// GET /transform/exercises?book=&lessonMin=&lessonMax=&limit=&random=1 —— 出题（不含答案）
router.get('/transform/exercises', (req, res) => {
  const { book, lessonMin, lessonMax } = req.query;
  let list = data.getTransforms().slice();
  if (book) list = list.filter((t) => String(t.book) === String(book));
  if (lessonMin) list = list.filter((t) => t.lesson >= Number(lessonMin));
  if (lessonMax) list = list.filter((t) => t.lesson <= Number(lessonMax));
  if (req.query.random === '1' || req.query.random === 'true') list = shuffle(list);
  const limit = Number(req.query.limit) || list.length;
  list = list.slice(0, limit);
  res.json({ count: list.length, exercises: list.map(publicExercise) });
});

// POST /transform/grade  body { id, step, response } —— 判单步并记录
router.post('/transform/grade', (req, res) => {
  const { id, step, response } = req.body || {};
  const t = data.getTRMAP().get(id);
  if (!t) return res.status(404).json({ error: '练习不存在' });
  const idx = Number(step);
  if (!Number.isInteger(idx) || idx < 0 || idx >= t.steps.length) {
    return res.status(400).json({ error: 'step 越界' });
  }
  const st = t.steps[idx];
  const correct = isCorrectStep(st, response);

  const db = load();
  db.attempts.push({ id, step: idx, kind: st.kind, correct, ts: Date.now() });
  const key = `${id}#${idx}`;
  const ps = db.perStep[key] || { seen: 0, correct: 0 };
  ps.seen++;
  if (correct) ps.correct++;
  db.perStep[key] = ps;
  save(db);

  res.json({
    correct,
    kind: st.kind,
    answers: st.answers,
    isLast: idx === t.steps.length - 1,
    explanation: t.explanation || '',
  });
});

// GET /transform/stats —— 当前档案的累计训练统计（含按步骤类型拆解）
router.get('/transform/stats', (req, res) => {
  const db = load();
  const total = db.attempts.length;
  const correct = db.attempts.filter((a) => a.correct).length;
  const byKind = {};
  for (const k of KINDS) byKind[k] = { seen: 0, correct: 0 };
  for (const a of db.attempts) {
    if (!byKind[a.kind]) byKind[a.kind] = { seen: 0, correct: 0 };
    byKind[a.kind].seen++;
    if (a.correct) byKind[a.kind].correct++;
  }
  res.json({
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    byKind,
  });
});

module.exports = router;
