'use strict';
// 雅思备考：内容加载（data/ielts/ 分片 + local/ 私有分片）与当前档案 ielts.json 读写。
// 内容目录可用环境变量 IELTS_DATA_DIR 覆盖（测试夹具用），相对路径按项目根目录解析。

const fs = require('fs');
const path = require('path');
const profile = require('./profile');
const { readJSON, writeJSONAtomic } = require('./store');
const { normKey } = require('./dict');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DIR = path.join(ROOT, 'data', 'ielts');
const SHARD_KINDS = ['vocab', 'writing', 'speaking'];

// ---- 用户数据约束（见设计文档 §4）----
const MAX_RECORDS = 500; // writings / speakings 各保留最近 500 条
const MAX_VOCAB_CHECKS = 200;
const MAX_TEXT = 20000;
const MANUAL_DONE_KEEP_DAYS = 400; // 外部任务打勾记录只保留近 400 天，防止无限增长

const EXAM_TYPES = ['A', 'G'];
const BASELINES = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1'];
const TARGET_KEYS = ['overall', 'listening', 'reading', 'writing', 'speaking'];
const PROFILE_PATCH_KEYS = ['active', 'examType', 'examDate', 'target', 'baseline'];
const DEFAULT_EXAM_DATE = '2027-05-24';
const DEFAULT_TARGET_OVERALL = 7.0;
const MAX_EXAM_AHEAD_DAYS = 730;

// ---- 日期工具：一律用本地日期串 YYYY-MM-DD，换算成「UTC 日序号」做差，避开夏令时 ----
const DAY_MS = 86400000;

function dateKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function todayKey(now) {
  return dateKey(now == null ? Date.now() : now);
}

function isValidDateKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromDayNumber(n) {
  const t = new Date(n * DAY_MS);
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${m}-${d}`;
}

function addDays(key, n) {
  return fromDayNumber(dayNumber(key) + n);
}

// ---- 内容加载 ----
function dataDir() {
  const env = process.env.IELTS_DATA_DIR;
  return env ? path.resolve(ROOT, env) : DEFAULT_DIR;
}

let content = null;
let contentVersion = 0;
const ORIGIN = new WeakMap(); // 条目 -> 来源分片相对路径（校验报错定位用）

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 读一个目录下全部 *.json 分片（每个分片须为数组）；目录不存在视为空
function loadShardDir(dir, relBase, issues) {
  const out = [];
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch (e) {
    if (e.code !== 'ENOENT') issues.push(`${relBase}: 目录读取失败 ${e.message}`);
    return out;
  }
  const BAD = Symbol('bad');
  for (const f of files) {
    const rel = `${relBase}/${f}`;
    const arr = readJSON(path.join(dir, f), BAD);
    if (arr === BAD) {
      issues.push(`${rel}: 读取或 JSON 解析失败`);
      continue;
    }
    if (!Array.isArray(arr)) {
      issues.push(`${rel}: 分片必须是 JSON 数组`);
      continue;
    }
    arr.forEach((item, i) => {
      if (!isPlainObject(item)) {
        issues.push(`${rel}[${i}]: 条目必须是对象`);
        return;
      }
      ORIGIN.set(item, rel);
      out.push(item);
    });
  }
  return out;
}

function loadObjectFile(file, rel, issues) {
  if (!fs.existsSync(file)) return null;
  const BAD = Symbol('bad');
  const v = readJSON(file, BAD);
  if (v === BAD) {
    issues.push(`${rel}: 读取或 JSON 解析失败`);
    return null;
  }
  if (!isPlainObject(v)) {
    issues.push(`${rel}: 必须是 JSON 对象`);
    return null;
  }
  return v;
}

function buildContent() {
  const dir = dataDir();
  const issues = [];
  const shards = {};
  for (const kind of SHARD_KINDS) {
    shards[kind] = [
      ...loadShardDir(path.join(dir, kind), kind, issues),
      // data/ielts/local/ 存放不入库的私有资料，schema 与公共分片相同
      ...loadShardDir(path.join(dir, 'local', kind), `local/${kind}`, issues),
    ];
  }

  // 词汇按 normKey 建索引；重复词只保留首次出现的那条（重复由 validate 报错）
  const vocab = [];
  const vocabByKey = new Map();
  for (const raw of shards.vocab) {
    const key = normKey(raw.word);
    const entry = { ...raw, key };
    ORIGIN.set(entry, ORIGIN.get(raw));
    vocab.push(entry);
    if (key && !vocabByKey.has(key)) vocabByKey.set(key, entry);
  }

  const byId = (list) => {
    const m = new Map();
    for (const item of list) if (item.id && !m.has(item.id)) m.set(item.id, item);
    return m;
  };

  return {
    dir,
    vocab,
    vocabByKey,
    writing: shards.writing,
    writingById: byId(shards.writing),
    speaking: shards.speaking,
    speakingById: byId(shards.speaking),
    rubrics: loadObjectFile(path.join(dir, 'rubrics.json'), 'rubrics.json', issues),
    plan: loadObjectFile(path.join(dir, 'plan.json'), 'plan.json', issues),
    issues,
  };
}

function getContent() {
  if (!content) content = buildContent();
  return content;
}

// 内容文件变化后可手动重载；版本号供查词缓存判断是否失效
function reload() {
  content = null;
  contentVersion++;
}

function getContentVersion() {
  return contentVersion;
}

function originOf(item) {
  return ORIGIN.get(item) || '?';
}

// ---- 档案 profile：逐字段校验，非法值回落默认 ----
function isBand(v, min) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= 9 && Number.isInteger(v * 2);
}

function defaultExamDate(today) {
  // 固定默认考试日若已不足 4 周，改为 26 周后，避免默认值落在过去
  if (dayNumber(DEFAULT_EXAM_DATE) - dayNumber(today) >= 28) return DEFAULT_EXAM_DATE;
  return addDays(today, 26 * 7);
}

function defaultProfile(today) {
  return {
    active: false,
    examType: 'A',
    examDate: defaultExamDate(today),
    startDate: null,
    baseline: 'A2',
    target: { overall: DEFAULT_TARGET_OVERALL, listening: null, reading: null, writing: null, speaking: null },
  };
}

function normalizeProfile(raw, today) {
  const def = defaultProfile(today);
  const src = isPlainObject(raw) ? raw : {};
  const tgt = isPlainObject(src.target) ? src.target : {};
  const target = {};
  for (const k of TARGET_KEYS) {
    if (isBand(tgt[k], 1)) target[k] = tgt[k];
    else target[k] = def.target[k];
  }
  return {
    active: src.active === true,
    examType: EXAM_TYPES.includes(src.examType) ? src.examType : def.examType,
    examDate: isValidDateKey(src.examDate) ? src.examDate : def.examDate,
    startDate: isValidDateKey(src.startDate) ? src.startDate : null,
    baseline: BASELINES.includes(src.baseline) ? src.baseline : def.baseline,
    target,
  };
}

/**
 * 校验并应用 POST /ielts/profile 的部分更新。纯函数，不读写文件。
 * @returns {{ profile: object } | { error: string }}
 */
function applyProfilePatch(current, patch, today) {
  if (!isPlainObject(patch)) return { error: '请求体必须是 JSON 对象' };
  const keys = Object.keys(patch);
  if (!keys.length) return { error: '没有要更新的字段（可选 active / examType / examDate / target / baseline）' };
  const unknown = keys.filter((k) => !PROFILE_PATCH_KEYS.includes(k));
  if (unknown.length) return { error: `不支持的字段：${unknown.join(', ')}（startDate 由服务端在首次开启时写入）` };

  const next = { ...current, target: { ...current.target } };

  if ('active' in patch) {
    if (typeof patch.active !== 'boolean') return { error: 'active 必须是 true 或 false' };
    next.active = patch.active;
  }
  if ('examType' in patch) {
    if (!EXAM_TYPES.includes(patch.examType)) return { error: 'examType 必须是 A（学术类）或 G（培训类）' };
    next.examType = patch.examType;
  }
  if ('examDate' in patch) {
    const d = patch.examDate;
    if (!isValidDateKey(d)) return { error: 'examDate 必须是有效日期，格式 YYYY-MM-DD' };
    const ahead = dayNumber(d) - dayNumber(today);
    if (ahead <= 0) return { error: 'examDate 必须晚于今天' };
    if (ahead > MAX_EXAM_AHEAD_DAYS) return { error: `examDate 不能晚于今天起 ${MAX_EXAM_AHEAD_DAYS} 天` };
    next.examDate = d;
  }
  if ('baseline' in patch) {
    if (!BASELINES.includes(patch.baseline)) return { error: `baseline 必须是 ${BASELINES.join(' / ')} 之一` };
    next.baseline = patch.baseline;
  }
  if ('target' in patch) {
    const t = patch.target;
    if (!isPlainObject(t)) return { error: 'target 必须是对象，如 { "overall": 7 }' };
    const badKeys = Object.keys(t).filter((k) => !TARGET_KEYS.includes(k));
    if (badKeys.length) return { error: `target 不支持的字段：${badKeys.join(', ')}` };
    for (const k of Object.keys(t)) {
      const v = t[k];
      if (k === 'overall') {
        if (!isBand(v, 1)) return { error: 'target.overall 必须是 1–9 之间、以 0.5 为步长的数字' };
      } else if (v !== null && !isBand(v, 1)) {
        return { error: `target.${k} 必须是 null 或 1–9 之间、以 0.5 为步长的数字` };
      }
      next.target[k] = v;
    }
  }

  if (next.active) {
    if (dayNumber(next.examDate) <= dayNumber(today)) {
      return { error: '考试日期已过，开启备考时请同时设置新的 examDate' };
    }
    // 首次激活写入开始日；之后停用再开启保留原开始日，计划进度不清零
    if (!next.startDate) next.startDate = today;
  }
  return { profile: next };
}

// ---- 当前档案 ielts.json 读写 ----
function userFile() {
  return profile.file('ielts.json');
}

function sanitizeManualDone(raw, today) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  const oldest = dayNumber(today) - MANUAL_DONE_KEEP_DAYS;
  for (const [k, v] of Object.entries(raw)) {
    if (!isValidDateKey(k) || !Array.isArray(v) || dayNumber(k) < oldest) continue;
    const keys = [...new Set(v.filter((x) => typeof x === 'string' && x))];
    if (keys.length) out[k] = keys;
  }
  return out;
}

function loadUser(now) {
  const today = todayKey(now);
  const raw = readJSON(userFile(), null);
  const src = isPlainObject(raw) ? raw : {};
  const list = (v) => (Array.isArray(v) ? v.filter(isPlainObject) : []);
  return {
    ...src, // 保留未知顶层字段，向前兼容
    profile: normalizeProfile(src.profile, today),
    writings: list(src.writings),
    speakings: list(src.speakings),
    vocabChecks: list(src.vocabChecks),
    manualDone: sanitizeManualDone(src.manualDone, today),
  };
}

function saveUser(u) {
  const out = { ...u };
  if (out.writings.length > MAX_RECORDS) out.writings = out.writings.slice(-MAX_RECORDS);
  if (out.speakings.length > MAX_RECORDS) out.speakings = out.speakings.slice(-MAX_RECORDS);
  if (out.vocabChecks.length > MAX_VOCAB_CHECKS) out.vocabChecks = out.vocabChecks.slice(-MAX_VOCAB_CHECKS);
  writeJSONAtomic(userFile(), out);
  return out;
}

module.exports = {
  // 内容
  dataDir,
  getContent,
  reload,
  getContentVersion,
  originOf,
  getVocab: () => getContent().vocab,
  getVocabEntry: (key) => getContent().vocabByKey.get(normKey(key)) || null,
  getWritingList: () => getContent().writing,
  getWriting: (id) => getContent().writingById.get(id) || null,
  getSpeakingList: () => getContent().speaking,
  getSpeaking: (id) => getContent().speakingById.get(id) || null,
  getRubrics: () => getContent().rubrics,
  getPlan: () => getContent().plan,
  // 档案
  defaultProfile,
  normalizeProfile,
  applyProfilePatch,
  loadUser,
  saveUser,
  isBand,
  // 日期
  dateKey,
  todayKey,
  isValidDateKey,
  dayNumber,
  addDays,
  // 常量
  EXAM_TYPES,
  BASELINES,
  TARGET_KEYS,
  MAX_RECORDS,
  MAX_TEXT,
};
