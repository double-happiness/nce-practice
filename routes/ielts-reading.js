'use strict';

// 雅思阅读 API —— 自动挂载到 /api（设计见 docs/design/ielts-reading-20261124.md）
// 文章列表 / 文章与题目（不含答案）/ 交卷判分；作答记录存 ielts.json 的 readings 数组。
const express = require('express');
const crypto = require('crypto');
const ielts = require('../lib/ielts');
const reading = require('../lib/ielts-reading');
const activity = require('../lib/activity');

const router = express.Router();

const MAX_ANSWER_LEN = 200;
const MAX_DURATION_SEC = 4 * 3600;
const PASS_RATIO = 0.6; // 学习活动的 correct：正确率达到 60% 记为达标
const DIFFICULTY_ORDER = Object.fromEntries(reading.DIFFICULTIES.map((d, i) => [d, i]));

function bad(res, error) {
  return res.status(400).json({ error });
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 判分已落盘后再记学习活动；活动日志写失败只打日志，不影响本次交卷结果
function recordActivity(correct) {
  try {
    activity.record(correct, 'ielts-reading');
  } catch (e) {
    console.error(`[ielts-reading] 学习活动记录失败: ${e.message}`);
  }
}

// 首次用到内容时跑一遍校验，有问题打日志提醒（正式接入 validate.js 前的兜底）
let contentChecked = false;
function checkContentOnce() {
  if (contentChecked) return;
  contentChecked = true;
  const c = reading.getContent();
  const { errors, warnings } = reading.validateReadingContent(c.passages);
  const all = c.issues.map((m) => `ielts/${m}`).concat(errors);
  if (all.length) console.error(`[ielts-reading] 阅读内容有 ${all.length} 个错误：\n  ${all.slice(0, 20).join('\n  ')}`);
  if (warnings.length) console.warn(`[ielts-reading] 阅读内容有 ${warnings.length} 条警告`);
}

function passageList() {
  checkContentOnce();
  return [...reading.getContent().byId.values()].sort(
    (a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.difficulty] ?? 99)
  );
}

// :id 校验：格式非法 400，不存在 404；成功返回文章对象
function findPassage(req, res) {
  const id = req.params.id;
  if (typeof id !== 'string' || !reading.PASSAGE_ID_RE.test(id)) {
    bad(res, 'id 非法（只能含小写字母、数字和 -）');
    return null;
  }
  checkContentOnce();
  const p = reading.getPassage(id);
  if (!p) {
    res.status(404).json({ error: `阅读文章不存在：${id}` });
    return null;
  }
  return p;
}

function questionIds(p) {
  const ids = new Set();
  for (const g of Array.isArray(p.groups) ? p.groups : []) {
    for (const q of isPlainObject(g) && Array.isArray(g.questions) ? g.questions : []) {
      if (isPlainObject(q) && typeof q.id === 'string') ids.add(q.id);
    }
  }
  return ids;
}

/**
 * 校验交卷请求体。
 * @returns {{ answers, mode, durationSec } | { error }}
 */
function parseSubmit(body, p) {
  if (!isPlainObject(body)) return { error: '请求体必须是 JSON 对象' };
  if (!reading.MODES.includes(body.mode)) return { error: `mode 必须是 ${reading.MODES.join(' 或 ')}` };

  let durationSec = 0;
  if (body.durationSec != null) {
    if (!Number.isInteger(body.durationSec) || body.durationSec < 0 || body.durationSec > MAX_DURATION_SEC) {
      return { error: `durationSec 必须是 0–${MAX_DURATION_SEC} 的整数（秒）` };
    }
    durationSec = body.durationSec;
  }

  if (!isPlainObject(body.answers)) return { error: 'answers 必须是对象，形如 { "q1": "TRUE" }' };
  const ids = questionIds(p);
  const answers = {};
  let answered = 0;
  for (const [qid, value] of Object.entries(body.answers)) {
    if (!ids.has(qid)) return { error: `answers 含本篇不存在的题号：${String(qid).slice(0, 20)}` };
    if (typeof value !== 'string') return { error: `answers.${qid} 必须是字符串` };
    if (value.length > MAX_ANSWER_LEN) return { error: `answers.${qid} 最长 ${MAX_ANSWER_LEN} 字符` };
    answers[qid] = value;
    if (value.trim()) answered++;
  }
  if (!answered) return { error: '还没有作答任何题目，至少答一题再交卷' };
  return { answers, mode: body.mode, durationSec };
}

// GET /ielts/reading —— 文章列表（不含答案），每篇带本人作答次数与最好成绩
router.get('/ielts/reading', (req, res) => {
  const records = reading.sanitizeReadings(ielts.loadUser().readings);
  const stats = reading.readingStats(records);
  const items = passageList().map((p) => {
    const s = stats.get(p.id);
    return {
      ...reading.passageSummary(p),
      attempts: s ? s.attempts : 0,
      best: s ? s.best : null,
      lastTs: s ? s.lastTs : null,
    };
  });
  res.json({ total: items.length, items, topics: reading.TOPICS, bandNote: reading.BAND_NOTE });
});

// GET /ielts/reading/:id —— 文章与题目，不含 answer / explanation / evidence
router.get('/ielts/reading/:id', (req, res) => {
  const p = findPassage(req, res);
  if (!p) return;
  res.json(reading.publicPassage(p));
});

// POST /ielts/reading/:id/submit  body { answers: { [qid]: string }, durationSec, mode: 'exam'|'practice' }
router.post('/ielts/reading/:id/submit', (req, res) => {
  const p = findPassage(req, res);
  if (!p) return;
  const parsed = parseSubmit(req.body, p);
  if (parsed.error) return bad(res, parsed.error);

  const graded = reading.gradePassage(p, parsed.answers);
  if (!graded.total) return res.status(500).json({ error: `文章 ${p.id} 没有可判分的题目，请检查阅读内容数据` });
  const est = reading.estimateBand(graded.raw, graded.total);
  const ts = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    passageId: p.id,
    mode: parsed.mode,
    raw: graded.raw,
    total: graded.total,
    band: est.band,
    durationSec: parsed.durationSec,
    wrong: graded.results.filter((r) => !r.correct).map((r) => r.id),
    date: ielts.todayKey(ts),
    ts,
  };

  // loadUser 保留未知顶层字段；readings 由本模块自行清洗坏数据并限量
  const user = ielts.loadUser();
  user.readings = reading.sanitizeReadings([...reading.sanitizeReadings(user.readings), entry]);
  ielts.saveUser(user);
  recordActivity(graded.raw / graded.total >= PASS_RATIO);

  res.json({
    ok: true,
    record: entry,
    raw: graded.raw,
    total: graded.total,
    scaled40: est.scaled40,
    band: est.band,
    bandNote: reading.BAND_NOTE,
    results: graded.results,
  });
});

module.exports = router;
