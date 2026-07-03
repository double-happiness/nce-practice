'use strict';
// 客户端上报学习活动（听写等无专用后端判分链路的模块）
const express = require('express');
const activity = require('../lib/activity');

const router = express.Router();
const ALLOWED = new Set(['dictation', 'words', 'vocab', 'dialogue', 'other']);

// POST /activity/log  body { correct, source }
router.post('/activity/log', (req, res) => {
  const body = req.body || {};
  const source = body.source || 'other';
  if (!ALLOWED.has(source)) {
    return res.status(400).json({ error: 'source 非法' });
  }
  activity.record(!!body.correct, source);
  res.json({ ok: true });
});

module.exports = router;
