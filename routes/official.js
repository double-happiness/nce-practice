'use strict';

// 新概念原声课文：LRC 原文 + MP3 路径（由 scripts/import-nce-official.js 生成）
const express = require('express');
const data = require('../lib/data');

const router = express.Router();

// GET /official/meta — 已导入的原声课文统计
router.get('/official/meta', (req, res) => {
  const byBook = {};
  for (const o of data.getOfficialPassages()) {
    byBook[o.book] = (byBook[o.book] || 0) + 1;
  }
  res.json({ total: data.getOfficialPassages().length, byBook });
});

// GET /official/:book/:lesson — 单课原声课文（含时间轴）
router.get('/official/:book/:lesson', (req, res) => {
  const book = Number(req.params.book);
  const lesson = Number(req.params.lesson);
  const p = data.getOfficialPassage(book, lesson);
  if (!p) return res.status(404).json({ error: '该课尚未导入原声课文，请运行 npm run import:official' });
  res.json(p);
});

module.exports = router;
