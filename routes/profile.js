'use strict';

// 多用户档案管理 API —— 自动挂载到 /api
const express = require('express');
const profile = require('../lib/profile');

const router = express.Router();

// GET /profile/list —— { current, profiles:[{id,name,emoji}] }
router.get('/profile/list', (req, res) => {
  res.json(profile.list());
});

// POST /profile/switch  body { id }
router.post('/profile/switch', (req, res) => {
  const r = profile.switchTo((req.body || {}).id);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

// POST /profile/create  body { name, emoji? } —— 创建并切换到新档案
router.post('/profile/create', (req, res) => {
  const b = req.body || {};
  const r = profile.create(b.name, b.emoji);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

// POST /profile/rename  body { id, name }
router.post('/profile/rename', (req, res) => {
  const b = req.body || {};
  const r = profile.rename(b.id, b.name);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

// POST /profile/remove  body { id } —— 不能删当前档案；数据移入 .trash 而非直接删除
router.post('/profile/remove', (req, res) => {
  const r = profile.remove((req.body || {}).id);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

module.exports = router;
