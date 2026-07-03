'use strict';
// 课文原文（用户录入）持久化：存到项目内 data/lesson-texts.json，换设备随项目/备份带走。
// 内容由用户提供，本服务只负责保存与读取。
const express = require('express');
const path = require('path');
const data = require('../lib/data');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();
const FILE = path.join(data.DATA_DIR, 'lesson-texts.json');

function load() {
  const s = readJSON(FILE, { texts: {} });
  if (!s.texts) s.texts = {};
  return s;
}

// 读取某课录入的原文
router.get('/lesson-text/:book/:lesson', (req, res) => {
  const key = `${req.params.book}-${req.params.lesson}`;
  res.json({ key, text: load().texts[key] || null });
});

// 保存/更新/清空某课原文（en 为空则删除该条）
router.post('/lesson-text/:book/:lesson', (req, res) => {
  const key = `${req.params.book}-${req.params.lesson}`;
  const en = String((req.body && req.body.en) || '').trim();
  const cn = String((req.body && req.body.cn) || '').trim();
  const store = load();
  if (!en) delete store.texts[key];
  else store.texts[key] = { en, cn, ts: Date.now() };
  writeJSONAtomic(FILE, store);
  res.json({ ok: true, saved: !!en });
});

module.exports = router;
