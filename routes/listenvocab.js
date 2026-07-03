'use strict';

// 听力词汇量测试 —— 听发音选中文释义，分层抽样估算「听力词汇量」
//
// 方法：把全册去重词表按课程先后切成 3 段难度带（新概念1越往后词越难），
// 每段随机抽同样多的词；答题时前端只放发音不显示单词，从 4 个中文释义中选。
// 估算：每段正确率先剔除猜中概率（4 选 1 基线 25%：adj = (p-0.25)/0.75），
// 再乘以该段词表总数，三段求和即为估算听力词汇量。历次成绩按档案持久化。
const express = require('express');
const profile = require('../lib/profile');
const { buildDict, normKey } = require('../lib/dict');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const router = express.Router();

const BAND_COUNT = 3;
const OPTION_COUNT = 4;
const BAND_LABELS = ['前段（入门词）', '中段（进阶词）', '后段（较难词）'];

// ---- 历次成绩持久化（按当前档案隔离）----
function loadTests() {
  const v = readJSON(profile.file('listen-vocab.json'), { tests: [] });
  if (!v || !Array.isArray(v.tests)) return { tests: [] };
  return v;
}
function saveTests(v) {
  writeJSONAtomic(profile.file('listen-vocab.json'), v);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 词表按 lesson 升序切成 BAND_COUNT 段（词数尽量均分）
function splitBands(dict) {
  const sorted = dict.slice().sort((a, b) => a.lesson - b.lesson);
  const per = Math.ceil(sorted.length / BAND_COUNT);
  const bands = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const words = sorted.slice(i * per, (i + 1) * per);
    if (!words.length) continue;
    bands.push({
      band: i,
      label: BAND_LABELS[i] || `第 ${i + 1} 段`,
      lessonMin: words[0].lesson,
      lessonMax: words[words.length - 1].lesson,
      total: words.length,
      words,
    });
  }
  return bands;
}

// 给一个词生成 4 个中文释义选项：正确释义 + 3 个同册干扰项（优先同词性、释义不重复）
function buildOptions(entry, dict) {
  const used = new Set([entry.cn]);
  const pick = [];
  const samePos = shuffle(dict.filter((e) => e.key !== entry.key && e.pos === entry.pos && e.cn && !used.has(e.cn)));
  for (const e of samePos) {
    if (pick.length >= OPTION_COUNT - 1) break;
    if (used.has(e.cn)) continue;
    used.add(e.cn);
    pick.push(e.cn);
  }
  if (pick.length < OPTION_COUNT - 1) {
    for (const e of shuffle(dict)) {
      if (pick.length >= OPTION_COUNT - 1) break;
      if (e.key === entry.key || !e.cn || used.has(e.cn)) continue;
      used.add(e.cn);
      pick.push(e.cn);
    }
  }
  return shuffle([entry.cn, ...pick]);
}

// GET /listen-vocab/sample?book=1&size=24 —— 分层抽样出题（不含正确答案标记）
router.get('/listen-vocab/sample', (req, res) => {
  const book = req.query.book || '1';
  const size = Math.min(60, Math.max(6, parseInt(req.query.size, 10) || 24));
  const dict = buildDict(book);
  if (dict.length < OPTION_COUNT * 3) {
    return res.status(400).json({ error: '该册收录单词还太少，暂无法进行听力词汇量测试' });
  }
  const bands = splitBands(dict);
  const per = Math.ceil(size / bands.length);
  let items = [];
  for (const b of bands) {
    items = items.concat(
      shuffle(b.words)
        .slice(0, Math.min(per, b.words.length))
        .map((e) => ({
          word: e.word, // 前端只用于 TTS 发音与判分回传，不显示
          pos: e.pos,
          band: b.band,
          options: buildOptions(e, dict),
        }))
    );
  }
  res.json({
    count: items.length,
    dictTotal: dict.length,
    bands: bands.map((b) => ({ band: b.band, label: b.label, lessonMin: b.lessonMin, lessonMax: b.lessonMax, total: b.total })),
    items: shuffle(items),
  });
});

// POST /listen-vocab/grade  body { book, word, chosen } —— 单词判分（chosen 为空 = 不认识/跳过）
router.post('/listen-vocab/grade', (req, res) => {
  const { word, chosen } = req.body || {};
  const book = (req.body && req.body.book) || '1';
  const entry = buildDict(book).find((e) => e.key === normKey(word));
  if (!entry) return res.status(404).json({ error: '单词不在词表中' });
  const correct = chosen != null && String(chosen).trim() === entry.cn;
  res.json({
    correct,
    word: entry.word,
    phon: entry.phon,
    pos: entry.pos,
    cn: entry.cn,
    eg: entry.eg,
    lesson: entry.lesson,
  });
});

// 剔除猜中概率的正确率：4 选 1 全靠猜也有 25%，低于基线按 0 算
function adjustedAccuracy(correct, asked) {
  if (!asked) return 0;
  const p = correct / asked;
  const guess = 1 / OPTION_COUNT;
  return Math.max(0, (p - guess) / (1 - guess));
}

// POST /listen-vocab/finish  body { book, results:[{word, band, correct}] }
// —— 汇总估算词汇量并写入历史，返回本次报告
router.post('/listen-vocab/finish', (req, res) => {
  const body = req.body || {};
  const book = body.book || '1';
  const results = Array.isArray(body.results) ? body.results : [];
  if (!results.length) return res.status(400).json({ error: 'results 不能为空' });

  const dict = buildDict(book);
  const bands = splitBands(dict);
  const report = bands.map((b) => {
    const rs = results.filter((r) => Number(r.band) === b.band);
    const asked = rs.length;
    const correct = rs.filter((r) => r.correct).length;
    const est = Math.round(adjustedAccuracy(correct, asked) * b.total);
    return { band: b.band, label: b.label, lessonMin: b.lessonMin, lessonMax: b.lessonMax, total: b.total, asked, correct, est };
  });
  const estimate = Math.min(dict.length, report.reduce((n, b) => n + b.est, 0));
  const correct = results.filter((r) => r.correct).length;

  const db = loadTests();
  db.tests.push({
    ts: Date.now(),
    book: Number(book) || book,
    asked: results.length,
    correct,
    estimate,
    dictTotal: dict.length,
    bands: report,
  });
  if (db.tests.length > 50) db.tests = db.tests.slice(-50); // 历史上限，防无限增长
  saveTests(db);

  res.json({ estimate, dictTotal: dict.length, asked: results.length, correct, bands: report });
});

// GET /listen-vocab/history —— 历次成绩（最近的在前）
router.get('/listen-vocab/history', (req, res) => {
  const tests = loadTests().tests.slice().reverse();
  res.json({ count: tests.length, tests: tests.slice(0, 10) });
});

module.exports = router;
