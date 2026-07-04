'use strict';

const express = require('express');
const data = require('../lib/data');
const profile = require('../lib/profile');
const { isCorrect } = require('../lib/grade');
const { readJSON, writeJSONAtomic } = require('../lib/store');
const tf = require('../lib/transform-util');
const { answerCn } = require('../lib/transform-cn');
const wordSrs = require('../lib/word-srs');
const dlgSrs = require('../lib/dialogue-srs');
const { collectTurnAnswers } = require('../lib/dialogue-grade');

const router = express.Router();

const STEPS = [0, 1, 2, 4, 7, 15, 30, 60];
const DAY = 86400000;
const LAPSE_DELAY = 600000;

function load() {
  const obj = readJSON(profile.file('srs.json'), { items: {} });
  if (!obj || typeof obj !== 'object' || typeof obj.items !== 'object') return { items: {} };
  return obj;
}
function save(obj) {
  writeJSONAtomic(profile.file('srs.json'), obj);
}

const stripAnswer = data.publicQuestion;
const tfResolve = (id) => tf.resolveStep(data.getTRMAP(), id);

function known(id) {
  if (data.getQMAP().has(id)) return true;
  if (tfResolve(id)) return true;
  if (wordSrs.resolve(id)) return true;
  if (dlgSrs.resolve(id)) return true;
  return false;
}

function resolveItem(id) {
  const q = data.getQMAP().get(id);
  if (q) return { kind: 'quiz', q };
  const ts = tfResolve(id);
  if (ts) return { kind: 'transform', ts };
  const w = wordSrs.resolve(id);
  if (w) return { kind: 'word', w };
  const d = dlgSrs.resolve(id);
  if (d) return { kind: 'dialogue', d };
  return null;
}

function publicQuestion(id) {
  const r = resolveItem(id);
  if (!r) return null;
  if (r.kind === 'quiz') return stripAnswer(r.q);
  if (r.kind === 'transform') return tf.stepQuestion(r.ts.t, r.ts.idx, id);
  if (r.kind === 'word') return wordSrs.wordQuestion(r.w.entry, id);
  return dlgSrs.dialogueQuestion(r.d);
}

function gradeItem(id, response) {
  const r = resolveItem(id);
  if (!r) return null;
  if (r.kind === 'quiz') {
    return {
      correct: isCorrect(r.q, response),
      answer: r.q.answer,
      explanation: r.q.explanation || '',
    };
  }
  if (r.kind === 'transform') {
    const step = r.ts.step;
    return {
      correct: tf.isCorrectStep(step, response),
      answer: step.answers,
      answerCn: step.cn || answerCn(r.ts.t, step),
      explanation: r.ts.t.explanation || '',
    };
  }
  if (r.kind === 'word') {
    return {
      correct: wordSrs.gradeWord(r.w.entry, response),
      answer: r.w.entry.cn,
      explanation: `${r.w.entry.word}：${r.w.entry.cn}`,
    };
  }
  const answers = collectTurnAnswers(r.d.line);
  return {
    correct: dlgSrs.gradeLine(r.d.line, response),
    answer: answers.length === 1 ? answers[0] : answers,
    answerCn: r.d.line.cn || '',
    explanation: r.d.d.scene || '',
  };
}

function addIds(ids) {
  const db = load();
  const now = Date.now();
  let added = 0;
  for (const id of ids) {
    if (!known(id)) continue;
    if (db.items[id]) continue;
    db.items[id] = { step: 0, dueAt: now, reps: 0, lapses: 0, addedAt: now };
    added++;
  }
  if (added) save(db);
  return { added, total: Object.keys(db.items).length };
}

// POST /srs/add  body { ids:[] }
router.post('/srs/add', (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids 必须是数组' });
  res.json(addIds(ids));
});

// POST /srs/add-words  body { words: string[] | object[] }
router.post('/srs/add-words', (req, res) => {
  const raw = (req.body && req.body.words) || [];
  if (!Array.isArray(raw) || !raw.length) {
    return res.status(400).json({ error: 'words 不能为空' });
  }
  const ids = [];
  for (const item of raw) {
    const word = typeof item === 'string' ? item : item.word;
    if (!word) continue;
    const id = wordSrs.wordKey(word);
    if (wordSrs.resolve(id)) ids.push(id);
  }
  res.json(addIds(ids));
});

// GET /srs/due?limit=20
router.get('/srs/due', (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const db = load();
  const now = Date.now();
  const due = Object.keys(db.items)
    .filter((id) => db.items[id].dueAt <= now && known(id))
    .sort((a, b) => db.items[a].dueAt - db.items[b].dueAt)
    .slice(0, limit)
    .map((id) => publicQuestion(id))
    .filter(Boolean);
  res.json({ count: due.length, questions: due });
});

// POST /srs/grade  body { id, response }
router.post('/srs/grade', (req, res) => {
  const { id, response } = req.body || {};
  const graded = gradeItem(id, response);
  if (!graded) return res.status(404).json({ error: '题目不存在' });

  const db = load();
  const now = Date.now();
  const it = db.items[id] || { step: 0, dueAt: now, reps: 0, lapses: 0, addedAt: now };

  it.reps++;
  if (graded.correct) {
    it.step = Math.min(it.step + 1, STEPS.length - 1);
    it.dueAt = now + STEPS[it.step] * DAY;
  } else {
    it.step = 0;
    it.dueAt = now + LAPSE_DELAY;
    it.lapses++;
  }
  db.items[id] = it;
  save(db);

  res.json({
    correct: graded.correct,
    answer: graded.answer,
    answerCn: graded.answerCn || '',
    explanation: graded.explanation,
    nextDueAt: it.dueAt,
  });
});

// GET /srs/stats
router.get('/srs/stats', (req, res) => {
  const db = load();
  const now = Date.now();
  const horizon = now + 7 * DAY;
  let due = 0;
  let upcoming = 0;
  // 与 /srs/due 口径一致：过滤掉题库已删改、无法解析的失效 id，
  // 否则首页会显示「有 N 个到期」却永远刷不出对应题目。
  const ids = Object.keys(db.items).filter((id) => known(id));
  for (const id of ids) {
    const d = db.items[id].dueAt;
    if (d <= now) due++;
    else if (d <= horizon) upcoming++;
  }
  res.json({ due, total: ids.length, upcoming });
});

module.exports = router;
