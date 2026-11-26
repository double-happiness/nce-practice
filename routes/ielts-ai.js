'use strict';

// 雅思写作 AI 批改 API —— 自动挂载到 /api（设计见 docs/design/ielts-writing-ai-20261126.md §6）
// 批改结果存在写作记录的 ai 字段；每篇默认只批一次（force 重新批改），每日上限计数存 ielts.json 的 aiUsage。
const express = require('express');
const ielts = require('../lib/ielts');
const ai = require('../lib/ielts-ai');

const router = express.Router();

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// 正在批改的写作记录 id：同一篇不并发调用（双击、两个页面同时点）
const inFlight = new Set();

function fail(res, status, error) {
  return res.status(status).json({ error });
}

// GET /ielts/ai/status —— 前端据此决定是否显示「AI 批改」；不返回任何凭据
router.get('/ielts/ai/status', (req, res) => {
  const cfg = ai.config();
  const user = ielts.loadUser();
  res.json({
    enabled: cfg.enabled,
    model: cfg.model,
    effort: cfg.effort,
    dailyLimit: cfg.dailyLimit,
    usedToday: ai.usedToday(user, ielts.todayKey()),
  });
});

// POST /ielts/writing/:id/ai-review  body { force?: boolean } → { ok, review, cached }
// Express 4 不处理 async 处理函数里的异常：兜一层，任何意外都回 JSON 500，而不是让请求挂起
router.post('/ielts/writing/:id/ai-review', (req, res) => {
  reviewHandler(req, res).catch((e) => {
    console.error(`[ielts-ai] 未预期的错误: ${e && e.stack ? e.stack : e}`);
    if (!res.headersSent) fail(res, 500, `AI 批改失败：${e && e.message ? e.message : e}`);
  });
});

async function reviewHandler(req, res) {
  const cfg = ai.config();
  if (!cfg.enabled) return fail(res, 503, 'AI 批改未开启：服务端没有配置 ANTHROPIC_API_KEY（见用户指南「写作 AI 批改」）');
  const id = req.params.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) return fail(res, 400, 'id 非法');
  const body = req.body == null ? {} : req.body;
  if (typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, '请求体必须是 JSON 对象');
  const extra = Object.keys(body).filter((k) => k !== 'force');
  if (extra.length) return fail(res, 400, `不支持的字段：${extra.join(', ')}（可选 force）`);
  if (body.force !== undefined && typeof body.force !== 'boolean') return fail(res, 400, 'force 必须是 true 或 false');

  const today = ielts.todayKey();
  const user = ielts.loadUser();
  const record = user.writings.find((r) => r.id === id);
  if (!record) return fail(res, 404, `写作记录不存在：${id}`);
  if (record.ai && body.force !== true) return res.json({ ok: true, review: record.ai, cached: true });

  const item = ielts.getWriting(record.promptId);
  if (!item || !ai.DIM_KEYS[item.task]) return fail(res, 404, `题目已不在题库：${record.promptId}`);
  const rubrics = ielts.getRubrics();
  const dims = rubrics && rubrics.writing ? rubrics.writing[ai.rubricKey(item)] : null;
  if (!Array.isArray(dims) || !dims.length) return fail(res, 500, '评分维度缺失（data/ielts/rubrics.json），请运行 npm run validate');
  const wordCount = Number.isInteger(record.wordCount) ? record.wordCount : ielts.countWords(record.text || '');
  if (wordCount < ai.MIN_WORDS) return fail(res, 400, `作文只有 ${wordCount} 词，至少写到 ${ai.MIN_WORDS} 词再请 AI 批改`);
  if (inFlight.has(id)) return fail(res, 409, '这篇作文正在批改，请稍候');
  if (ai.usedToday(user, today) >= cfg.dailyLimit) {
    return fail(res, 429, `今天的 AI 批改次数已用完（每日 ${cfg.dailyLimit} 次，可用 IELTS_AI_DAILY_LIMIT 调整）`);
  }

  inFlight.add(id);
  let response;
  try {
    response = await ai.getClient().beta.messages.create(ai.buildRequest(item, record, dims, cfg, wordCount));
  } catch (e) {
    const m = ai.mapError(e);
    console.error(`[ielts-ai] 批改失败 record=${id} status=${m.status}: ${e && e.message}`);
    return fail(res, m.status, m.error);
  } finally {
    inFlight.delete(id);
  }

  if (response.stop_reason === 'refusal') return fail(res, 502, 'AI 拒绝了这次批改，可以稍后重试');
  if (response.stop_reason === 'max_tokens') return fail(res, 502, 'AI 的回复被截断了，请重试');
  const parsed = ai.parseReview(ai.extractText(response), item.task, record.text);
  if (parsed.error) {
    console.error(`[ielts-ai] 解析失败 record=${id}: ${parsed.error}`);
    return fail(res, 502, parsed.error);
  }
  const usage = response.usage || {};
  const review = {
    ts: Date.now(),
    model: typeof response.model === 'string' ? response.model : cfg.model,
    effort: cfg.effort,
    ...parsed.review,
    usage: {
      inputTokens: Number.isInteger(usage.input_tokens) ? usage.input_tokens : null,
      outputTokens: Number.isInteger(usage.output_tokens) ? usage.output_tokens : null,
    },
  };

  // 调用期间可能有新的提交：重新读取档案再写回，只改这一条记录和计数
  const fresh = ielts.loadUser();
  const target = fresh.writings.find((r) => r.id === id);
  if (!target) return fail(res, 404, `写作记录不存在：${id}`);
  target.ai = review;
  ai.bumpUsage(fresh, today, ielts.dayNumber);
  ielts.saveUser(fresh);
  res.json({ ok: true, review, cached: false });
}

module.exports = router;
