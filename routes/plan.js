'use strict';
// 学习计划 / 打卡 / 连续天数 / 趋势 功能模块（后端路由）
const express = require('express');
const progress = require('../lib/progress');
const profile = require('../lib/profile');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

const DEFAULT_GOAL = 10;
const DAY = 86400000;

// ---- 每日目标持久化（按当前档案隔离）----
function loadGoal() {
  const obj = readJSON(profile.file('plan.json'), { goal: DEFAULT_GOAL });
  const g = obj && Number(obj.goal);
  return Number.isFinite(g) && g > 0 ? Math.round(g) : DEFAULT_GOAL;
}

// 本地时区下把毫秒时间戳格式化为 YYYY-MM-DD
function dateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// 本地某天 0 点的时间戳
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 按本地日期聚合 attempts：{ 'YYYY-MM-DD': {count, correct} }
function groupByDate(attempts) {
  const map = new Map();
  for (const a of attempts) {
    if (!a || typeof a.ts !== 'number') continue;
    const key = dateKey(a.ts);
    const e = map.get(key) || { count: 0, correct: 0 };
    e.count++;
    if (a.correct) e.correct++;
    map.set(key, e);
  }
  return map;
}

// 连续打卡天数：以今天为起点；若今天无记录但昨天有，则从昨天起往前连续计
function computeStreak(byDate, now) {
  const today = startOfDay(now);
  let cursor;
  if (byDate.has(dateKey(today))) {
    cursor = today;
  } else if (byDate.has(dateKey(today - DAY))) {
    cursor = today - DAY;
  } else {
    return 0;
  }
  let streak = 0;
  while (byDate.has(dateKey(cursor))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

// 句型转换训练的步骤记录（{ts, correct} 结构与刷题 attempts 兼容），一并计入每日训练量
function loadTransformAttempts() {
  const obj = readJSON(profile.file('transforms.json'), null);
  return obj && Array.isArray(obj.attempts) ? obj.attempts : [];
}

// GET /plan/overview
router.get('/plan/overview', (req, res) => {
  const p = progress.load();
  const attempts = (Array.isArray(p.attempts) ? p.attempts : []).concat(loadTransformAttempts());
  const byDate = groupByDate(attempts);
  const now = Date.now();
  const goal = loadGoal();

  const streak = computeStreak(byDate, now);

  const todayKey = dateKey(now);
  const todayEntry = byDate.get(todayKey) || { count: 0, correct: 0 };
  const todayCount = todayEntry.count;
  const todayCorrect = todayEntry.correct;
  const todayAccuracy = todayCount ? Math.round((todayCorrect / todayCount) * 100) : 0;

  // 最近 30 天日历（含今天），由旧到新
  const todayStart = startOfDay(now);
  const calendar = [];
  for (let i = 29; i >= 0; i--) {
    const key = dateKey(todayStart - i * DAY);
    const e = byDate.get(key) || { count: 0, correct: 0 };
    calendar.push({
      date: key,
      count: e.count,
      accuracy: e.count ? Math.round((e.correct / e.count) * 100) : 0,
    });
  }

  res.json({
    streak,
    todayCount,
    todayCorrect,
    todayAccuracy,
    goal,
    calendar,
    totalDays: byDate.size,
  });
});

// POST /plan/goal  body { goal:数字 }
router.post('/plan/goal', (req, res) => {
  const raw = req.body && req.body.goal;
  const g = Number(raw);
  if (!Number.isFinite(g) || g <= 0) {
    return res.status(400).json({ error: 'goal 必须是正数' });
  }
  const goal = Math.round(g);
  writeJSONAtomic(profile.file('plan.json'), { goal });
  res.json({ ok: true, goal });
});

module.exports = router;
