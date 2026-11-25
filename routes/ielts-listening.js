'use strict';

// 雅思听力 API —— 自动挂载到 /api（设计文档 docs/design/ielts-listening-20261124.md §5）
// 列表（带本人最好成绩）、题目 + 脚本（不含答案）、交卷判分（写入 ielts.json 的 listenings）。
const express = require('express');
const crypto = require('crypto');
const ielts = require('../lib/ielts');
const listening = require('../lib/ielts-listening');
const activity = require('../lib/activity');

const router = express.Router();

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function bad(res, error) {
  return res.status(400).json({ error });
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 提交已落盘后再记学习活动；活动日志写失败只打日志，不把已成功的提交变成 500
function recordActivity(correct) {
  try {
    activity.record(correct, 'ielts-listening');
  } catch (e) {
    console.error(`[ielts-listening] 学习活动记录失败: ${e.message}`);
  }
}

// 路径参数 id：格式非法 400，不存在 404；成功返回 section
function findSection(req, res) {
  const id = req.params.id;
  if (!ID_RE.test(id)) {
    bad(res, 'id 非法');
    return null;
  }
  const section = listening.getSection(id);
  if (!section) {
    res.status(404).json({ error: `听力题目不存在：${id}` });
    return null;
  }
  return section;
}

function loadRecords(user) {
  return listening.sanitizeListenings(user.listenings);
}

// GET /ielts/listening —— 列表，每条带做过的次数与本人最好成绩
router.get('/ielts/listening', (req, res) => {
  const content = listening.getContent();
  const stats = listening.statsBySection(loadRecords(ielts.loadUser()));
  const items = content.items.map((s) => {
    const st = stats.get(s.id);
    return {
      ...listening.sectionSummary(s),
      attempts: st ? st.attempts : 0,
      best: st ? st.best : null,
      lastTs: st ? st.last.ts : null,
    };
  });
  res.json({
    total: items.length,
    items,
    skipped: content.rejected.length,
    bandNote: listening.BAND_NOTE,
  });
});

// GET /ielts/listening/:id —— 题目与脚本（前端 TTS 需要脚本）；不含 answer / explanation / segment / evidence
router.get('/ielts/listening/:id', (req, res) => {
  const section = findSection(req, res);
  if (!section) return;
  res.json(listening.publicSection(section));
});

// POST /ielts/listening/:id/submit  body { answers: { "题号": "答案" }, durationSec, mode: 'exam'|'practice' }
router.post('/ielts/listening/:id/submit', (req, res) => {
  const section = findSection(req, res);
  if (!section) return;
  const body = req.body;
  if (!isPlainObject(body)) return bad(res, '请求体必须是 JSON 对象');
  if (!listening.MODES.includes(body.mode)) return bad(res, 'mode 必须是 exam 或 practice');
  const parsed = listening.parseAnswers(section, body.answers);
  if (parsed.error) return bad(res, parsed.error);
  let durationSec = 0;
  if (body.durationSec != null) {
    const d = body.durationSec;
    if (!Number.isInteger(d) || d < 0 || d > listening.MAX_DURATION_SEC) {
      return bad(res, `durationSec 必须是 0–${listening.MAX_DURATION_SEC} 的整数（秒）`);
    }
    durationSec = d;
  }

  const graded = listening.gradeSection(section, parsed.answers);
  const entry = {
    id: crypto.randomUUID(),
    sectionId: section.id,
    part: section.part,
    mode: body.mode,
    raw: graded.raw,
    total: graded.total,
    band: graded.band,
    durationSec,
    answers: parsed.answers,
    ts: Date.now(),
  };
  const user = ielts.loadUser();
  const prev = listening.statsBySection(loadRecords(user)).get(section.id);
  user.listenings = listening.appendRecord(user.listenings, entry);
  ielts.saveUser(user);
  recordActivity(graded.raw / graded.total >= 0.6);

  res.json({
    ok: true,
    entry,
    raw: graded.raw,
    total: graded.total,
    raw40: graded.raw40,
    band: graded.band,
    bandNote: listening.BAND_NOTE,
    mode: entry.mode,
    durationSec,
    // 严格高于此前最好成绩才算新纪录（同分不算）
    isBest: !prev || entry.raw / entry.total > prev.best.raw / prev.best.total,
    results: graded.results,
  });
});

module.exports = router;
