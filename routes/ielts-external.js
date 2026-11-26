'use strict';

// 雅思外部成绩（剑雅真题等）API —— 自动挂载到 /api（设计见 docs/design/ielts-external-scores-20261126.md §6）
// 记录存 ielts.json 的 externalTests；录入时可选顺带在学习计划里给当天的外部任务打勾。
const express = require('express');
const crypto = require('crypto');
const ielts = require('../lib/ielts');
const planEngine = require('../lib/ielts-plan');
const ext = require('../lib/ielts-external');

const router = express.Router();

function bad(res, error) {
  return res.status(400).json({ error });
}

function loadState() {
  const user = ielts.loadUser();
  return { user, list: ext.sanitizeExternalTests(user.externalTests) };
}

function save(user, list) {
  user.externalTests = ext.sanitizeExternalTests(list);
  ielts.saveUser(user);
}

// 计划模板里出现过的全部外部任务 key（cam-lr、cam-mock 等）
function externalTaskKeys(plan) {
  const keys = new Set();
  for (const w of (plan && plan.weeks) || []) {
    for (const t of w.tasks || []) if (t && t.kind === 'external' && typeof t.key === 'string') keys.add(t.key);
  }
  return [...keys];
}

/**
 * 把 date 那一周的外部任务在 date 当天打勾（规则同 POST /ielts/plan/check）。
 * 备考未开启、计划缺失、日期早于开始备考日或晚于今天时不打勾，返回空数组，不报错：打勾只是顺带，不影响成绩保存。
 */
function tickExternalTasks(user, date, today) {
  const plan = ielts.getPlan();
  const prof = user.profile;
  if (!plan || !prof.active) return [];
  const start = prof.startDate || today;
  if (ielts.dayNumber(date) < ielts.dayNumber(start) || ielts.dayNumber(date) > ielts.dayNumber(today)) return [];
  const ticked = externalTaskKeys(plan).filter((key) => {
    const found = planEngine.findTaskOnDate(plan, prof, date, key, today);
    return found.task && found.task.kind === 'external';
  });
  if (!ticked.length) return [];
  user.manualDone[date] = [...new Set([...(user.manualDone[date] || []), ...ticked])];
  return ticked;
}

// GET /ielts/external-tests —— { total, items }，新的在前
router.get('/ielts/external-tests', (req, res) => {
  const { list } = loadState();
  const items = list.slice().reverse().map(ext.externalView);
  res.json({ total: items.length, items });
});

// POST /ielts/external-tests —— 录入一条成绩 → { ok, item, ticked }
router.post('/ielts/external-tests', (req, res) => {
  const today = ielts.todayKey();
  const { user, list } = loadState();
  const parsed = ext.parseInput(req.body, { examType: user.profile.examType, today });
  if (parsed.error) return bad(res, parsed.error);
  const record = ext.buildRecord(parsed.input, `ext-${crypto.randomUUID()}`, Date.now());
  list.push(record);
  const ticked = parsed.tickPlan ? tickExternalTasks(user, record.date, today) : [];
  save(user, list);
  res.json({ ok: true, item: ext.externalView(record), ticked });
});

// DELETE /ielts/external-tests/:id —— 只删成绩，不取消计划打勾（可能是手动勾的）
router.delete('/ielts/external-tests/:id', (req, res) => {
  const id = req.params.id;
  if (typeof id !== 'string' || !ext.ID_RE.test(id)) return bad(res, 'id 非法');
  const { user, list } = loadState();
  const rest = list.filter((r) => r.id !== id);
  if (rest.length === list.length) return res.status(404).json({ error: `成绩记录不存在：${id}` });
  save(user, rest);
  res.json({ ok: true, id });
});

module.exports = router;
