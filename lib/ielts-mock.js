'use strict';
// 雅思全真模考：组卷（最近没做过的内容优先）、各部分提交的校验与判分、写作加权与总分、模考状态机、
// 模考记录清洗、对外视图与错题复盘。设计见 docs/design/ielts-mock-20261125.md。
// 计算部分写成纯函数（显式传入 now / rand / 内容读取函数），读写 ielts.json 由 routes/ielts-mock.js 负责。

const ielts = require('./ielts');
const listening = require('./ielts-listening');
const reading = require('./ielts-reading');
const { floorHalf, officialRound, bandFromScores } = require('./ielts-plan');

// ---- 枚举与常量（与设计文档 §2–§6 保持一致）----
const SECTIONS = ['listening', 'reading', 'writing', 'speaking'];
const SECTION_LABEL = { listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' };
const STATUSES = ['in-progress', 'finished', 'abandoned'];
const STATES = ['pending', 'running', 'done', 'skipped'];
const ACTIONS = ['begin', 'submit', 'abandon'];
const EXAM_TYPES = ['A', 'G'];
const LISTENING_PARTS = [1, 2, 3, 4];
const READING_ORDER = ['easy', 'medium', 'hard'];
const READING_COUNT = 3;
const WRITING_TASKS = ['task1', 'task2'];
// 限时部分的总时长（秒）；听力由音频驱动、口语按题计时，不设总时限
const LIMIT_SEC = { reading: 3600, writing: 3600 };
// 提交时 durationSec 的合法上限（与各模块提交接口一致）
const MAX_DURATION_SEC = { listening: 7200, reading: 14400, writing: 14400, speaking: 3600 };
const MAX_MOCKS = 50;
const MAX_READING_ANSWER = 200;
const MAX_NOTES = 2000;
const WRITING_SCORE_KEYS = { 1: ['TA', 'CC', 'LR', 'GRA'], 2: ['TR', 'CC', 'LR', 'GRA'] };
const SPEAKING_SCORE_KEYS = ['FC', 'LR', 'GRA', 'P'];
const SUBMIT_KEYS = {
  listening: ['answers', 'durationSec'],
  reading: ['answers', 'durationSec'],
  writing: ['task1', 'task2', 'durationSec'],
  speaking: ['selfScores', 'notes', 'durationSec'],
};
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BAND_NOTE =
  '听力、阅读按原始分查常见的近似换算表（阅读 39 题先折算到 40 题），只是估算；写作、口语是四维自评，向下取整到 0.5；' +
  '总分为四项平均后按官方规则取整（.25 进为 .5，.75 进为整数）。只用来看趋势，不代表真实考试成绩。';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
const isId = (v) => typeof v === 'string' && ID_RE.test(v);
const isTs = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isOptTs = (v) => v === null || isTs(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isOptBand = (v) => v === null || ielts.isBand(v, 0);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const DEFAULT_GETTERS = {
  getSection: (id) => listening.getSection(id),
  getPassage: (id) => reading.getPassage(id),
  getWriting: (id) => ielts.getWriting(id),
  getSpeaking: (id) => ielts.getSpeaking(id),
};

// ---------------- 组卷 ----------------

/**
 * 各类内容最近一次被使用的时间：各模块作答记录的 ts，加上历次模考（含进行中、已放弃）试卷里的 id（取模考 createdAt）。
 * @returns {{ listening: Map, reading: Map, writing: Map, speaking: Map }} id → 最近使用时间
 */
function usageFromUser(user) {
  const used = { listening: new Map(), reading: new Map(), writing: new Map(), speaking: new Map() };
  const touch = (map, id, ts) => {
    if (typeof id !== 'string' || !id || typeof ts !== 'number' || !Number.isFinite(ts)) return;
    if (!map.has(id) || map.get(id) < ts) map.set(id, ts);
  };
  const src = isPlainObject(user) ? user : {};
  for (const r of listening.sanitizeListenings(src.listenings)) touch(used.listening, r.sectionId, r.ts);
  for (const r of reading.sanitizeReadings(src.readings)) touch(used.reading, r.passageId, r.ts);
  for (const r of Array.isArray(src.writings) ? src.writings : []) if (isPlainObject(r)) touch(used.writing, r.promptId, r.ts);
  for (const r of Array.isArray(src.speakings) ? src.speakings : []) if (isPlainObject(r)) touch(used.speaking, r.itemId, r.ts);
  for (const m of sanitizeMocks(src.mocks)) {
    const p = m.paper;
    const ts = m.createdAt;
    p.listening.forEach((id) => touch(used.listening, id, ts));
    p.reading.forEach((id) => touch(used.reading, id, ts));
    WRITING_TASKS.forEach((k) => touch(used.writing, p.writing[k], ts));
    touch(used.speaking, p.speaking.part1, ts);
    touch(used.speaking, p.speaking.part2, ts);
  }
  return used;
}

function shuffled(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 从候选里挑一个：从没用过的里随机挑；全部用过时挑最久没用的。
 * 先随机打乱再按最近使用时间升序稳定排序（Array#sort 是稳定排序），同一使用时间的候选保持随机顺序。
 */
function pickLeastRecent(candidates, used, rand) {
  if (!candidates.length) return null;
  const lastOf = (it) => (used && used.get(it.id)) || 0;
  return shuffled(candidates, rand || Math.random).sort((a, b) => lastOf(a) - lastOf(b))[0];
}

// 阅读只用内容校验零 error 的文章（判分依赖结构完整）；按内容对象缓存，题库重载后自动失效
let validPassageCache = { content: null, list: [] };
function validPassages() {
  const c = reading.getContent();
  if (validPassageCache.content !== c) {
    const list = [...c.byId.values()].filter((p) => reading.validateReadingContent([p]).errors.length === 0);
    validPassageCache = { content: c, list };
  }
  return validPassageCache.list;
}

/** 默认题库：听力（已过滤数据有误的 section）、阅读（校验通过的文章）、写作、口语 */
function defaultPools() {
  const c = ielts.getContent();
  return {
    listening: listening.getSections(),
    reading: validPassages(),
    writing: [...c.writingById.values()],
    speaking: [...c.speakingById.values()],
  };
}

/**
 * 组卷（纯函数）。opts: { examType: 'A'|'G', used: usageFromUser(), rand: () => [0,1), pools: defaultPools() }
 * @returns {{ paper } | { error }}
 */
function assemblePaper(opts) {
  const o = opts || {};
  const used = o.used || usageFromUser({});
  const rand = o.rand || Math.random;
  const pools = o.pools || defaultPools();

  const listeningIds = [];
  for (const part of LISTENING_PARTS) {
    const pick = pickLeastRecent(pools.listening.filter((s) => s.part === part), used.listening, rand);
    if (!pick) return { error: `题库不足：听力 Part ${part} 没有可用的 section，无法组卷` };
    listeningIds.push(pick.id);
  }

  // 阅读：易、中、难各 1 篇；某个难度没有文章时从其余文章里补足，最后按易 → 中 → 难排列
  const chosen = [];
  for (const d of READING_ORDER) {
    const pick = pickLeastRecent(pools.reading.filter((p) => p.difficulty === d), used.reading, rand);
    if (pick) chosen.push(pick);
  }
  while (chosen.length < READING_COUNT) {
    const pick = pickLeastRecent(pools.reading.filter((p) => !chosen.includes(p)), used.reading, rand);
    if (!pick) break;
    chosen.push(pick);
  }
  if (chosen.length < READING_COUNT) return { error: `题库不足：阅读可用文章不足 ${READING_COUNT} 篇，无法组卷` };
  const rank = (p) => (READING_ORDER.includes(p.difficulty) ? READING_ORDER.indexOf(p.difficulty) : READING_ORDER.length);
  chosen.sort((a, b) => rank(a) - rank(b));

  const variant = o.examType === 'G' ? 'G' : 'A';
  const task1 = pickLeastRecent(
    pools.writing.filter((w) => w.task === 1 && (w.variant || 'A') === variant && typeof w.prompt === 'string'),
    used.writing,
    rand
  );
  if (!task1) return { error: `题库不足：没有 ${variant} 类写作 Task 1 题目，无法组卷` };
  const task2 = pickLeastRecent(pools.writing.filter((w) => w.task === 2 && typeof w.prompt === 'string'), used.writing, rand);
  if (!task2) return { error: '题库不足：没有写作 Task 2 题目，无法组卷' };

  const part1 = pickLeastRecent(
    pools.speaking.filter((s) => s.part === 1 && Array.isArray(s.questions) && s.questions.length),
    used.speaking,
    rand
  );
  if (!part1) return { error: '题库不足：没有口语 Part 1 话题，无法组卷' };
  const part2 = pickLeastRecent(pools.speaking.filter((s) => s.part === 2 && isPlainObject(s.cueCard)), used.speaking, rand);
  if (!part2) return { error: '题库不足：没有口语 Part 2 题卡，无法组卷' };

  return {
    paper: {
      listening: listeningIds,
      reading: chosen.map((p) => p.id),
      writing: { task1: task1.id, task2: task2.id },
      speaking: { part1: part1.id, part2: part2.id },
    },
  };
}

function emptySection() {
  return { state: 'pending', startedAt: null, submittedAt: null, restarts: 0 };
}

function createMock({ id, paper, examType, now }) {
  return {
    id,
    status: 'in-progress',
    examType: examType === 'G' ? 'G' : 'A',
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    paper,
    sections: Object.fromEntries(SECTIONS.map((k) => [k, emptySection()])),
    result: null,
  };
}

// ---------------- 记录清洗（ielts.json 的 mocks 数组）----------------

function isValidPaper(p) {
  return (
    isPlainObject(p) &&
    Array.isArray(p.listening) && p.listening.length === LISTENING_PARTS.length && p.listening.every(isId) &&
    Array.isArray(p.reading) && p.reading.length === READING_COUNT && p.reading.every(isId) &&
    isPlainObject(p.writing) && isId(p.writing.task1) && isId(p.writing.task2) &&
    isPlainObject(p.speaking) && isId(p.speaking.part1) && isId(p.speaking.part2)
  );
}

function isValidSectionRecord(s, name) {
  if (!isPlainObject(s) || !STATES.includes(s.state) || !isCount(s.restarts)) return false;
  if (!isOptTs(s.startedAt) || !isOptTs(s.submittedAt)) return false;
  if (s.state === 'running' && !isTs(s.startedAt)) return false;
  if (s.state !== 'done') return true;
  if (!ielts.isBand(s.band, 0) || !isCount(s.durationSec) || !isTs(s.submittedAt)) return false;
  if (name === 'listening' || name === 'reading') {
    return Number.isInteger(s.total) && s.total > 0 && isCount(s.raw) && s.raw <= s.total &&
      (s.answers === undefined || isPlainObject(s.answers)) && (s.parts === undefined || Array.isArray(s.parts));
  }
  if (name === 'writing') return isPlainObject(s.tasks);
  if (name === 'speaking') return isPlainObject(s.selfScores);
  return true;
}

function isValidResult(r) {
  return isPlainObject(r) && SECTIONS.every((k) => isOptBand(r[k])) && isOptBand(r.overall) && typeof r.complete === 'boolean';
}

function isValidMock(m) {
  if (!isPlainObject(m) || !isId(m.id) || !STATUSES.includes(m.status) || !EXAM_TYPES.includes(m.examType)) return false;
  if (!isTs(m.createdAt) || !isTs(m.updatedAt) || !isOptTs(m.finishedAt)) return false;
  if (!isValidPaper(m.paper) || !isPlainObject(m.sections)) return false;
  if (!SECTIONS.every((k) => isValidSectionRecord(m.sections[k], k))) return false;
  if (m.status === 'finished') return isTs(m.finishedAt) && isValidResult(m.result);
  return m.result === null || m.result === undefined;
}

/** 过滤结构不合法的记录，只保留最近 MAX_MOCKS 条（数组按创建顺序追加，新的在后） */
function sanitizeMocks(list) {
  const ok = Array.isArray(list) ? list.filter(isValidMock) : [];
  return ok.length > MAX_MOCKS ? ok.slice(-MAX_MOCKS) : ok;
}

/** 进行中的模考（正常情况下最多一套；数据异常有多套时取最新的） */
function activeMock(mocks) {
  let found = null;
  for (const m of mocks) if (m.status === 'in-progress' && (!found || m.createdAt >= found.createdAt)) found = m;
  return found;
}

// ---------------- 状态机 ----------------

/** 当前部分：第一个 pending / running 的部分；全部 done / skipped 时为 null */
function currentSection(mock) {
  for (const k of SECTIONS) {
    const s = mock.sections[k].state;
    if (s === 'pending' || s === 'running') return k;
  }
  return null;
}

// 能否对 name 部分做操作：模考进行中，且 name 正是当前部分；可以时返回 null，否则返回原因
function actionError(mock, name) {
  if (mock.status !== 'in-progress') return `这套模考已${mock.status === 'finished' ? '出分' : '放弃'}，不能再操作`;
  if (!SECTIONS.includes(name)) return `section 必须是 ${SECTIONS.join(' / ')} 之一`;
  const cur = currentSection(mock);
  if (name === cur) return null;
  const state = mock.sections[name].state;
  if (state === 'done') return `${SECTION_LABEL[name]}部分已保存，不能再操作`;
  if (state === 'skipped') return `${SECTION_LABEL[name]}部分已放弃，不能再操作`;
  return `请先完成${SECTION_LABEL[cur]}部分（按 听力 → 阅读 → 写作 → 口语 的顺序进行）`;
}

/**
 * 开始（或重新开始）当前部分：置为 running 并记服务端开始时间。已在 running 时视为「重新开始本部分」，restarts + 1。
 * 直接修改 mock。@returns {{ ok, restarted } | { error }}
 */
function beginSection(mock, name, now) {
  const err = actionError(mock, name);
  if (err) return { error: err };
  const s = mock.sections[name];
  const restarted = s.state === 'running';
  if (restarted) s.restarts += 1;
  s.state = 'running';
  s.startedAt = now;
  s.submittedAt = null;
  mock.updatedAt = now;
  return { ok: true, restarted };
}

/** 放弃当前部分（未开始或计时中均可）：记为 skipped，不出分；submittedAt 记放弃时间 */
function abandonSection(mock, name, now) {
  const err = actionError(mock, name);
  if (err) return { error: err };
  const s = mock.sections[name];
  s.state = 'skipped';
  s.submittedAt = now;
  mock.updatedAt = now;
  return { ok: true };
}

/** 提交前的状态校验：必须是当前部分且已开始计时 */
function submitError(mock, name) {
  const err = actionError(mock, name);
  if (err) return err;
  if (mock.sections[name].state !== 'running') return `${SECTION_LABEL[name]}部分还没开始计时，请先开始（action: begin）再提交`;
  return null;
}

// ---------------- 请求体校验与判分 ----------------

/**
 * 校验 POST /ielts/mock/:id/section 的请求体外形（section / action / 允许的字段）；状态与内容由后续函数校验。
 * @returns {{ section, action } | { error }}
 */
function parseSectionRequest(body) {
  if (!isPlainObject(body)) return { error: '请求体必须是 JSON 对象' };
  if (!SECTIONS.includes(body.section)) return { error: `section 必须是 ${SECTIONS.join(' / ')} 之一` };
  if (!ACTIONS.includes(body.action)) return { error: `action 必须是 ${ACTIONS.join(' / ')} 之一` };
  const allowed = ['section', 'action', ...(body.action === 'submit' ? SUBMIT_KEYS[body.section] : [])];
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) return { error: `不支持的字段：${extra.join(', ')}（${body.action} 只接受 ${allowed.join(' / ')}）` };
  return { section: body.section, action: body.action };
}

// 缺省返回 0；非法返回 NaN（调用方报 400）
function durationParam(raw, max) {
  if (raw == null) return 0;
  return Number.isInteger(raw) && raw >= 0 && raw <= max ? raw : NaN;
}

function durationError(section) {
  return `durationSec 必须是 0–${MAX_DURATION_SEC[section]} 的整数（秒）`;
}

// 四维自评：必须恰好包含给定维度，每项 0–9、步长 0.5（与 routes/ielts.js 写作 / 口语提交一致）
function validateScores(scores, keys) {
  if (!isPlainObject(scores)) return { error: `selfScores 必须是对象，包含 ${keys.join(' / ')}` };
  const extra = Object.keys(scores).filter((k) => !keys.includes(k));
  if (extra.length) return { error: `selfScores 不支持的维度：${extra.join(', ')}（应为 ${keys.join(' / ')}）` };
  for (const k of keys) {
    if (!ielts.isBand(scores[k], 0)) return { error: `selfScores.${k} 必须是 0–9 之间、以 0.5 为步长的数字` };
  }
  return { scores: Object.fromEntries(keys.map((k) => [k, scores[k]])) };
}

const contentMissing = (what) => ({ error: `${what}已不在题库里（内容有变动），本部分只能放弃`, status: 500 });

function readingQuestionIds(p) {
  const ids = new Set();
  for (const g of Array.isArray(p.groups) ? p.groups : []) {
    for (const q of isPlainObject(g) && Array.isArray(g.questions) ? g.questions : []) {
      if (isPlainObject(q) && typeof q.id === 'string') ids.add(q.id);
    }
  }
  return ids;
}

/** 校验一篇阅读的作答：键只能是本篇题号，值为字符串或 null（≤ 200 字符）；允许全空 */
function parseReadingAnswers(p, raw) {
  if (raw == null) return { answers: {} };
  if (!isPlainObject(raw)) return { error: '必须是对象，形如 { "q1": "TRUE" }' };
  const ids = readingQuestionIds(p);
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ids.has(k)) return { error: `含本篇不存在的题号「${String(k).slice(0, 20)}」` };
    if (v == null) continue;
    if (typeof v !== 'string') return { error: `${k} 必须是字符串或 null` };
    if (v.length > MAX_READING_ANSWER) return { error: `${k} 最长 ${MAX_READING_ANSWER} 字符` };
    const t = v.trim();
    if (t) out[k] = t;
  }
  return { answers: out };
}

// answers 的键必须都是本套试卷的内容 id
function foreignKey(answers, ids) {
  return Object.keys(answers).find((k) => !ids.includes(k)) || null;
}

function gradeListening(mock, body, g) {
  const durationSec = durationParam(body.durationSec, MAX_DURATION_SEC.listening);
  if (Number.isNaN(durationSec)) return { error: durationError('listening') };
  if (!isPlainObject(body.answers)) return { error: 'answers 必须是对象，键为本套听力的 section id，值为 { "题号": "答案" }' };
  const ids = mock.paper.listening;
  const extra = foreignKey(body.answers, ids);
  if (extra) return { error: `answers 里有不属于本套模考的听力题目：${extra.slice(0, 64)}` };
  const parts = [];
  const answers = {};
  let raw = 0;
  let total = 0;
  for (const sid of ids) {
    const section = g.getSection(sid);
    if (!section) return contentMissing(`听力题目 ${sid} `);
    const parsed = listening.parseAnswers(section, body.answers[sid] == null ? {} : body.answers[sid]);
    if (parsed.error) return { error: `听力 Part ${section.part}（${sid}）：${parsed.error}` };
    const graded = listening.gradeSection(section, parsed.answers);
    parts.push({ sectionId: sid, part: section.part, raw: graded.raw, total: graded.total, band: graded.band, answers: parsed.answers });
    answers[sid] = parsed.answers;
    raw += graded.raw;
    total += graded.total;
  }
  // 4 个 section 原始分相加；总题数正好 40 时折算不改变原始分
  const est = listening.estimateBand(raw, total);
  return { graded: { raw, total, raw40: est.raw40, band: est.band, parts, answers, durationSec } };
}

function gradeReading(mock, body, g) {
  const durationSec = durationParam(body.durationSec, MAX_DURATION_SEC.reading);
  if (Number.isNaN(durationSec)) return { error: durationError('reading') };
  if (!isPlainObject(body.answers)) return { error: 'answers 必须是对象，键为本套阅读的文章 id，值为 { "q1": "答案" }' };
  const ids = mock.paper.reading;
  const extra = foreignKey(body.answers, ids);
  if (extra) return { error: `answers 里有不属于本套模考的阅读文章：${extra.slice(0, 64)}` };
  const parts = [];
  const answers = {};
  let raw = 0;
  let total = 0;
  for (const pid of ids) {
    const p = g.getPassage(pid);
    if (!p) return contentMissing(`阅读文章 ${pid} `);
    const parsed = parseReadingAnswers(p, body.answers[pid]);
    if (parsed.error) return { error: `answers.${pid}：${parsed.error}` };
    const graded = reading.gradePassage(p, parsed.answers);
    if (!graded.total) return { error: `阅读文章 ${pid} 没有可判分的题目，请检查阅读内容数据`, status: 500 };
    const est = reading.estimateBand(graded.raw, graded.total);
    parts.push({
      passageId: pid,
      raw: graded.raw,
      total: graded.total,
      band: est.band,
      wrong: graded.results.filter((r) => !r.correct).map((r) => r.id),
      answers: parsed.answers,
    });
    answers[pid] = parsed.answers;
    raw += graded.raw;
    total += graded.total;
  }
  // 3 篇共 39 题：按比例折算到 40 题后查学术类阅读换算表
  const est = reading.estimateBand(raw, total);
  return { graded: { raw, total, scaled40: est.scaled40, band: est.band, parts, answers, durationSec } };
}

/** 写作最终分：Task 2 权重是 Task 1 的两倍，(T1 + 2 × T2) / 3 后向下取整到 0.5 */
function writingBand(task1Band, task2Band) {
  return floorHalf((task1Band + 2 * task2Band) / 3);
}

// 一篇作文：正文非空时必须四维自评；正文为空记 0 分，不能带自评
function parseWritingTask(raw, prompt, key) {
  if (!isPlainObject(raw)) return { error: `${key} 必须是对象 { text, selfScores }` };
  const extra = Object.keys(raw).filter((k) => !['text', 'selfScores', 'durationSec'].includes(k));
  if (extra.length) return { error: `${key} 不支持的字段：${extra.join(', ')}` };
  if (typeof raw.text !== 'string') return { error: `${key}.text 必须是字符串（没写可以传空字符串）` };
  if (raw.text.length > ielts.MAX_TEXT) return { error: `${key}.text 最长 ${ielts.MAX_TEXT} 字符` };
  let durationSec = null; // null 表示前端没报单篇用时，之后按 1 : 2 拆总用时
  if (raw.durationSec != null) {
    durationSec = durationParam(raw.durationSec, MAX_DURATION_SEC.writing);
    if (Number.isNaN(durationSec)) return { error: `${key}.${durationError('writing')}` };
  }
  const base = { promptId: prompt.id, task: prompt.task, variant: prompt.task === 1 ? prompt.variant || 'A' : null, durationSec };
  if (!raw.text.trim()) {
    if (raw.selfScores != null) return { error: `${key} 没有正文，不能带 selfScores（空篇记 0 分）` };
    return { task: { ...base, text: '', wordCount: 0, selfScores: null, band: 0 } };
  }
  const sc = validateScores(raw.selfScores, WRITING_SCORE_KEYS[prompt.task]);
  if (sc.error) return { error: `${key}.${sc.error}` };
  return {
    task: { ...base, text: raw.text, wordCount: ielts.countWords(raw.text), selfScores: sc.scores, band: bandFromScores(sc.scores) },
  };
}

function gradeWriting(mock, body, g) {
  const durationSec = durationParam(body.durationSec, MAX_DURATION_SEC.writing);
  if (Number.isNaN(durationSec)) return { error: durationError('writing') };
  const tasks = {};
  for (const [i, key] of WRITING_TASKS.entries()) {
    const prompt = g.getWriting(mock.paper.writing[key]);
    if (!prompt) return contentMissing(`写作题目 ${mock.paper.writing[key]} `);
    if (prompt.task !== i + 1) return { error: `写作题目 ${prompt.id} 的 task 数据有误，请运行 npm run validate`, status: 500 };
    const r = parseWritingTask(body[key], prompt, key);
    if (r.error) return { error: r.error };
    tasks[key] = r.task;
  }
  // 单篇用时缺省时按建议的 20 : 40 分钟比例拆总用时
  if (tasks.task1.durationSec == null || tasks.task2.durationSec == null) {
    const t1 = Math.round(durationSec / 3);
    tasks.task1.durationSec = t1;
    tasks.task2.durationSec = durationSec - t1;
  }
  return { graded: { band: writingBand(tasks.task1.band, tasks.task2.band), tasks, durationSec } };
}

function gradeSpeaking(mock, body, g) {
  const durationSec = durationParam(body.durationSec, MAX_DURATION_SEC.speaking);
  if (Number.isNaN(durationSec)) return { error: durationError('speaking') };
  const sc = validateScores(body.selfScores, SPEAKING_SCORE_KEYS);
  if (sc.error) return { error: sc.error };
  if (body.notes != null && typeof body.notes !== 'string') return { error: 'notes 必须是字符串' };
  const notes = (body.notes || '').trim();
  if (notes.length > MAX_NOTES) return { error: `notes 最长 ${MAX_NOTES} 字符` };
  if (!g.getSpeaking(mock.paper.speaking.part2)) return contentMissing(`口语题卡 ${mock.paper.speaking.part2} `);
  const p1 = g.getSpeaking(mock.paper.speaking.part1);
  const topic = p1 ? [p1.topic, p1.topicCn].filter(Boolean).join(' / ') : mock.paper.speaking.part1;
  // 写进 speakings 的备注：标明来自模考和 Part 1 话题，再接用户备注（总长不超过 MAX_NOTES）
  const recordNotes = `[模考] Part 1：${topic}${notes ? `\n${notes}` : ''}`.slice(0, MAX_NOTES);
  return { graded: { selfScores: sc.scores, band: bandFromScores(sc.scores), notes, recordNotes, durationSec } };
}

/**
 * 校验并判分某部分的提交（请求体外形已由 parseSectionRequest 检查）。
 * @returns {{ graded } | { error, status? }}（status 缺省为 400；内容缺失等服务端问题为 500）
 */
function gradeSubmission(mock, section, body, getters) {
  const g = { ...DEFAULT_GETTERS, ...(getters || {}) };
  if (section === 'listening') return gradeListening(mock, body, g);
  if (section === 'reading') return gradeReading(mock, body, g);
  if (section === 'writing') return gradeWriting(mock, body, g);
  if (section === 'speaking') return gradeSpeaking(mock, body, g);
  return { error: `section 必须是 ${SECTIONS.join(' / ')} 之一` };
}

/**
 * 生成写进各模块的作答记录（都带 mockId），让现有记录和统计也能看到模考作答。
 * @returns {{ records: { listenings, readings, writings, speakings }, ids: { all: string[], writing: { task1, task2 } } }}
 */
function moduleRecords(mock, section, graded, now, newId) {
  const records = { listenings: [], readings: [], writings: [], speakings: [] };
  const writingIds = { task1: null, task2: null };
  if (section === 'listening') {
    const each = Math.round(graded.durationSec / graded.parts.length);
    for (const p of graded.parts) {
      records.listenings.push({
        id: newId(), sectionId: p.sectionId, part: p.part, mode: 'exam', raw: p.raw, total: p.total, band: p.band,
        durationSec: each, answers: p.answers, ts: now, mockId: mock.id,
      });
    }
  } else if (section === 'reading') {
    const each = Math.round(graded.durationSec / graded.parts.length);
    for (const p of graded.parts) {
      records.readings.push({
        id: newId(), passageId: p.passageId, mode: 'exam', raw: p.raw, total: p.total, band: p.band,
        durationSec: each, wrong: p.wrong, date: ielts.todayKey(now), ts: now, mockId: mock.id,
      });
    }
  } else if (section === 'writing') {
    for (const key of WRITING_TASKS) {
      const t = graded.tasks[key];
      if (!t.text) continue; // 空篇不写进写作记录
      const id = newId();
      writingIds[key] = id;
      records.writings.push({
        id, promptId: t.promptId, task: t.task, variant: t.variant, text: t.text, wordCount: t.wordCount,
        durationSec: t.durationSec, selfScores: t.selfScores, band: t.band, ts: now, mockId: mock.id,
      });
    }
  } else if (section === 'speaking') {
    // 与口语模块一致：Part 2 + 3 记为一次练习（itemId 为题卡，part 2）；Part 1 话题写在备注里
    records.speakings.push({
      id: newId(), itemId: mock.paper.speaking.part2, part: 2, durationSec: graded.durationSec,
      selfScores: graded.selfScores, band: graded.band, notes: graded.recordNotes, ts: now, mockId: mock.id,
    });
  }
  const all = [...records.listenings, ...records.readings, ...records.writings, ...records.speakings].map((r) => r.id);
  return { records, ids: { all, writing: writingIds } };
}

/** 把判分结果写回模考记录：该部分置为 done，保存分数与作答（复盘错题用） */
function applySubmit(mock, section, graded, ids, now) {
  const prev = mock.sections[section];
  const s = {
    state: 'done',
    startedAt: prev.startedAt,
    submittedAt: now,
    restarts: prev.restarts,
    durationSec: graded.durationSec,
    band: graded.band,
    recordIds: ids.all,
  };
  if (section === 'listening') {
    Object.assign(s, {
      raw: graded.raw, total: graded.total, raw40: graded.raw40,
      parts: graded.parts.map((p) => ({ sectionId: p.sectionId, part: p.part, raw: p.raw, total: p.total, band: p.band })),
      answers: graded.answers,
    });
  } else if (section === 'reading') {
    Object.assign(s, {
      raw: graded.raw, total: graded.total, scaled40: graded.scaled40,
      parts: graded.parts.map((p) => ({ passageId: p.passageId, raw: p.raw, total: p.total, band: p.band })),
      answers: graded.answers,
    });
  } else if (section === 'writing') {
    s.tasks = {};
    for (const key of WRITING_TASKS) {
      const t = graded.tasks[key];
      s.tasks[key] = {
        promptId: t.promptId, wordCount: t.wordCount, band: t.band, selfScores: t.selfScores,
        durationSec: t.durationSec, recordId: ids.writing[key],
      };
    }
  } else if (section === 'speaking') {
    s.selfScores = graded.selfScores;
  }
  mock.sections[section] = s;
  mock.updatedAt = now;
}

// ---------------- 出分与对比 ----------------

/** 总分：四项都有分时取平均，按官方规则取整到 0.5；缺任一项返回 null */
function overallBand(bands) {
  if (!Array.isArray(bands) || bands.length !== SECTIONS.length || bands.some((b) => typeof b !== 'number')) return null;
  return officialRound(bands.reduce((a, b) => a + b, 0) / bands.length);
}

function computeResult(mock) {
  const r = {};
  for (const k of SECTIONS) {
    const s = mock.sections[k];
    r[k] = s.state === 'done' ? s.band : null;
  }
  r.complete = SECTIONS.every((k) => r[k] !== null);
  r.overall = r.complete ? overallBand(SECTIONS.map((k) => r[k])) : null;
  return r;
}

/** 出分：四部分都已 done / skipped 才能出分。@returns {{ ok, anyDone } | { error }} */
function finishMock(mock, now) {
  if (mock.status !== 'in-progress') return { error: `这套模考已${mock.status === 'finished' ? '出分' : '放弃'}` };
  const open = SECTIONS.filter((k) => ['pending', 'running'].includes(mock.sections[k].state));
  if (open.length) {
    return { error: `还有未完成的部分：${open.map((k) => SECTION_LABEL[k]).join('、')}（可以先放弃该部分再出分）` };
  }
  mock.result = computeResult(mock);
  mock.status = 'finished';
  mock.finishedAt = now;
  mock.updatedAt = now;
  return { ok: true, anyDone: SECTIONS.some((k) => mock.sections[k].state === 'done') };
}

/** 放弃整套模考：不出分、不参与对比 */
function abandonMock(mock, now) {
  if (mock.status !== 'in-progress') return { error: `这套模考已${mock.status === 'finished' ? '出分' : '放弃'}` };
  mock.status = 'abandoned';
  mock.updatedAt = now;
  return { ok: true };
}

/** 本套之前最近一次出分的模考 */
function previousFinished(mocks, mock) {
  let best = null;
  for (const m of mocks) {
    if (m === mock || m.id === mock.id || m.status !== 'finished' || !(m.finishedAt < mock.finishedAt)) continue;
    if (!best || m.finishedAt > best.finishedAt) best = m;
  }
  return best;
}

/** 四项与总分的差值（两边都有分时才比，否则为 null） */
function compareResults(mock, prev) {
  if (!prev || !mock.result) return null;
  const deltas = {};
  for (const k of [...SECTIONS, 'overall']) {
    const a = mock.result[k];
    const b = prev.result[k];
    deltas[k] = typeof a === 'number' && typeof b === 'number' ? Math.round((a - b) * 10) / 10 : null;
  }
  return { previous: { id: prev.id, finishedAt: prev.finishedAt, result: prev.result }, deltas };
}

// ---------------- 错题复盘（只在出分后下发）----------------

function optionText(opts, key) {
  if (!Array.isArray(opts) || !key) return '';
  const k = String(key).toUpperCase();
  const hit = opts.find((o) => isPlainObject(o) && String(o.key).toUpperCase() === k);
  return hit ? String(hit.text || '') : '';
}

function reviewListening(mock, g) {
  const s = mock.sections.listening;
  if (s.state !== 'done') return [];
  const stored = Array.isArray(s.parts) ? s.parts : [];
  return mock.paper.listening.map((sid) => {
    const part = stored.find((p) => isPlainObject(p) && p.sectionId === sid) || {};
    const section = g.getSection(sid);
    if (!section) return { sectionId: sid, missing: true, raw: part.raw, total: part.total, wrong: [] };
    const answers = isPlainObject(s.answers) && isPlainObject(s.answers[sid]) ? s.answers[sid] : {};
    const graded = listening.gradeSection(section, answers);
    const info = new Map();
    section.groups.forEach((gr) => gr.questions.forEach((q) => info.set(q.no, { q, gr })));
    const wrong = graded.results.filter((r) => !r.correct).map((r) => {
      const { q, gr } = info.get(r.no);
      const opts = gr.type === 'mcq' ? q.options : gr.type === 'matching' ? gr.options : null;
      return {
        no: r.no, type: gr.type, prompt: q.prompt, yours: r.yours, yoursText: optionText(opts, r.yours),
        answer: r.answer, answerText: opts ? optionText(opts, r.answer[0]) : '', overLimit: r.overLimit, explanation: r.explanation,
      };
    });
    return {
      sectionId: sid, part: section.part, title: section.title, titleCn: section.titleCn || '',
      raw: Number.isInteger(part.raw) ? part.raw : graded.raw, total: Number.isInteger(part.total) ? part.total : graded.total, wrong,
    };
  });
}

// 摘要填空没有题干：取占位符所在的句子，空位画成横线
function summarySnippet(text, qid) {
  const t = String(text || '');
  const mark = `{${qid}}`;
  const i = t.indexOf(mark);
  if (i < 0) return '';
  const before = Math.max(t.lastIndexOf('. ', i), t.lastIndexOf('? ', i), t.lastIndexOf('! ', i));
  const start = before < 0 ? 0 : before + 2;
  const after = t.indexOf('. ', i + mark.length);
  const end = after < 0 ? t.length : after + 1;
  return t.slice(start, end).replace(mark, '_____').replace(/\{q\d{1,3}\}/g, '___').trim();
}

function readingPrompt(q, g) {
  if (g.type === 'summary-completion') return summarySnippet(g.summary && g.summary.text, q.id);
  if (g.type === 'matching-headings') return String(q.prompt || `Paragraph ${q.para || ''}`);
  return String(q.prompt || '').replace('{blank}', '_____');
}

function reviewReading(mock, g) {
  const s = mock.sections.reading;
  if (s.state !== 'done') return [];
  const stored = Array.isArray(s.parts) ? s.parts : [];
  let offset = 0; // 题号按真实考试连续编号：第 2 篇从 14 开始
  return mock.paper.reading.map((pid) => {
    const part = stored.find((p) => isPlainObject(p) && p.passageId === pid) || {};
    const myOffset = offset;
    const p = g.getPassage(pid);
    if (!p) {
      offset += Number.isInteger(part.total) ? part.total : 0;
      return { passageId: pid, missing: true, offset: myOffset, raw: part.raw, total: part.total, wrong: [] };
    }
    const answers = isPlainObject(s.answers) && isPlainObject(s.answers[pid]) ? s.answers[pid] : {};
    const graded = reading.gradePassage(p, answers);
    offset += graded.total;
    const info = new Map();
    for (const gr of p.groups) for (const q of gr.questions) info.set(q.id, { q, gr });
    const wrong = graded.results.filter((r) => !r.correct).map((r) => {
      const { q, gr } = info.get(r.id);
      return {
        id: r.id, number: r.number, displayNo: myOffset + r.number, type: r.type, prompt: readingPrompt(q, gr),
        yours: r.response, answer: r.answer, answerText: r.answerText, blank: r.blank, overLimit: r.overLimit,
        explanation: r.explanation, evidence: r.evidence,
      };
    });
    return {
      passageId: pid, title: String(p.title || ''), titleCn: String(p.titleCn || ''), difficulty: p.difficulty, offset: myOffset,
      raw: Number.isInteger(part.raw) ? part.raw : graded.raw, total: Number.isInteger(part.total) ? part.total : graded.total, wrong,
    };
  });
}

function reviewWriting(mock, g) {
  const s = mock.sections.writing;
  if (s.state !== 'done' || !isPlainObject(s.tasks)) return null;
  const out = {};
  for (const key of WRITING_TASKS) {
    const t = isPlainObject(s.tasks[key]) ? s.tasks[key] : {};
    const promptId = t.promptId || mock.paper.writing[key];
    const w = g.getWriting(promptId);
    out[key] = {
      promptId,
      prompt: w ? String(w.prompt || '') : '',
      variant: w && w.task === 1 ? w.variant || 'A' : null,
      band: typeof t.band === 'number' ? t.band : null,
      wordCount: Number.isInteger(t.wordCount) ? t.wordCount : 0,
      selfScores: isPlainObject(t.selfScores) ? t.selfScores : null,
      recordId: t.recordId || null,
    };
  }
  return out;
}

function scoresOf(mock) {
  const L = mock.sections.listening;
  const R = mock.sections.reading;
  const W = mock.sections.writing;
  const S = mock.sections.speaking;
  return {
    listening: L.state === 'done' ? { raw: L.raw, total: L.total, raw40: L.raw40 } : null,
    reading: R.state === 'done' ? { raw: R.raw, total: R.total, scaled40: R.scaled40 } : null,
    writing: W.state === 'done' && isPlainObject(W.tasks)
      ? Object.fromEntries(WRITING_TASKS.map((k) => [k, { band: (W.tasks[k] || {}).band, wordCount: (W.tasks[k] || {}).wordCount }]))
      : null,
    speaking: S.state === 'done' ? { selfScores: S.selfScores } : null,
  };
}

// ---------------- 对外视图 ----------------

/**
 * 模考视图。进行中只给各部分状态（和真实考试一样最后统一出分），出分后再给分数、错题复盘和与上一次的对比。
 * opts: { now, mocks（全部模考，用于找上一次）, getters }
 */
function mockView(mock, opts) {
  const o = opts || {};
  const g = { ...DEFAULT_GETTERS, ...(o.getters || {}) };
  const sections = {};
  for (const k of SECTIONS) {
    const s = mock.sections[k];
    sections[k] = {
      state: s.state,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      restarts: s.restarts,
      durationSec: s.state === 'done' ? s.durationSec : null,
    };
  }
  const view = {
    id: mock.id,
    status: mock.status,
    examType: mock.examType,
    createdAt: mock.createdAt,
    updatedAt: mock.updatedAt,
    finishedAt: mock.finishedAt,
    serverNow: o.now || Date.now(),
    paper: JSON.parse(JSON.stringify(mock.paper)),
    current: mock.status === 'in-progress' ? currentSection(mock) : null,
    limits: { ...LIMIT_SEC },
    sections,
    bandNote: BAND_NOTE,
  };
  if (mock.status === 'finished') {
    view.result = mock.result;
    view.scores = scoresOf(mock);
    view.review = { listening: reviewListening(mock, g), reading: reviewReading(mock, g), writing: reviewWriting(mock, g) };
    view.compare = compareResults(mock, previousFinished(o.mocks || [], mock));
  }
  return view;
}

/** 历史列表的摘要 */
function mockSummary(mock) {
  return {
    id: mock.id,
    status: mock.status,
    examType: mock.examType,
    createdAt: mock.createdAt,
    updatedAt: mock.updatedAt,
    finishedAt: mock.finishedAt,
    current: mock.status === 'in-progress' ? currentSection(mock) : null,
    states: Object.fromEntries(SECTIONS.map((k) => [k, mock.sections[k].state])),
    result: mock.status === 'finished' ? mock.result : null,
  };
}

module.exports = {
  // 组卷
  usageFromUser,
  pickLeastRecent,
  defaultPools,
  assemblePaper,
  createMock,
  // 记录
  isValidMock,
  sanitizeMocks,
  activeMock,
  // 状态机
  currentSection,
  beginSection,
  abandonSection,
  submitError,
  finishMock,
  abandonMock,
  // 提交与判分
  parseSectionRequest,
  parseReadingAnswers,
  gradeSubmission,
  moduleRecords,
  applySubmit,
  writingBand,
  overallBand,
  computeResult,
  // 视图
  previousFinished,
  compareResults,
  mockView,
  mockSummary,
  summarySnippet,
  // 常量
  SECTIONS,
  SECTION_LABEL,
  STATUSES,
  LIMIT_SEC,
  MAX_DURATION_SEC,
  MAX_MOCKS,
  BAND_NOTE,
  WRITING_SCORE_KEYS,
  SPEAKING_SCORE_KEYS,
};
