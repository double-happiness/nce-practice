'use strict';

// 雅思外部成绩（剑雅真题等）：请求体校验、原始分换算、记录清洗与视图（设计见 docs/design/ielts-external-scores-20261126.md）。
// 记录存当前档案 ielts.json 的 externalTests 数组；读写由 routes/ielts-external.js 负责，本模块只放纯函数。
const ielts = require('./ielts');
const listening = require('./ielts-listening');
const reading = require('./ielts-reading');
const { officialRound } = require('./ielts-plan');

const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
const RAW_SKILLS = ['listening', 'reading']; // 可以填原始分 /40 的两项
const SKILL_LABEL = { listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' };
const BAND_FROM = ['table', 'manual'];
const INPUT_KEYS = ['date', 'book', 'test', 'title', ...SKILLS, 'notes', 'tickPlan'];

const MAX_EXTERNAL = 200;
const MAX_TITLE = 60;
const MAX_NOTES = 500;
const MAX_PAST_DAYS = 730; // 只允许补录两年内的成绩
const RAW_MAX = 40;
const BOOK_RANGE = [1, 30];
const TEST_RANGE = [1, 4];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isIntIn(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

const isBand = (v) => ielts.isBand(v, 0);

/** 原始分 → band：听力 A / G 通用；阅读只有学术类（A）有内置表，G 类返回 null */
function bandFromRaw(skill, raw, examType) {
  if (skill === 'listening') return listening.bandFrom40(raw);
  if (skill === 'reading' && examType !== 'G') return reading.bandFrom40(raw);
  return null;
}

/**
 * 校验一项成绩。缺省（undefined / null）返回 { value: null }。
 * 听力 / 阅读：{ raw?: 0–40 整数, band?: 0–9 步长 0.5 }，至少一个；只给 raw 时查表换算（G 类阅读没有表，必须给 band）。
 * 写作 / 口语：{ band }。
 */
function parseSkill(skill, v, examType) {
  if (v === undefined || v === null) return { value: null };
  const label = SKILL_LABEL[skill];
  if (!isPlainObject(v)) return { error: `${skill} 必须是对象或 null` };
  const allowed = RAW_SKILLS.includes(skill) ? ['raw', 'band'] : ['band'];
  const extra = Object.keys(v).filter((k) => !allowed.includes(k));
  if (extra.length) return { error: `${skill} 不支持的字段：${extra.join(', ')}（可选 ${allowed.join(' / ')}）` };
  const hasRaw = v.raw !== undefined && v.raw !== null;
  const hasBand = v.band !== undefined && v.band !== null;
  if (hasBand && !isBand(v.band)) return { error: `${label} band 必须是 0–9 之间、以 0.5 为步长的数字` };
  if (!RAW_SKILLS.includes(skill)) {
    if (!hasBand) return { error: `${label}请填写 band` };
    return { value: { band: v.band } };
  }
  if (hasRaw && !isIntIn(v.raw, 0, RAW_MAX)) return { error: `${label}原始分必须是 0–${RAW_MAX} 的整数` };
  if (!hasRaw && !hasBand) return { error: `${label}请填写原始分或 band` };
  const raw = hasRaw ? v.raw : null;
  if (hasBand) return { value: { raw, band: v.band, bandFrom: 'manual' } };
  const band = bandFromRaw(skill, raw, examType);
  if (band == null) return { error: 'G 类阅读没有内置换算表，请按书后的换算表填写 band' };
  return { value: { raw, band, bandFrom: 'table' } };
}

function optionalInt(v, range, name) {
  if (v === undefined || v === null) return { value: null };
  if (!isIntIn(v, range[0], range[1])) return { error: `${name} 必须是 ${range[0]}–${range[1]} 的整数` };
  return { value: v };
}

function optionalText(v, max, name) {
  if (v === undefined || v === null) return { value: '' };
  if (typeof v !== 'string') return { error: `${name} 必须是字符串` };
  const t = v.trim();
  if (t.length > max) return { error: `${name} 最长 ${max} 字` };
  return { value: t };
}

/**
 * 校验 POST /ielts/external-tests 的请求体。
 * ctx: { examType: 'A'|'G'（取自档案）, today: 'YYYY-MM-DD' }
 * @returns {{ input: { date, book, test, title, listening, reading, writing, speaking, notes, examType }, tickPlan: boolean } | { error }}
 */
function parseInput(body, ctx) {
  if (!isPlainObject(body)) return { error: '请求体必须是 JSON 对象' };
  const extra = Object.keys(body).filter((k) => !INPUT_KEYS.includes(k));
  if (extra.length) return { error: `不支持的字段：${extra.join(', ')}（可选 ${INPUT_KEYS.join(' / ')}）` };
  const examType = ctx && ctx.examType === 'G' ? 'G' : 'A';
  const today = ctx && ctx.today;

  if (!ielts.isValidDateKey(body.date)) return { error: 'date 必须是有效日期，格式 YYYY-MM-DD' };
  const age = ielts.dayNumber(today) - ielts.dayNumber(body.date);
  if (age < 0) return { error: '不能录入未来日期的成绩' };
  if (age > MAX_PAST_DAYS) return { error: `只能补录 ${MAX_PAST_DAYS} 天以内的成绩` };

  const out = { date: body.date, examType };
  for (const [key, r] of [
    ['book', optionalInt(body.book, BOOK_RANGE, 'book（剑雅书号）')],
    ['test', optionalInt(body.test, TEST_RANGE, 'test（Test 号）')],
    ['title', optionalText(body.title, MAX_TITLE, 'title')],
    ['notes', optionalText(body.notes, MAX_NOTES, 'notes')],
  ]) {
    if (r.error) return { error: r.error };
    out[key] = r.value;
  }
  for (const skill of SKILLS) {
    const r = parseSkill(skill, body[skill], examType);
    if (r.error) return { error: r.error };
    out[skill] = r.value;
  }
  if (!SKILLS.some((k) => out[k])) return { error: '听力、阅读、写作、口语至少填一项' };
  if (body.tickPlan !== undefined && typeof body.tickPlan !== 'boolean') return { error: 'tickPlan 必须是 true 或 false' };
  return { input: out, tickPlan: body.tickPlan === true };
}

/** 校验通过的 input 加上 id 与录入时间，成为存盘记录 */
function buildRecord(input, id, now) {
  return {
    id,
    date: input.date,
    ts: now,
    examType: input.examType,
    book: input.book,
    test: input.test,
    title: input.title,
    listening: input.listening,
    reading: input.reading,
    writing: input.writing,
    speaking: input.speaking,
    notes: input.notes,
  };
}

// ---- 记录清洗（读取 ielts.json 时逐条校验，畸形的丢弃）----

function isValidSkillRecord(skill, v) {
  if (v === null) return true;
  if (!isPlainObject(v) || !isBand(v.band)) return false;
  if (!RAW_SKILLS.includes(skill)) return true;
  return (v.raw === null || isIntIn(v.raw, 0, RAW_MAX)) && BAND_FROM.includes(v.bandFrom);
}

function isValidRecord(r) {
  if (!isPlainObject(r) || typeof r.id !== 'string' || !ID_RE.test(r.id)) return false;
  if (!ielts.isValidDateKey(r.date) || !Number.isFinite(r.ts) || r.ts <= 0) return false;
  if (!ielts.EXAM_TYPES.includes(r.examType)) return false;
  if (!(r.book === null || isIntIn(r.book, BOOK_RANGE[0], BOOK_RANGE[1]))) return false;
  if (!(r.test === null || isIntIn(r.test, TEST_RANGE[0], TEST_RANGE[1]))) return false;
  if (typeof r.title !== 'string' || r.title.length > MAX_TITLE) return false;
  if (typeof r.notes !== 'string' || r.notes.length > MAX_NOTES) return false;
  if (!SKILLS.every((k) => isValidSkillRecord(k, r[k]))) return false;
  return SKILLS.some((k) => r[k]);
}

/** 先按做题日期、再按录入时间升序 */
function byDateTs(a, b) {
  const d = ielts.dayNumber(a.date) - ielts.dayNumber(b.date);
  return d || a.ts - b.ts;
}

/** 过滤不合法的记录，按时间升序，只保留最近 MAX_EXTERNAL 条 */
function sanitizeExternalTests(list) {
  const ok = Array.isArray(list) ? list.filter(isValidRecord).sort(byDateTs) : [];
  return ok.length > MAX_EXTERNAL ? ok.slice(-MAX_EXTERNAL) : ok;
}

// ---- 视图 ----

function displayTitle(r) {
  if (r.title) return r.title;
  if (r.book) return `剑雅 ${r.book}${r.test ? ` Test ${r.test}` : ''}`;
  return r.test ? `外部模考 Test ${r.test}` : '外部模考';
}

/** 四项齐全时按官方规则取整出总分，否则 null */
function overallOf(r) {
  const bands = SKILLS.map((k) => (r[k] ? r[k].band : null));
  if (bands.some((b) => typeof b !== 'number')) return null;
  return officialRound(bands.reduce((a, b) => a + b, 0) / bands.length);
}

function externalView(r) {
  const copy = (v) => (v ? { ...v } : null);
  return {
    id: r.id,
    date: r.date,
    ts: r.ts,
    examType: r.examType,
    book: r.book,
    test: r.test,
    title: r.title,
    displayTitle: displayTitle(r),
    listening: copy(r.listening),
    reading: copy(r.reading),
    writing: copy(r.writing),
    speaking: copy(r.speaking),
    overall: overallOf(r),
    notes: r.notes,
  };
}

module.exports = {
  parseInput,
  parseSkill,
  bandFromRaw,
  buildRecord,
  isValidRecord,
  sanitizeExternalTests,
  byDateTs,
  displayTitle,
  overallOf,
  externalView,
  SKILLS,
  RAW_SKILLS,
  SKILL_LABEL,
  MAX_EXTERNAL,
  MAX_TITLE,
  MAX_NOTES,
  MAX_PAST_DAYS,
  ID_RE,
};
