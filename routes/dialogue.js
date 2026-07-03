'use strict';

// 情景对话练习 —— 按场景分类，角色扮演式输入练习，自动挂载到 /api
const express = require('express');
const data = require('../lib/data');
const profile = require('../lib/profile');
const { readJSON, writeJSONAtomic } = require('../lib/store');
const { normalizeAnswer } = require('../lib/grade');
const { CATEGORIES, LEARNER_ROLE } = require('../lib/dialogue-meta');

const router = express.Router();

const DEFAULT = { attempts: [], completed: {} };

function load() {
  const obj = readJSON(profile.file('dialogues.json'), null);
  if (!obj || !Array.isArray(obj.attempts) || typeof obj.completed !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  return obj;
}

function save(obj) {
  writeJSONAtomic(profile.file('dialogues.json'), obj);
}

function isLearnerTurn(turn) {
  return turn.role === LEARNER_ROLE;
}

function isTurnCorrect(turn, response) {
  const r = normalizeAnswer(response);
  if (!r) return false;
  const answers = Array.isArray(turn.en) ? turn.en : [turn.en];
  return answers.some((a) => normalizeAnswer(a) === r);
}

// 下发对话时隐藏学习者角色的英文答案
function publicDialogue(d) {
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    titleCn: d.titleCn,
    scene: d.scene,
    roles: d.roles,
    turns: d.turns.map((t, i) => {
      const pub = { index: i, role: t.role, cn: t.cn };
      if (!isLearnerTurn(t)) pub.en = t.en;
      pub.practice = isLearnerTurn(t);
      return pub;
    }),
  };
}

function publicSummary(d) {
  const practiceCount = d.turns.filter(isLearnerTurn).length;
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    titleCn: d.titleCn,
    scene: d.scene,
    turnCount: d.turns.length,
    practiceCount,
  };
}

// GET /dialogue/meta —— 场景分类与对话数量
router.get('/dialogue/meta', (req, res) => {
  const byCategory = {};
  for (const d of data.getDialogues()) {
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  }
  res.json({
    total: data.getDialogues().length,
    categories: CATEGORIES,
    byCategory,
  });
});

// GET /dialogue/list?category= —— 对话目录（不含答案）
router.get('/dialogue/list', (req, res) => {
  let list = data.getDialogues().slice();
  const { category } = req.query;
  if (category) list = list.filter((d) => d.category === category);
  res.json({ count: list.length, dialogues: list.map(publicSummary) });
});

// GET /dialogue/:id —— 单条对话（学习者台词隐藏英文）
router.get('/dialogue/:id', (req, res) => {
  const d = data.getDLGMAP().get(req.params.id);
  if (!d) return res.status(404).json({ error: '对话不存在' });
  res.json(publicDialogue(d));
});

// POST /dialogue/grade  body { id, turn, response }
router.post('/dialogue/grade', (req, res) => {
  const { id, turn, response } = req.body || {};
  const d = data.getDLGMAP().get(id);
  if (!d) return res.status(404).json({ error: '对话不存在' });
  const idx = Number(turn);
  if (!Number.isInteger(idx) || idx < 0 || idx >= d.turns.length) {
    return res.status(400).json({ error: 'turn 越界' });
  }
  const t = d.turns[idx];
  if (!isLearnerTurn(t)) {
    return res.status(400).json({ error: '该轮次不需要练习' });
  }
  const correct = isTurnCorrect(t, response);

  const db = load();
  db.attempts.push({ id, turn: idx, correct, ts: Date.now() });
  save(db);

  res.json({
    correct,
    answer: t.en,
    cn: t.cn,
  });
});

// POST /dialogue/complete  body { id, correct, total }
router.post('/dialogue/complete', (req, res) => {
  const { id, correct, total } = req.body || {};
  if (!id) return res.status(400).json({ error: '缺少 id' });
  const db = load();
  const prev = db.completed[id] || { count: 0, best: 0 };
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  db.completed[id] = {
    count: prev.count + 1,
    best: Math.max(prev.best, score),
    last: score,
    ts: Date.now(),
  };
  save(db);
  res.json(db.completed[id]);
});

// GET /dialogue/stats —— 累计练习统计
router.get('/dialogue/stats', (req, res) => {
  const db = load();
  const attempts = db.attempts || [];
  const total = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  const completed = Object.keys(db.completed || {}).length;
  res.json({
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    completed,
    completedMap: db.completed || {},
  });
});

module.exports = router;
