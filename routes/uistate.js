'use strict';

// 轻量 UI 学习状态（最近学习课/已学/已掌握/听写成绩与断点）—— 自动挂载到 /api
// 按档案隔离存 data/profiles/<id>/ui.json，让这些状态跨浏览器一致并纳入备份。
const express = require('express');
const { readJSON, writeJSONAtomic } = require('../lib/store');
const profile = require('../lib/profile');

const router = express.Router();

// 白名单：与前端 localStorage 时代的 key 同名，便于一次性迁移
const KEYS = new Set([
  'nce-last-lesson', // 最近学习课（对象）
  'nce-viewed-lessons', // 已学课程 ✓（数组）
  'nce-mastered-lessons', // 已掌握课程 ★（数组）
  'dct-best', // 听写历史最好平均正确率（数字）
  'dct-last', // 听写最近一次成绩（对象）
  'dct-pos', // 听写每课断点（对象 { lesson: idx }）
]);

const fileOf = () => profile.file('ui.json');

// GET /ui-state —— 当前档案的全部 UI 状态
router.get('/ui-state', (req, res) => {
  res.json(readJSON(fileOf(), {}));
});

// POST /ui-state —— 部分更新（浅合并），只接受白名单内的键
router.post('/ui-state', (req, res) => {
  const patch = req.body;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return res.status(400).json({ error: '请求体必须是对象' });
  }
  const bad = Object.keys(patch).filter((k) => !KEYS.has(k));
  if (bad.length) return res.status(400).json({ error: `不支持的键: ${bad.join(', ')}` });

  const file = fileOf();
  const cur = readJSON(file, {});
  Object.assign(cur, patch);
  writeJSONAtomic(file, cur);
  res.json({ ok: true });
});

module.exports = router;
