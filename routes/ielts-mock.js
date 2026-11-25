'use strict';

// 雅思全真模考 API —— 自动挂载到 /api（设计见 docs/design/ielts-mock-20261125.md §5）
// 组卷 / 模考视图 / 分部分开始·提交·放弃 / 出分或放弃整套 / 历史列表。
// 模考记录存 ielts.json 的 mocks 数组；每部分的作答同时写进 listenings / readings / writings / speakings。
const express = require('express');
const crypto = require('crypto');
const ielts = require('../lib/ielts');
const mockLib = require('../lib/ielts-mock');
const listening = require('../lib/ielts-listening');
const reading = require('../lib/ielts-reading');
const activity = require('../lib/activity');

const router = express.Router();

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function bad(res, error) {
  return res.status(400).json({ error });
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 出分已落盘后再记学习活动；活动日志写失败只打日志，不把已成功的出分变成 500
function recordActivity(correct) {
  try {
    activity.record(correct, 'ielts-mock');
  } catch (e) {
    console.error(`[ielts-mock] 学习活动记录失败: ${e.message}`);
  }
}

// 请求体：缺省视为空对象；只允许列出的键
function parseBody(body, allowed) {
  const b = body == null ? {} : body;
  if (!isPlainObject(b)) return { error: '请求体必须是 JSON 对象' };
  const extra = Object.keys(b).filter((k) => !allowed.includes(k));
  if (extra.length) return { error: `不支持的字段：${extra.join(', ')}${allowed.length ? `（可选 ${allowed.join(' / ')}）` : ''}` };
  return { body: b };
}

function loadState() {
  const user = ielts.loadUser();
  return { user, mocks: mockLib.sanitizeMocks(user.mocks) };
}

function save(user, mocks) {
  user.mocks = mockLib.sanitizeMocks(mocks);
  ielts.saveUser(user);
}

// 路径参数 id：格式非法 400，不存在 404
function findMock(req, res, mocks) {
  const id = req.params.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    bad(res, 'id 非法');
    return null;
  }
  const m = mocks.find((x) => x.id === id);
  if (!m) {
    res.status(404).json({ error: `模考不存在：${id}` });
    return null;
  }
  return m;
}

function viewOf(m, mocks, now) {
  return mockLib.mockView(m, { now, mocks });
}

// 查询参数里的正整数；缺省返回 def，非法或越界返回 NaN
function intParam(raw, min, max, def) {
  if (raw == null || raw === '') return def;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return NaN;
  const n = Number(raw);
  return n >= min && n <= max ? n : NaN;
}

// POST /ielts/mock/start  body {} 或 { replaceActive: true } —— 组卷，返回模考视图（paper 为题目 id 清单）
router.post('/ielts/mock/start', (req, res) => {
  const parsed = parseBody(req.body, ['replaceActive']);
  if (parsed.error) return bad(res, parsed.error);
  const { replaceActive } = parsed.body;
  if (replaceActive !== undefined && typeof replaceActive !== 'boolean') return bad(res, 'replaceActive 必须是 true 或 false');

  const now = Date.now();
  const { user, mocks } = loadState();
  const active = mockLib.activeMock(mocks);
  if (active && replaceActive !== true) {
    return res.status(409).json({
      error: '已有一套进行中的模考，请先继续或放弃；要直接重新组卷请带 replaceActive: true（旧的一套记为放弃）',
      activeId: active.id,
    });
  }
  const examType = user.profile.examType;
  const r = mockLib.assemblePaper({ examType, used: mockLib.usageFromUser(user) });
  if (r.error) return res.status(500).json({ error: r.error });
  if (active) mockLib.abandonMock(active, now);
  const m = mockLib.createMock({ id: crypto.randomUUID(), paper: r.paper, examType, now });
  mocks.push(m);
  save(user, mocks);
  res.json({ ok: true, mock: viewOf(m, mocks, now) });
});

// GET /ielts/mocks?limit= —— 历史列表，新的在前
router.get('/ielts/mocks', (req, res) => {
  const limit = intParam(req.query.limit, 1, mockLib.MAX_MOCKS, mockLib.MAX_MOCKS);
  if (Number.isNaN(limit)) return bad(res, `limit 必须是 1–${mockLib.MAX_MOCKS} 的整数`);
  const { mocks } = loadState();
  const sorted = mocks.slice().sort((a, b) => b.createdAt - a.createdAt);
  const active = mockLib.activeMock(mocks);
  res.json({ total: sorted.length, activeId: active ? active.id : null, items: sorted.slice(0, limit).map(mockLib.mockSummary) });
});

// GET /ielts/mock/:id —— 模考视图；出分后带分数、错题复盘、与上一次的对比
router.get('/ielts/mock/:id', (req, res) => {
  const { mocks } = loadState();
  const m = findMock(req, res, mocks);
  if (!m) return;
  res.json(viewOf(m, mocks, Date.now()));
});

// POST /ielts/mock/:id/section  body { section, action: 'begin'|'submit'|'abandon', ...提交内容 }
router.post('/ielts/mock/:id/section', (req, res) => {
  const now = Date.now();
  const { user, mocks } = loadState();
  const m = findMock(req, res, mocks);
  if (!m) return;
  const parsed = mockLib.parseSectionRequest(req.body);
  if (parsed.error) return bad(res, parsed.error);
  const { section, action } = parsed;

  if (action === 'begin' || action === 'abandon') {
    const r = action === 'begin' ? mockLib.beginSection(m, section, now) : mockLib.abandonSection(m, section, now);
    if (r.error) return bad(res, r.error);
    save(user, mocks);
    return res.json({ ok: true, restarted: !!r.restarted, mock: viewOf(m, mocks, now) });
  }

  const stateErr = mockLib.submitError(m, section);
  if (stateErr) return bad(res, stateErr);
  const g = mockLib.gradeSubmission(m, section, req.body);
  if (g.error) return res.status(g.status || 400).json({ error: g.error });

  // 同一次保存里写入模块记录和模考记录，避免两边不一致
  const built = mockLib.moduleRecords(m, section, g.graded, now, () => crypto.randomUUID());
  const rec = built.records;
  if (rec.listenings.length) {
    let list = user.listenings;
    for (const e of rec.listenings) list = listening.appendRecord(list, e);
    user.listenings = list;
  }
  if (rec.readings.length) {
    user.readings = reading.sanitizeReadings([...reading.sanitizeReadings(user.readings), ...rec.readings]);
  }
  user.writings.push(...rec.writings);
  user.speakings.push(...rec.speakings);
  mockLib.applySubmit(m, section, g.graded, built.ids, now);
  save(user, mocks);
  res.json({ ok: true, mock: viewOf(m, mocks, now) });
});

// POST /ielts/mock/:id/finish  body {} 出分；{ abandon: true } 放弃整套
router.post('/ielts/mock/:id/finish', (req, res) => {
  const now = Date.now();
  const { user, mocks } = loadState();
  const m = findMock(req, res, mocks);
  if (!m) return;
  const parsed = parseBody(req.body, ['abandon']);
  if (parsed.error) return bad(res, parsed.error);
  const { abandon } = parsed.body;
  if (abandon !== undefined && typeof abandon !== 'boolean') return bad(res, 'abandon 必须是 true 或 false');

  if (abandon === true) {
    const r = mockLib.abandonMock(m, now);
    if (r.error) return bad(res, r.error);
    save(user, mocks);
    return res.json({ ok: true, mock: viewOf(m, mocks, now) });
  }

  const r = mockLib.finishMock(m, now);
  if (r.error) return bad(res, r.error);
  save(user, mocks);
  // 一套模考只记 1 次活动；四部分全部完成才算达标。全部放弃的不记
  if (r.anyDone) recordActivity(m.result.complete);
  res.json({ ok: true, mock: viewOf(m, mocks, now) });
});

module.exports = router;
