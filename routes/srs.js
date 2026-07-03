'use strict';

const express = require('express');
const data = require('../lib/data');
const profile = require('../lib/profile');
const { isCorrect } = require('../lib/grade');
const { readJSON, writeJSONAtomic } = require('../lib/store');
const tf = require('../lib/transform-util');

const router = express.Router();

// 间隔阶梯（天）：答对后依次推进
const STEPS = [0, 1, 2, 4, 7, 15, 30, 60];
const DAY = 86400000;
const LAPSE_DELAY = 600000; // 答错后 10 分钟重现

// ---- 持久化（按当前档案隔离）----
function load() {
  const obj = readJSON(profile.file('srs.json'), { items: {} });
  if (!obj || typeof obj !== 'object' || typeof obj.items !== 'object') return { items: {} };
  return obj;
}
function save(obj) {
  writeJSONAtomic(profile.file('srs.json'), obj);
}

// ---- 工具 ----
const stripAnswer = data.publicQuestion; // 去答案 + 打乱选项
// 队列同时容纳题库题（id）与句型转换错步（key 形如 tf-xxx#步骤下标）
const tfResolve = (id) => tf.resolveStep(data.getTRMAP(), id);
const known = (id) => data.getQMAP().has(id) || !!tfResolve(id);

// POST /srs/add  body { ids:[] } —— 加入复习队列（已存在跳过）
router.post('/srs/add', (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids 必须是数组' });
  const db = load();
  const now = Date.now();
  let added = 0;
  for (const id of ids) {
    if (!known(id)) continue; // 只接受题库/句型转换中真实存在的条目
    if (db.items[id]) continue; // 已存在跳过
    db.items[id] = { step: 0, dueAt: now, reps: 0, lapses: 0, addedAt: now };
    added++;
  }
  if (added) save(db);
  res.json({ added, total: Object.keys(db.items).length });
});

// GET /srs/due?limit=20 —— 已到期题目（去掉答案），按 dueAt 升序
router.get('/srs/due', (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const QMAP = data.getQMAP();
  const db = load();
  const now = Date.now();
  const due = Object.keys(db.items)
    .filter((id) => db.items[id].dueAt <= now && known(id))
    .sort((a, b) => db.items[a].dueAt - db.items[b].dueAt)
    .slice(0, limit)
    .map((id) => {
      if (QMAP.has(id)) return stripAnswer(QMAP.get(id));
      const r = tfResolve(id);
      return tf.stepQuestion(r.t, r.idx, id);
    });
  res.json({ count: due.length, questions: due });
});

// POST /srs/grade  body { id, response } —— 判分并按遗忘曲线更新
router.post('/srs/grade', (req, res) => {
  const { id, response } = req.body || {};
  const q = data.getQMAP().get(id);
  const ts = q ? null : tfResolve(id); // 句型转换错步
  if (!q && !ts) return res.status(404).json({ error: '题目不存在' });

  const db = load();
  const now = Date.now();
  const it = db.items[id] || { step: 0, dueAt: now, reps: 0, lapses: 0, addedAt: now };
  const correct = q ? isCorrect(q, response) : tf.isCorrectStep(ts.step, response);

  it.reps++;
  if (correct) {
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
    correct,
    answer: q ? q.answer : ts.step.answers,
    explanation: (q ? q.explanation : ts.t.explanation) || '',
    nextDueAt: it.dueAt,
  });
});

// GET /srs/stats —— { due, total, upcoming(未来7天内到期) }
router.get('/srs/stats', (req, res) => {
  const db = load();
  const now = Date.now();
  const horizon = now + 7 * DAY;
  let due = 0;
  let upcoming = 0;
  const ids = Object.keys(db.items);
  for (const id of ids) {
    const d = db.items[id].dueAt;
    if (d <= now) due++;
    else if (d <= horizon) upcoming++;
  }
  res.json({ due, total: ids.length, upcoming });
});

module.exports = router;
