'use strict';
// 学习计划 / 打卡 / 连续天数 / 趋势 功能模块（后端路由）
const express = require('express');
const progress = require('../lib/progress');
const profile = require('../lib/profile');
const activity = require('../lib/activity');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

const DEFAULT_GOAL = 10;
const DAY = 86400000;

const SOURCE_LABEL = {
  quiz: '刷题/测验',
  transform: '句型转换',
  words: '背单词',
  vocab: '词汇量测试',
  dictation: '听写',
  dialogue: '情景对话',
};

function loadGoal() {
  const obj = readJSON(profile.file('plan.json'), { goal: DEFAULT_GOAL });
  const g = obj && Number(obj.goal);
  return Number.isFinite(g) && g > 0 ? Math.round(g) : DEFAULT_GOAL;
}

function dateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

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

function loadTransformAttempts() {
  const obj = readJSON(profile.file('transforms.json'), null);
  return obj && Array.isArray(obj.attempts) ? obj.attempts : [];
}

/** 汇总计入今日目标的所有活动（刷题/转换/背单词/词汇测/听写/对话） */
function collectAllAttempts() {
  const p = progress.load();
  const out = (Array.isArray(p.attempts) ? p.attempts : []).map((a) => ({
    ts: a.ts,
    correct: !!a.correct,
    source: 'quiz',
  }));
  for (const a of loadTransformAttempts()) {
    if (!a || typeof a.ts !== 'number') continue;
    out.push({ ts: a.ts, correct: !!a.correct, source: 'transform' });
  }
  for (const a of activity.load().log) {
    if (!a || typeof a.ts !== 'number') continue;
    out.push({ ts: a.ts, correct: !!a.correct, source: a.source || 'other' });
  }
  return out;
}

function todayBreakdown(attempts, todayKey) {
  const by = {};
  let correct = 0;
  let count = 0;
  for (const a of attempts) {
    if (dateKey(a.ts) !== todayKey) continue;
    const src = a.source || 'other';
    by[src] = (by[src] || 0) + 1;
    count++;
    if (a.correct) correct++;
  }
  const lines = Object.keys(by)
    .sort((a, b) => by[b] - by[a])
    .map((k) => ({ source: k, label: SOURCE_LABEL[k] || k, count: by[k] }));
  return { count, correct, by, lines };
}

// GET /plan/overview
router.get('/plan/overview', (req, res) => {
  const attempts = collectAllAttempts();
  const byDate = groupByDate(attempts);
  const now = Date.now();
  const goal = loadGoal();
  const streak = computeStreak(byDate, now);
  const todayKey = dateKey(now);
  const today = todayBreakdown(attempts, todayKey);
  const todayAccuracy = today.count ? Math.round((today.correct / today.count) * 100) : 0;

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
    todayCount: today.count,
    todayCorrect: today.correct,
    todayAccuracy,
    todayBySource: today.by,
    todayLines: today.lines,
    goal,
    calendar,
    totalDays: byDate.size,
    metricNote: '今日目标统计刷题、句型转换、背单词、词汇量测试、听写、情景对话等所有练习次数',
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
