'use strict';

// 雅思备考 API —— 自动挂载到 /api（设计文档 §5）
// 档案、26 周计划、雅思词汇浏览与诊断、写作 / 口语题库与自评提交、记录与总览。
const express = require('express');
const crypto = require('crypto');
const ielts = require('../lib/ielts');
const planEngine = require('../lib/ielts-plan');
const activity = require('../lib/activity');
const profile = require('../lib/profile');
const { buildLookupDict } = require('../lib/wordlookup');
const { readJSON } = require('../lib/store');

const router = express.Router();

// 提交已落盘后再记学习活动；活动日志写失败只打日志，不把已成功的提交变成 500（否则客户端重试会产生重复记录）
function recordActivity(correct, source) {
  try {
    activity.record(correct, source);
  } catch (e) {
    console.error(`[ielts] 学习活动记录失败 source=${source}: ${e.message}`);
  }
}

// ---- 枚举（与设计文档 §3 保持一致）----
const TOPICS = {
  academic: '学术通用',
  education: '教育',
  environment: '环境',
  technology: '科技',
  health: '健康',
  work: '工作',
  crime: '犯罪',
  media: '媒体',
  urban: '城市',
  globalization: '全球化',
  government: '政府',
  culture: '文化',
  science: '科学',
};
const CEFRS = ['B1', 'B2', 'C1', 'C2'];
const QTYPES = ['opinion', 'discussion', 'problem-solution', 'adv-disadv', 'two-part'];
const WRITING_SCORE_KEYS = { 1: ['TA', 'CC', 'LR', 'GRA'], 2: ['TR', 'CC', 'LR', 'GRA'] };
const SPEAKING_SCORE_KEYS = ['FC', 'LR', 'GRA', 'P'];
const MIN_WORDS = { 1: 150, 2: 250 };
const MAX_DURATION_SEC = { writing: 4 * 3600, speaking: 3600 };
const MAX_NOTES = 2000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TASK_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;

// ---- 通用工具 ----
function bad(res, error) {
  return res.status(400).json({ error });
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 查询参数里的非负整数；缺省返回 def，非法或越界返回 NaN（由调用方报 400）
function intParam(raw, min, max, def) {
  if (raw == null || raw === '') return def;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return NaN;
  const n = Number(raw);
  return n >= min && n <= max ? n : NaN;
}

// 查询参数里的可选字符串（数组形式 ?a=1&a=2 视为非法）
function strParam(raw) {
  if (raw == null) return '';
  if (typeof raw !== 'string') return null;
  return raw.trim();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 校验四维自评分：必须恰好包含给定维度，每项 0–9、步长 0.5
function validateScores(scores, keys) {
  if (!isPlainObject(scores)) return { error: `selfScores 必须是对象，包含 ${keys.join(' / ')}` };
  const extra = Object.keys(scores).filter((k) => !keys.includes(k));
  if (extra.length) return { error: `selfScores 不支持的维度：${extra.join(', ')}（应为 ${keys.join(' / ')}）` };
  for (const k of keys) {
    if (!ielts.isBand(scores[k], 0)) return { error: `selfScores.${k} 必须是 0–9 之间、以 0.5 为步长的数字` };
  }
  return { scores: Object.fromEntries(keys.map((k) => [k, scores[k]])) };
}

function durationParam(raw, max) {
  if (raw == null) return 0;
  return Number.isInteger(raw) && raw >= 0 && raw <= max ? raw : NaN;
}

function uniqueVocab() {
  return [...ielts.getContent().vocabByKey.values()];
}

function loadWordStates() {
  const v = readJSON(profile.file('words.json'), null);
  return v && isPlainObject(v.states) ? v.states : {};
}

function wordLevel(states, key) {
  const s = states[key];
  return s && typeof s.level === 'number' ? s.level : null;
}

function requirePlan(res) {
  const plan = ielts.getPlan();
  if (!plan) {
    res.status(500).json({ error: '雅思计划模板缺失或格式错误（data/ielts/plan.json），请运行 npm run validate 查看' });
    return null;
  }
  return plan;
}

// ---- 档案 ----
function profilePayload(prof, today) {
  const tl = planEngine.deriveTimeline(prof, today, ielts.getPlan());
  return {
    profile: prof,
    derived: {
      daysLeft: tl.daysLeft,
      totalWeeks: tl.totalWeeks,
      currentWeek: tl.currentWeek,
      phase: tl.phase,
      templateWeek: tl.templateWeek,
    },
  };
}

// GET /ielts/profile —— 无档案或未开启时返回默认档案（active: false），derived 按「今天开始」预览
router.get('/ielts/profile', (req, res) => {
  const today = ielts.todayKey();
  res.json(profilePayload(ielts.loadUser().profile, today));
});

// POST /ielts/profile  body 部分更新 { active, examType, examDate, target, baseline }
router.post('/ielts/profile', (req, res) => {
  const today = ielts.todayKey();
  const user = ielts.loadUser();
  const r = ielts.applyProfilePatch(user.profile, req.body, today);
  if (r.error) return bad(res, r.error);
  user.profile = r.profile;
  ielts.saveUser(user);
  res.json({ ok: true, ...profilePayload(r.profile, today) });
});

// ---- 计划 ----

// GET /ielts/plan —— 阶段、当前周（已映射）、今日任务完成情况、后 2 周概要、检查点与建议
router.get('/ielts/plan', (req, res) => {
  const plan = requirePlan(res);
  if (!plan) return;
  const user = ielts.loadUser();
  res.json(
    planEngine.buildPlanView({
      plan,
      profile: user.profile,
      user,
      counts: planEngine.loadDailyCounts(),
      today: ielts.todayKey(),
      level: planEngine.loadPlanLevel(),
    })
  );
});

// POST /ielts/plan/check  body { date, taskKey, done } —— 只用于 external 任务的手动打勾
router.post('/ielts/plan/check', (req, res) => {
  const body = req.body;
  if (!isPlainObject(body)) return bad(res, '请求体必须是 JSON 对象');
  const { date, taskKey, done } = body;
  if (!ielts.isValidDateKey(date)) return bad(res, 'date 必须是有效日期，格式 YYYY-MM-DD');
  if (typeof taskKey !== 'string' || !TASK_KEY_RE.test(taskKey)) return bad(res, 'taskKey 非法');
  if (typeof done !== 'boolean') return bad(res, 'done 必须是 true 或 false');

  const plan = requirePlan(res);
  if (!plan) return;
  const today = ielts.todayKey();
  const user = ielts.loadUser();
  const prof = user.profile;
  if (!prof.active) return bad(res, '尚未开启雅思备考，请先开启后再打勾');
  const start = prof.startDate || today;
  if (ielts.dayNumber(date) > ielts.dayNumber(today)) return bad(res, '不能给未来的日期打勾');
  if (ielts.dayNumber(date) < ielts.dayNumber(start)) return bad(res, `只能给开始备考（${start}）以后的日期打勾`);

  const found = planEngine.findTaskOnDate(plan, prof, date, taskKey, today);
  if (!found.task) return bad(res, `第 ${found.actualWeek} 周没有任务 ${taskKey}`);
  if (found.task.kind !== 'external') {
    return bad(res, '只有外部资料任务（kind: external）可以手动打勾，站内练习按记录自动统计');
  }

  const set = new Set(user.manualDone[date] || []);
  if (done) set.add(taskKey);
  else set.delete(taskKey);
  if (set.size) user.manualDone[date] = [...set];
  else delete user.manualDone[date];
  ielts.saveUser(user);
  res.json({ ok: true, date, taskKey, done, week: found.actualWeek, checked: user.manualDone[date] || [] });
});

// ---- 词汇 ----

// GET /ielts/vocab?topic=&cefr=&q=&limit=&offset= —— topics 计数按 cefr / q 过滤后、topic 过滤前统计
router.get('/ielts/vocab', (req, res) => {
  const topic = strParam(req.query.topic);
  const cefr = strParam(req.query.cefr);
  const q = strParam(req.query.q);
  if (topic === null || (topic && !Object.prototype.hasOwnProperty.call(TOPICS, topic))) return bad(res, `topic 必须是 ${Object.keys(TOPICS).join(' / ')} 之一`);
  if (cefr === null || (cefr && !CEFRS.includes(cefr))) return bad(res, `cefr 必须是 ${CEFRS.join(' / ')} 之一`);
  if (q === null || q.length > 50) return bad(res, 'q 必须是不超过 50 字的字符串');
  const limit = intParam(req.query.limit, 1, 500, 50);
  const offset = intParam(req.query.offset, 0, 1000000, 0);
  if (Number.isNaN(limit)) return bad(res, 'limit 必须是 1–500 的整数');
  if (Number.isNaN(offset)) return bad(res, 'offset 必须是非负整数');

  const kw = q.toLowerCase();
  const base = uniqueVocab().filter((e) => {
    if (cefr && e.cefr !== cefr) return false;
    if (kw && !e.key.includes(kw) && !String(e.cn || '').includes(q)) return false;
    return true;
  });
  const topics = Object.keys(TOPICS).map((k) => ({ key: k, label: TOPICS[k], count: base.filter((e) => e.topic === k).length }));
  const filtered = topic ? base.filter((e) => e.topic === topic) : base;
  const states = loadWordStates();
  const items = filtered.slice(offset, offset + limit).map((e) => ({ ...e, level: wordLevel(states, e.key) }));
  res.json({ total: filtered.length, topics, items });
});

// ---- 雅思词汇诊断：答案留在服务端内存（30 分钟过期，参考 routes/comprehension.js）----
const QUIZ_TTL_MS = 30 * 60 * 1000;
const MAX_QUIZZES = 200; // 兜底上限：超出时淘汰最早创建的
const CHECK_BANDS = ['B1', 'B2', 'C1'];
const PER_BAND = 10;
const OPTION_COUNT = 4;
const quizzes = new Map(); // quizId -> { createdAt, expires, items: Map(id -> { key, word, cn, band, pos, phon }) }

function sweepQuizzes() {
  const now = Date.now();
  for (const [id, q] of quizzes) {
    if (q.expires <= now) quizzes.delete(id);
  }
  while (quizzes.size > MAX_QUIZZES) quizzes.delete(quizzes.keys().next().value);
}

// 中文四选一：干扰项优先取同词性的雅思词，不够再取其它雅思词，最后才借用全局词典
function buildOptions(entry, vocab) {
  const used = new Set([entry.cn]);
  const opts = [entry.cn];
  const pools = [
    shuffle(vocab.filter((e) => e.key !== entry.key && e.pos === entry.pos)),
    shuffle(vocab.filter((e) => e.key !== entry.key && e.pos !== entry.pos)),
  ];
  for (const pool of pools) {
    for (const e of pool) {
      if (opts.length >= OPTION_COUNT) break;
      if (!e.cn || used.has(e.cn)) continue;
      used.add(e.cn);
      opts.push(e.cn);
    }
  }
  if (opts.length < OPTION_COUNT) {
    for (const e of shuffle(buildLookupDict())) {
      if (opts.length >= OPTION_COUNT) break;
      if (!e.cn || used.has(e.cn) || e.key === entry.key) continue;
      used.add(e.cn);
      opts.push(e.cn);
    }
  }
  return shuffle(opts);
}

// GET /ielts/vocab-check —— 从 B1 / B2 / C1 各抽 10 个
router.get('/ielts/vocab-check', (req, res) => {
  const vocab = uniqueVocab().filter((e) => e.key && e.cn);
  const picked = [];
  for (const band of CHECK_BANDS) {
    picked.push(...shuffle(vocab.filter((e) => e.cefr === band)).slice(0, PER_BAND));
  }
  if (!picked.length) return bad(res, '雅思词汇库中没有 B1 / B2 / C1 词条，暂无法诊断');

  const quizId = crypto.randomUUID();
  const answers = new Map();
  const items = picked.map((e, i) => {
    const id = `q${i + 1}`;
    answers.set(id, { key: e.key, word: e.word, cn: e.cn, band: e.cefr, pos: e.pos || '', phon: e.phon || '' });
    return { id, word: e.word, options: buildOptions(e, vocab) };
  });

  sweepQuizzes();
  const now = Date.now();
  quizzes.set(quizId, { createdAt: now, expires: now + QUIZ_TTL_MS, items: answers });
  res.json({ quizId, ttlMinutes: QUIZ_TTL_MS / 60000, count: items.length, items });
});

// 四选一猜测校正：覆盖率 = (答对 − 答错/3) / 题数；未作答（choice 为空）只算不会、不扣猜测分
function bandCoverage(correct, wrongAnswered, total) {
  if (!total) return null;
  const v = Math.round(((correct - wrongAnswered / (OPTION_COUNT - 1)) / total) * 100);
  return Math.min(100, Math.max(0, v));
}

// POST /ielts/vocab-check  body { quizId, answers: [{ id, choice }] }
router.post('/ielts/vocab-check', (req, res) => {
  sweepQuizzes();
  const body = req.body;
  if (!isPlainObject(body)) return bad(res, '请求体必须是 JSON 对象');
  if (typeof body.quizId !== 'string' || !body.quizId) return bad(res, 'quizId 不能为空');
  if (!Array.isArray(body.answers) || !body.answers.length) return bad(res, 'answers 必须是非空数组');
  const quiz = quizzes.get(body.quizId);
  if (!quiz) return res.status(404).json({ error: '诊断不存在或已过期（30 分钟），请重新开始' });

  const choices = new Map();
  for (const a of body.answers) {
    if (!isPlainObject(a) || typeof a.id !== 'string' || !quiz.items.has(a.id)) continue;
    if (a.choice != null && typeof a.choice !== 'string') return bad(res, 'answers[].choice 必须是字符串或 null');
    choices.set(a.id, a.choice ? a.choice : '');
  }
  if (!choices.size) return bad(res, 'answers 中没有本次诊断的有效题目');

  const tally = {};
  const wrong = [];
  for (const [id, it] of quiz.items) {
    const t = tally[it.band] || (tally[it.band] = { total: 0, correct: 0, wrongAnswered: 0 });
    t.total++;
    const choice = choices.get(id) || '';
    if (choice === it.cn) {
      t.correct++;
      continue;
    }
    if (choice) t.wrongAnswered++;
    wrong.push({ id, word: it.word, key: it.key, pos: it.pos, phon: it.phon, band: it.band, cn: it.cn, choice: choice || null });
  }

  // 总覆盖率按雅思词表各段词数加权，估算整张 B1–C1 词表的覆盖率
  const bandSizes = {};
  for (const e of uniqueVocab()) bandSizes[e.cefr] = (bandSizes[e.cefr] || 0) + 1;
  const byBand = {};
  let weighted = 0;
  let weight = 0;
  for (const band of CHECK_BANDS) {
    const t = tally[band];
    if (!t) continue;
    const coverage = bandCoverage(t.correct, t.wrongAnswered, t.total);
    byBand[band] = { total: t.total, correct: t.correct, coverage };
    const w = bandSizes[band] || t.total;
    weighted += coverage * w;
    weight += w;
  }
  const overall = weight ? Math.round(weighted / weight) : 0;

  quizzes.delete(body.quizId); // 一次性判分，判完即释放
  const user = ielts.loadUser();
  user.vocabChecks.push({ ts: Date.now(), byBand, overall });
  ielts.saveUser(user);
  recordActivity(overall >= 60, 'ielts-vocab');

  const total = quiz.items.size;
  res.json({ total, correct: total - wrong.length, byBand, overall, wrong });
});

// ---- 写作 ----
function writingStats(writings) {
  const m = new Map();
  for (const w of writings) {
    const s = m.get(w.promptId) || { done: 0, bestBand: null };
    s.done++;
    if (typeof w.band === 'number' && (s.bestBand == null || w.band > s.bestBand)) s.bestBand = w.band;
    m.set(w.promptId, s);
  }
  return m;
}

// GET /ielts/writing?task=&variant=&topic=&qtype= —— 列表不含 modelAnswer，带本人提交次数与最高分
router.get('/ielts/writing', (req, res) => {
  const task = strParam(req.query.task);
  const variant = strParam(req.query.variant);
  const topic = strParam(req.query.topic);
  const qtype = strParam(req.query.qtype);
  if (task === null || (task && task !== '1' && task !== '2')) return bad(res, 'task 必须是 1 或 2');
  if (variant === null || (variant && variant !== 'A' && variant !== 'G')) return bad(res, 'variant 必须是 A 或 G');
  if (topic === null || topic.length > 40) return bad(res, 'topic 必须是不超过 40 字的字符串');
  if (qtype === null || (qtype && !QTYPES.includes(qtype))) return bad(res, `qtype 必须是 ${QTYPES.join(' / ')} 之一`);

  const stats = writingStats(ielts.loadUser().writings);
  const items = [...ielts.getContent().writingById.values()]
    .filter((w) => {
      if (task && String(w.task) !== task) return false;
      if (variant && w.variant !== variant) return false;
      if (topic && w.topic !== topic) return false;
      if (qtype && w.qtype !== qtype) return false;
      return true;
    })
    .map((w) => {
      const { modelAnswer, ...rest } = w;
      const s = stats.get(w.id) || { done: 0, bestBand: null };
      return { ...rest, done: s.done, bestBand: s.bestBand };
    });
  res.json({ total: items.length, items });
});

// GET /ielts/writing/:id —— 完整题目（含 modelAnswer，前端提交前隐藏）
router.get('/ielts/writing/:id', (req, res) => {
  if (!ID_RE.test(req.params.id)) return bad(res, 'id 非法');
  const w = ielts.getWriting(req.params.id);
  if (!w) return res.status(404).json({ error: '写作题目不存在' });
  res.json(w);
});

// POST /ielts/writing/submit  body { promptId, text, durationSec, selfScores }
router.post('/ielts/writing/submit', (req, res) => {
  const body = req.body;
  if (!isPlainObject(body)) return bad(res, '请求体必须是 JSON 对象');
  if (typeof body.promptId !== 'string' || !ID_RE.test(body.promptId)) return bad(res, 'promptId 非法');
  const prompt = ielts.getWriting(body.promptId);
  if (!prompt) return bad(res, `promptId 不存在：${body.promptId}`);
  const task = prompt.task;
  if (task !== 1 && task !== 2) return res.status(500).json({ error: `题目 ${prompt.id} 的 task 数据有误，请运行 npm run validate` });

  if (typeof body.text !== 'string' || !body.text.trim()) return bad(res, 'text 不能为空');
  if (body.text.length > ielts.MAX_TEXT) return bad(res, `text 最长 ${ielts.MAX_TEXT} 字符`);
  const durationSec = durationParam(body.durationSec, MAX_DURATION_SEC.writing);
  if (Number.isNaN(durationSec)) return bad(res, `durationSec 必须是 0–${MAX_DURATION_SEC.writing} 的整数（秒）`);
  const sc = validateScores(body.selfScores, WRITING_SCORE_KEYS[task]);
  if (sc.error) return bad(res, sc.error);

  const wordCount = ielts.countWords(body.text);
  const minWords = MIN_WORDS[task];
  const entry = {
    id: crypto.randomUUID(),
    promptId: prompt.id,
    task,
    variant: task === 1 ? prompt.variant || 'A' : null,
    text: body.text,
    wordCount,
    durationSec,
    selfScores: sc.scores,
    band: planEngine.bandFromScores(sc.scores),
    ts: Date.now(),
  };
  const user = ielts.loadUser();
  user.writings.push(entry);
  ielts.saveUser(user);
  recordActivity(wordCount >= minWords, 'ielts-writing');

  const warning = wordCount < minWords
    ? `字数不足：Task ${task} 至少 ${minWords} 词，本篇 ${wordCount} 词（考试中字数不足会被扣分）`
    : null;
  res.json({ ok: true, entry, band: entry.band, wordCount, minWords, warning });
});

// ---- 口语 ----

// 列表只给概要，不含参考答案；Part 2 条目带 Part 3 追问题数
function speakingSummary(s) {
  const out = { id: s.id, part: s.part, topic: s.topic || '', topicCn: s.topicCn || '' };
  if (s.part === 1) {
    out.questionCount = Array.isArray(s.questions) ? s.questions.length : 0;
  } else {
    out.category = s.category || '';
    if (isPlainObject(s.cueCard)) {
      out.cueCard = { title: s.cueCard.title || '', points: s.cueCard.points || [], final: s.cueCard.final || '' };
    }
    out.part3Count = Array.isArray(s.part3) ? s.part3.length : 0;
  }
  return out;
}

// GET /ielts/speaking?part=1|2 —— Part 3 追问随 Part 2 题卡提供
router.get('/ielts/speaking', (req, res) => {
  const part = strParam(req.query.part);
  if (part === null || (part && part !== '1' && part !== '2')) {
    return bad(res, 'part 必须是 1 或 2（Part 3 追问随 Part 2 题卡提供）');
  }
  const items = [...ielts.getContent().speakingById.values()]
    .filter((s) => !part || String(s.part) === part)
    .map(speakingSummary);
  res.json({ total: items.length, items });
});

// GET /ielts/speaking/:id —— 完整条目（含参考答案）
router.get('/ielts/speaking/:id', (req, res) => {
  if (!ID_RE.test(req.params.id)) return bad(res, 'id 非法');
  const s = ielts.getSpeaking(req.params.id);
  if (!s) return res.status(404).json({ error: '口语题目不存在' });
  res.json(s);
});

// POST /ielts/speaking/submit  body { itemId, part, durationSec, selfScores, notes }
router.post('/ielts/speaking/submit', (req, res) => {
  const body = req.body;
  if (!isPlainObject(body)) return bad(res, '请求体必须是 JSON 对象');
  if (typeof body.itemId !== 'string' || !ID_RE.test(body.itemId)) return bad(res, 'itemId 非法');
  const item = ielts.getSpeaking(body.itemId);
  if (!item) return bad(res, `itemId 不存在：${body.itemId}`);
  const part = body.part;
  if (part !== 1 && part !== 2 && part !== 3) return bad(res, 'part 必须是 1、2 或 3');
  if (item.part === 1 && part !== 1) return bad(res, '该条目是 Part 1 话题，part 只能是 1');
  if (item.part === 2 && part === 1) return bad(res, '该条目是 Part 2 题卡，part 只能是 2 或 3（Part 3 追问）');
  const durationSec = durationParam(body.durationSec, MAX_DURATION_SEC.speaking);
  if (Number.isNaN(durationSec)) return bad(res, `durationSec 必须是 0–${MAX_DURATION_SEC.speaking} 的整数（秒）`);
  const sc = validateScores(body.selfScores, SPEAKING_SCORE_KEYS);
  if (sc.error) return bad(res, sc.error);
  if (body.notes != null && typeof body.notes !== 'string') return bad(res, 'notes 必须是字符串');
  const notes = (body.notes || '').trim();
  if (notes.length > MAX_NOTES) return bad(res, `notes 最长 ${MAX_NOTES} 字符`);

  const entry = {
    id: crypto.randomUUID(),
    itemId: item.id,
    part,
    durationSec,
    selfScores: sc.scores,
    band: planEngine.bandFromScores(sc.scores),
    notes,
    ts: Date.now(),
  };
  const user = ielts.loadUser();
  user.speakings.push(entry);
  ielts.saveUser(user);
  recordActivity(true, 'ielts-speaking');
  res.json({ ok: true, entry, band: entry.band });
});

// ---- 评分维度 ----
router.get('/ielts/rubrics', (req, res) => {
  const r = ielts.getRubrics();
  if (!r) return res.status(404).json({ error: '评分维度数据缺失（data/ielts/rubrics.json）' });
  res.json(r);
});

// ---- 记录与总览 ----

// 记录里补一个题目标题，前端列表直接展示
function historyTitle(type, r) {
  if (type === 'writing') {
    const w = ielts.getWriting(r.promptId);
    const p = w ? String(w.prompt || '') : '';
    return p.length > 80 ? `${p.slice(0, 80)}…` : p;
  }
  const s = ielts.getSpeaking(r.itemId);
  if (!s) return '';
  if (s.part === 1) return s.topicCn ? `${s.topic}（${s.topicCn}）` : s.topic || '';
  return (s.cueCard && s.cueCard.title) || '';
}

// GET /ielts/history?type=writing|speaking&limit= —— 倒序
router.get('/ielts/history', (req, res) => {
  const type = strParam(req.query.type);
  if (type !== 'writing' && type !== 'speaking') return bad(res, 'type 必须是 writing 或 speaking');
  const limit = intParam(req.query.limit, 1, ielts.MAX_RECORDS, 50);
  if (Number.isNaN(limit)) return bad(res, `limit 必须是 1–${ielts.MAX_RECORDS} 的整数`);
  const user = ielts.loadUser();
  const list = (type === 'writing' ? user.writings : user.speakings).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const items = list.slice(0, limit).map((r) => ({ ...r, title: historyTitle(type, r) }));
  res.json({ type, total: list.length, items });
});

// GET /ielts/summary —— 供总览、水平页和首页使用
router.get('/ielts/summary', (req, res) => {
  const user = ielts.loadUser();
  const metrics = planEngine.computeMetrics(user);
  const last = metrics.vocab;
  res.json({
    active: user.profile.active,
    writing: { last3Avg: metrics.writing.avg, count: user.writings.length },
    speaking: { last3Avg: metrics.speaking.avg, count: user.speakings.length },
    vocab: {
      lastOverall: last ? last.overall : null,
      byBand: last ? last.byBand : null,
      ts: last ? last.ts : null,
    },
    estimate: planEngine.estimateOverall(metrics),
  });
});

module.exports = router;
