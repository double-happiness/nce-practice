'use strict';

// 数据备份 导出/导入 —— 自动挂载到 /api
const express = require('express');
const path = require('path');
const data = require('../lib/data');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

// 需要备份的运行时文件（按档案隔离，都在 data/profiles/<id>/ 下，可能不存在）
// 注：课文原文(lesson-texts.json)是各档案共享的教材内容、随项目提交带走，不纳入按档案备份
const KEYS = ['progress', 'srs', 'vocab', 'plan', 'words', 'transforms', 'ui', 'listen-vocab', 'read-vocab'];
const profile = require('../lib/profile');
const fileOf = (key) => profile.file(`${key}.json`); // 备份/恢复只作用于当前档案

// 读取全部备份文件，缺失的用 {} 兜底
function readAll() {
  const out = {};
  for (const k of KEYS) out[k] = readJSON(fileOf(k), {});
  return out;
}

// 拼出 nce-backup-YYYYMMDD.json 里的日期串
function dateStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// 数一个结构里的条目数：对象数键，数组数长度，否则 0
function countEntries(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v).length;
  return 0;
}

// GET /backup/export —— 打包 5 个文件为可下载 JSON
router.get('/backup/export', (req, res) => {
  const payload = {
    app: 'nce',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: readAll(),
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="nce-backup-${dateStamp()}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

// POST /backup/import —— 校验后把存在的键写回对应文件
router.post('/backup/import', (req, res) => {
  const body = req.body || {};
  if (body.app !== 'nce' || !body.data || typeof body.data !== 'object') {
    return res.status(400).json({ ok: false, error: '备份文件格式不正确（缺少 app:"nce" 或 data 对象）' });
  }
  const restored = [];
  for (const k of KEYS) {
    if (Object.prototype.hasOwnProperty.call(body.data, k)) {
      writeJSONAtomic(fileOf(k), body.data[k]);
      restored.push(k);
    }
  }
  res.json({ ok: true, restored });
});

// GET /backup/info —— 各文件概览，供前端展示
router.get('/backup/info', (req, res) => {
  const NONE = Symbol('none');
  const read = (k) => readJSON(fileOf(k), NONE);

  const build = (k, fn) => {
    const v = read(k);
    if (v === NONE) return { exists: false };
    return fn(v);
  };

  res.json({
    progress: build('progress', (v) => ({ exists: true, attempts: countEntries(v.attempts) })),
    vocab: build('vocab', (v) => ({ exists: true, stars: countEntries(v.stars) })),
    words: build('words', (v) => ({ exists: true, states: countEntries(v.states) })),
    srs: build('srs', (v) => ({ exists: true, items: countEntries(v.items) })),
    plan: build('plan', () => ({ exists: true })),
    transforms: build('transforms', (v) => ({ exists: true, attempts: countEntries(v.attempts) })),
    ui: build('ui', (v) => ({ exists: true, keys: countEntries(v) })),
    'listen-vocab': build('listen-vocab', (v) => ({ exists: true, tests: countEntries(v.tests) })),
    'read-vocab': build('read-vocab', (v) => ({ exists: true, tests: countEntries(v.tests) })),
  });
});

module.exports = router;
