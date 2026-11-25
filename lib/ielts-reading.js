'use strict';
// 雅思阅读：内容加载（data/ielts/reading/ + local/reading/ 分片）、内容校验、判分与 band 估算、作答记录清洗。
// 数据结构与规则见 docs/design/ielts-reading-20261124.md；内容目录随 lib/ielts.js 的 IELTS_DATA_DIR 覆盖。

const fs = require('fs');
const path = require('path');
const ielts = require('./ielts');
const { readJSON } = require('./store');

// ---- 枚举与常量 ----
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const TOPICS = {
  science: '科学',
  history: '历史',
  society: '社会',
  environment: '环境',
  psychology: '心理',
  technology: '技术',
};
const QUESTION_TYPES = [
  'tfng',
  'ynng',
  'matching-headings',
  'matching-information',
  'mcq',
  'sentence-completion',
  'summary-completion',
  'short-answer',
];
const MODES = ['exam', 'practice'];
const PARA_LETTERS = 'ABCDEFGHIJKL'.split('');
const PASSAGE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const QUESTION_ID_RE = /^q\d{1,3}$/;
const RECORD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BLANK = '{blank}';
const PLACEHOLDER_RE = /\{(q\d{1,3})\}/g;

const EXPECTED_PARAGRAPHS = 7; // A–G
const EXPECTED_QUESTIONS = 13;
const MIN_TYPES = 3;
const WORDS_RANGE = [650, 900];
const DEFAULT_MINUTES = 20;
const MAX_READINGS = 300;
const MAX_WORD_LIMIT = 4;
const NUM_WORDS = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR' };

// TFNG / YNNG：完整词与缩写都映射到标准写法；其它写法一律判错
const JUDGE_MAPS = {
  tfng: { true: 'TRUE', t: 'TRUE', false: 'FALSE', f: 'FALSE', 'not given': 'NOT GIVEN', ng: 'NOT GIVEN' },
  ynng: { yes: 'YES', y: 'YES', no: 'NO', n: 'NO', 'not given': 'NOT GIVEN', ng: 'NOT GIVEN' },
};
const JUDGE_VALUES = {
  tfng: ['TRUE', 'FALSE', 'NOT GIVEN'],
  ynng: ['YES', 'NO', 'NOT GIVEN'],
};

// 学术类阅读 40 题原始分 → band 的常见近似换算（[最低分, band]，从高到低）。
// 官方每套题换算略有浮动，4 分以下没有公开数据，这里按 2.0 / 1.0 粗略处理。
const BAND_TABLE = [
  [39, 9],
  [37, 8.5],
  [35, 8],
  [33, 7.5],
  [30, 7],
  [27, 6.5],
  [23, 6],
  [19, 5.5],
  [15, 5],
  [13, 4.5],
  [10, 4],
  [8, 3.5],
  [6, 3],
  [4, 2.5],
  [1, 2],
  [0, 1],
];
const BAND_NOTE = '估算 band：按本篇题数折算到 40 题，再查学术类阅读常见的近似换算表。官方每套题的换算略有不同，单篇题量小、误差大，只作参考。';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function isNonEmptyStr(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// ---- 内容加载 ----
const ORIGIN = new WeakMap(); // 条目 -> 来源分片相对路径（校验报错定位用）
let content = null;

function loadShardDir(dir, relBase, issues) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch (e) {
    if (e.code !== 'ENOENT') issues.push(`${relBase}: 目录读取失败 ${e.message}`);
    return [];
  }
  const out = [];
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

function buildContent() {
  const base = ielts.dataDir();
  const issues = [];
  const passages = [
    ...loadShardDir(path.join(base, 'reading'), 'reading', issues),
    // data/ielts/local/reading/ 放不入库的私有资料，schema 相同
    ...loadShardDir(path.join(base, 'local', 'reading'), 'local/reading', issues),
  ];
  // 重复 id 只保留首次出现的那篇（重复由 validateReadingContent 报错）
  const byId = new Map();
  for (const p of passages) {
    if (typeof p.id === 'string' && !byId.has(p.id)) byId.set(p.id, p);
  }
  return { dir: base, passages, byId, issues };
}

function getContent() {
  if (!content) content = buildContent();
  return content;
}

function reload() {
  content = null;
}

function originOf(item) {
  return ORIGIN.get(item) || '?';
}

// ---- 文本工具 ----

// 判分口径的归一化：弯引号统一为直引号，合并空白，去首尾空格，转小写
function normalizeAnswer(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// 「AND/OR A NUMBER」里的数字：1795、1,200、3.5、40%、1850s、19th
const NUMBER_TOKEN_RE = /^[$£€]?\d+(?:[.,]\d+)*(?:%|s|st|nd|rd|th)?$/;

/**
 * 按字数限制检查一个（已归一化的）答案。连字符词算 1 个词；
 * number 为 true 时允许额外 1 个数字不计入词数，第二个数字起按词计。
 * @returns {{ ok: boolean, words: number, numbers: number }}
 */
function checkWordLimit(normalized, wordLimit) {
  const tokens = normalized ? normalized.split(' ') : [];
  let words = 0;
  let numbers = 0;
  for (const t of tokens) {
    if (wordLimit && wordLimit.number === true && numbers === 0 && NUMBER_TOKEN_RE.test(t)) numbers++;
    else words++;
  }
  if (!wordLimit) return { ok: true, words, numbers };
  return { ok: words <= wordLimit.words, words, numbers };
}

// { words: 2, number: true } → 'NO MORE THAN TWO WORDS AND/OR A NUMBER'
function wordLimitLabel(wordLimit) {
  if (!isValidWordLimit(wordLimit)) return '';
  const n = wordLimit.words;
  const num = wordLimit.number === true;
  if (n === 1) return num ? 'ONE WORD AND/OR A NUMBER' : 'ONE WORD ONLY';
  return `NO MORE THAN ${NUM_WORDS[n]} WORDS${num ? ' AND/OR A NUMBER' : ''}`;
}

function isValidWordLimit(wl) {
  return (
    isPlainObject(wl) &&
    Number.isInteger(wl.words) &&
    wl.words >= 1 &&
    wl.words <= MAX_WORD_LIMIT &&
    (wl.number === undefined || typeof wl.number === 'boolean')
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 短语是否以完整词的形式出现在文本里（不区分大小写）
function containsPhrase(haystack, needle) {
  const h = normalizeAnswer(haystack);
  const n = normalizeAnswer(needle);
  if (!n) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(n)}($|[^a-z0-9])`).test(h);
}

function countPassageWords(p) {
  if (!Array.isArray(p.paragraphs)) return 0;
  return p.paragraphs.reduce((n, para) => n + (isPlainObject(para) ? ielts.countWords(para.text) : 0), 0);
}

function paragraphMap(p) {
  const m = new Map();
  if (!Array.isArray(p.paragraphs)) return m;
  for (const para of p.paragraphs) {
    if (isPlainObject(para) && typeof para.label === 'string' && typeof para.text === 'string') m.set(para.label, para.text);
  }
  return m;
}

// 遍历篇内全部题目（防御式：跳过结构不完整的组和题）
function eachQuestion(p, fn) {
  if (!Array.isArray(p.groups)) return;
  for (const g of p.groups) {
    if (!isPlainObject(g) || !Array.isArray(g.questions)) continue;
    for (const q of g.questions) {
      if (isPlainObject(q)) fn(q, g);
    }
  }
}

function questionTypes(p) {
  const set = new Set();
  if (Array.isArray(p.groups)) for (const g of p.groups) if (isPlainObject(g) && typeof g.type === 'string') set.add(g.type);
  return [...set];
}

function answersOf(q) {
  return Array.isArray(q.answer) ? q.answer.filter((a) => typeof a === 'string' && a.trim()) : [];
}

// ---- 对外视图（不含 answer / explanation / evidence）----
function optionList(list) {
  return Array.isArray(list)
    ? list.filter(isPlainObject).map((o) => ({ key: String(o.key || ''), text: String(o.text || '') }))
    : undefined;
}

function publicQuestion(q) {
  const out = { id: q.id, number: q.number };
  if (typeof q.prompt === 'string') out.prompt = q.prompt;
  if (typeof q.para === 'string') out.para = q.para;
  const opts = optionList(q.options);
  if (opts) out.options = opts;
  return out;
}

function publicGroup(g) {
  const out = { type: g.type, instruction: typeof g.instruction === 'string' ? g.instruction : '' };
  if (isValidWordLimit(g.wordLimit)) {
    out.wordLimit = { words: g.wordLimit.words, number: g.wordLimit.number === true };
    out.wordLimitLabel = wordLimitLabel(g.wordLimit);
  }
  const opts = optionList(g.options);
  if (opts) out.options = opts;
  const bank = optionList(g.wordBank);
  if (bank) out.wordBank = bank;
  if (isPlainObject(g.summary)) {
    out.summary = { title: String(g.summary.title || ''), text: String(g.summary.text || '') };
  }
  out.questions = (Array.isArray(g.questions) ? g.questions.filter(isPlainObject) : []).map(publicQuestion);
  return out;
}

function passageSummary(p) {
  let questionCount = 0;
  eachQuestion(p, () => questionCount++);
  return {
    id: p.id,
    title: String(p.title || ''),
    titleCn: String(p.titleCn || ''),
    difficulty: p.difficulty,
    topic: p.topic,
    topicCn: TOPICS[p.topic] || '',
    minutes: Number.isInteger(p.minutes) ? p.minutes : DEFAULT_MINUTES,
    wordCount: countPassageWords(p),
    questionCount,
    types: questionTypes(p),
  };
}

function publicPassage(p) {
  return {
    ...passageSummary(p),
    paragraphs: (Array.isArray(p.paragraphs) ? p.paragraphs.filter(isPlainObject) : []).map((para) => ({
      label: String(para.label || ''),
      text: String(para.text || ''),
    })),
    groups: (Array.isArray(p.groups) ? p.groups.filter(isPlainObject) : []).map(publicGroup),
  };
}

// ---- 判分 ----

/**
 * 判一道题。response 为考生原始输入。
 * 规则：不区分大小写、去首尾空格、合并多余空格；拼写必须与可接受写法之一完全一致；
 * 填空类超出字数限制直接判错；TFNG / YNNG 只认完整词或 T/F/NG、Y/N/NG 缩写。
 * @returns {{ correct: boolean, overLimit: boolean, blank: boolean }}
 */
function gradeQuestion(q, g, response) {
  const norm = normalizeAnswer(response);
  if (!norm) return { correct: false, overLimit: false, blank: true };
  const accepted = answersOf(q).map(normalizeAnswer);
  const type = g && g.type;

  if (type === 'tfng' || type === 'ynng') {
    const map = JUDGE_MAPS[type];
    const got = Object.prototype.hasOwnProperty.call(map, norm) ? map[norm] : null;
    const want = accepted.length ? map[accepted[0]] : null;
    return { correct: !!got && got === want, overLimit: false, blank: false };
  }

  if (type === 'summary-completion' && Array.isArray(g.wordBank)) {
    // 词库型摘要：写选项字母或写出该选项的词都算对
    const bank = new Map(g.wordBank.filter(isPlainObject).map((o) => [normalizeAnswer(o.key), normalizeAnswer(o.text)]));
    const ok = accepted.some((a) => a === norm || (bank.has(a) && bank.get(a) === norm));
    return { correct: ok, overLimit: false, blank: false };
  }

  if (type === 'sentence-completion' || type === 'summary-completion' || type === 'short-answer') {
    if (isValidWordLimit(g.wordLimit) && !checkWordLimit(norm, g.wordLimit).ok) {
      return { correct: false, overLimit: true, blank: false };
    }
  }
  return { correct: accepted.includes(norm), overLimit: false, blank: false };
}

// 正确答案的展示：TFNG / YNNG 统一为标准写法；选项类附上选项文字
function answerDisplay(q, g) {
  const list = answersOf(q);
  if ((g.type === 'tfng' || g.type === 'ynng') && list.length) {
    const v = JUDGE_MAPS[g.type][normalizeAnswer(list[0])];
    return { answer: [v || list[0]], answerText: null };
  }
  let opts = null;
  if (g.type === 'mcq') opts = q.options;
  else if (g.type === 'matching-headings') opts = g.options;
  else if (g.type === 'summary-completion' && Array.isArray(g.wordBank)) opts = g.wordBank;
  let answerText = null;
  if (Array.isArray(opts) && list.length) {
    const hit = opts.find((o) => isPlainObject(o) && normalizeAnswer(o.key) === normalizeAnswer(list[0]));
    if (hit) answerText = String(hit.text || '');
  }
  return { answer: list, answerText };
}

/**
 * 整篇判分。answers 为 { [qid]: string }（调用方已校验类型）。
 * @returns {{ raw: number, total: number, results: object[] }}
 */
function gradePassage(p, answers) {
  const src = isPlainObject(answers) ? answers : {};
  const results = [];
  let raw = 0;
  eachQuestion(p, (q, g) => {
    const has = Object.prototype.hasOwnProperty.call(src, q.id) && typeof src[q.id] === 'string';
    const response = has ? src[q.id].trim() : '';
    const r = gradeQuestion(q, g, response);
    if (r.correct) raw++;
    const disp = answerDisplay(q, g);
    const ev = isPlainObject(q.evidence) ? q.evidence : null;
    results.push({
      id: q.id,
      number: q.number,
      type: g.type,
      response,
      correct: r.correct,
      blank: r.blank,
      overLimit: r.overLimit,
      answer: disp.answer,
      answerText: disp.answerText,
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
      evidence: ev ? { para: String(ev.para || ''), quote: String(ev.quote || '') } : null,
    });
  });
  return { raw, total: results.length, results };
}

function bandFrom40(score) {
  for (const [min, band] of BAND_TABLE) if (score >= min) return band;
  return BAND_TABLE[BAND_TABLE.length - 1][1];
}

/**
 * 原始分 → 估算 band：先按比例折算到 40 题（四舍五入），再查 BAND_TABLE。
 * @returns {{ raw, total, scaled40, band }}
 */
function estimateBand(raw, total) {
  if (!Number.isInteger(total) || total < 1) throw new RangeError('total 必须是正整数');
  if (!Number.isInteger(raw) || raw < 0 || raw > total) throw new RangeError('raw 必须是 0–total 的整数');
  const scaled40 = Math.round((raw / total) * 40);
  return { raw, total, scaled40, band: bandFrom40(scaled40) };
}

// ---- 作答记录（ielts.json 的 readings 数组）----
function isValidReading(r) {
  return (
    isPlainObject(r) &&
    typeof r.id === 'string' &&
    RECORD_ID_RE.test(r.id) &&
    typeof r.passageId === 'string' &&
    PASSAGE_ID_RE.test(r.passageId) &&
    MODES.includes(r.mode) &&
    Number.isInteger(r.total) &&
    r.total >= 1 &&
    r.total <= 200 &&
    Number.isInteger(r.raw) &&
    r.raw >= 0 &&
    r.raw <= r.total &&
    ielts.isBand(r.band, 0) &&
    typeof r.ts === 'number' &&
    Number.isFinite(r.ts) &&
    r.ts > 0 &&
    (r.durationSec === undefined || (Number.isInteger(r.durationSec) && r.durationSec >= 0)) &&
    (r.wrong === undefined || (Array.isArray(r.wrong) && r.wrong.every((x) => typeof x === 'string')))
  );
}

// 过滤坏记录，只保留最近 MAX_READINGS 条
function sanitizeReadings(list) {
  const ok = Array.isArray(list) ? list.filter(isValidReading) : [];
  return ok.length > MAX_READINGS ? ok.slice(-MAX_READINGS) : ok;
}

// 每篇的作答次数与最好成绩（band 高者优先，其次正确率，再次时间较新）
function readingStats(records) {
  const m = new Map();
  for (const r of records) {
    const s = m.get(r.passageId) || { attempts: 0, best: null, lastTs: 0 };
    s.attempts++;
    if (r.ts > s.lastTs) s.lastTs = r.ts;
    const b = s.best;
    const better =
      !b ||
      r.band > b.band ||
      (r.band === b.band && r.raw / r.total > b.raw / b.total) ||
      (r.band === b.band && r.raw / r.total === b.raw / b.total && r.ts > b.ts);
    if (better) s.best = { raw: r.raw, total: r.total, band: r.band, mode: r.mode, ts: r.ts };
    m.set(r.passageId, s);
  }
  return m;
}

// ---- 内容校验 ----

/**
 * 校验阅读内容（getContent().passages 或任意条目数组）。
 * 检查 schema、id 唯一、段落 A–G、quote 逐字出现在对应段、matching 选项合法、
 * 字数限制与答案一致、题号连续等。消息以 ielts/ 开头便于定位。
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateReadingContent(items) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items)) {
    errors.push('ielts/reading: 阅读内容必须是数组');
    return { errors, warnings };
  }
  const idSeen = new Map();
  items.forEach((p, i) => validatePassage(p, i, idSeen, errors, warnings));
  return { errors, warnings };
}

function validatePassage(p, index, idSeen, errors, warnings) {
  const where = `ielts/${isPlainObject(p) ? originOf(p) : '?'} reading[${index}] id=${(isPlainObject(p) && p.id) || '?'}`;
  if (!isPlainObject(p)) {
    errors.push(`${where}: 条目必须是对象`);
    return;
  }
  if (!isNonEmptyStr(p.id) || !PASSAGE_ID_RE.test(p.id)) {
    errors.push(`${where}: id 必须是小写字母、数字和 - 组成（1–64 位）`);
  } else if (idSeen.has(p.id)) {
    errors.push(`${where}: id 重复（首次出现于 ${idSeen.get(p.id)}）`);
  } else {
    idSeen.set(p.id, originOf(p));
  }
  if (!isNonEmptyStr(p.title)) errors.push(`${where}: 缺少 title`);
  if (!isNonEmptyStr(p.titleCn)) warnings.push(`${where}: 缺少 titleCn`);
  if (!DIFFICULTIES.includes(p.difficulty)) errors.push(`${where}: difficulty 必须是 ${DIFFICULTIES.join(' / ')} 之一`);
  if (!Object.prototype.hasOwnProperty.call(TOPICS, p.topic)) errors.push(`${where}: topic 必须是 ${Object.keys(TOPICS).join(' / ')} 之一`);
  if (p.minutes !== undefined && !(Number.isInteger(p.minutes) && p.minutes >= 5 && p.minutes <= 60)) {
    errors.push(`${where}: minutes 必须是 5–60 的整数`);
  }

  // 段落：标签从 A 起连续
  const paras = new Map();
  if (!Array.isArray(p.paragraphs) || p.paragraphs.length < 3) {
    errors.push(`${where}: paragraphs 至少 3 段`);
  } else {
    p.paragraphs.forEach((para, j) => {
      const expected = PARA_LETTERS[j];
      const pw = `${where} paragraphs[${j}]`;
      if (!isPlainObject(para)) {
        errors.push(`${pw}: 段落必须是对象 { label, text }`);
        return;
      }
      if (para.label !== expected) errors.push(`${pw}: label 应为 ${expected || '（段落过多）'}，实际 ${para.label}`);
      if (!isNonEmptyStr(para.text)) errors.push(`${pw}: 缺少 text`);
      else if (typeof para.label === 'string') paras.set(para.label, para.text);
    });
    if (p.paragraphs.length !== EXPECTED_PARAGRAPHS) {
      warnings.push(`${where}: 共 ${p.paragraphs.length} 段，建议 A–G 共 ${EXPECTED_PARAGRAPHS} 段`);
    }
    const wc = countPassageWords(p);
    if (wc < WORDS_RANGE[0] || wc > WORDS_RANGE[1]) {
      warnings.push(`${where}: 全文 ${wc} 词，建议 ${WORDS_RANGE[0]}–${WORDS_RANGE[1]} 词`);
    }
  }

  if (!Array.isArray(p.groups) || !p.groups.length) {
    errors.push(`${where}: groups 不能为空`);
    return;
  }
  const state = { qids: new Set(), nextNumber: 1, count: 0, types: new Set() };
  p.groups.forEach((g, gi) => validateGroup(g, `${where} groups[${gi}]`, paras, state, errors, warnings));
  if (state.count !== EXPECTED_QUESTIONS) warnings.push(`${where}: 共 ${state.count} 题，建议每篇 ${EXPECTED_QUESTIONS} 题`);
  if (state.types.size < MIN_TYPES) warnings.push(`${where}: 只有 ${state.types.size} 种题型，建议至少 ${MIN_TYPES} 种`);
}

function validateOptions(list, keyRe, label, gw, errors) {
  if (!Array.isArray(list) || !list.length) {
    errors.push(`${gw}: ${label} 不能为空`);
    return new Set();
  }
  const keys = new Set();
  list.forEach((o, k) => {
    if (!isPlainObject(o) || typeof o.key !== 'string' || !keyRe.test(o.key)) {
      errors.push(`${gw}: ${label}[${k}].key 非法（应匹配 ${keyRe}）`);
      return;
    }
    if (keys.has(o.key)) errors.push(`${gw}: ${label} 的 key「${o.key}」重复`);
    keys.add(o.key);
    if (!isNonEmptyStr(o.text)) errors.push(`${gw}: ${label}[${k}] 缺少 text`);
  });
  return keys;
}

function validateGroup(g, gw, paras, state, errors, warnings) {
  if (!isPlainObject(g)) {
    errors.push(`${gw}: 题组必须是对象`);
    return;
  }
  if (!QUESTION_TYPES.includes(g.type)) {
    errors.push(`${gw}: type 必须是 ${QUESTION_TYPES.join(' / ')} 之一（实际 ${g.type}）`);
    return;
  }
  state.types.add(g.type);
  if (!isNonEmptyStr(g.instruction)) errors.push(`${gw}: 缺少 instruction`);
  if (!Array.isArray(g.questions) || !g.questions.length) {
    errors.push(`${gw}: questions 不能为空`);
    return;
  }
  const questions = g.questions;

  // ---- 组级结构 ----
  const isBankSummary = g.type === 'summary-completion' && g.wordBank !== undefined;
  const needsLimit = ['sentence-completion', 'short-answer'].includes(g.type) || (g.type === 'summary-completion' && !isBankSummary);
  if (needsLimit) {
    if (!isValidWordLimit(g.wordLimit)) {
      errors.push(`${gw}: 填空类必须有 wordLimit { words: 1–${MAX_WORD_LIMIT}, number?: boolean }`);
    } else if (isNonEmptyStr(g.instruction) && !g.instruction.includes(wordLimitLabel(g.wordLimit))) {
      errors.push(`${gw}: instruction 与 wordLimit 不一致，应包含「${wordLimitLabel(g.wordLimit)}」`);
    }
  } else if (g.wordLimit !== undefined) {
    warnings.push(`${gw}: ${g.type}${isBankSummary ? '（词库型）' : ''} 不需要 wordLimit，将被忽略`);
  }

  let headingKeys = null;
  if (g.type === 'matching-headings') {
    headingKeys = validateOptions(g.options, /^[ivx]{1,5}$/, 'options', gw, errors);
    const extra = (Array.isArray(g.options) ? g.options.length : 0) - questions.length;
    if (extra < 2 || extra > 3) {
      errors.push(`${gw}: 标题选项 ${Array.isArray(g.options) ? g.options.length : 0} 个，应比要配对的段落（${questions.length} 个）多 2–3 个`);
    }
  }
  let bankKeys = null;
  if (isBankSummary) {
    bankKeys = validateOptions(g.wordBank, /^[A-Z]$/, 'wordBank', gw, errors);
    if (Array.isArray(g.wordBank) && g.wordBank.length < questions.length + 2) {
      errors.push(`${gw}: wordBank 只有 ${g.wordBank.length} 项，至少要比空数（${questions.length}）多 2 个干扰项`);
    }
  }
  if (g.type === 'summary-completion') validateSummaryText(g, questions, gw, errors);

  // ---- 逐题 ----
  const usedParas = new Set();
  const usedHeadings = new Set();
  questions.forEach((q, qi) => {
    const qw = `${gw} ${isPlainObject(q) && q.id ? q.id : `questions[${qi}]`}`;
    if (!isPlainObject(q)) {
      errors.push(`${qw}: 题目必须是对象`);
      return;
    }
    state.count++;
    if (typeof q.id !== 'string' || !QUESTION_ID_RE.test(q.id)) errors.push(`${qw}: id 必须形如 q1、q12`);
    else if (state.qids.has(q.id)) errors.push(`${qw}: 题目 id 在本篇内重复`);
    else state.qids.add(q.id);
    if (q.number !== state.nextNumber) errors.push(`${qw}: number 应为 ${state.nextNumber}（题号须从 1 起连续），实际 ${q.number}`);
    state.nextNumber = (Number.isInteger(q.number) ? q.number : state.nextNumber) + 1;

    const answers = answersOf(q);
    if (!Array.isArray(q.answer) || !q.answer.length || answers.length !== q.answer.length) {
      errors.push(`${qw}: answer 必须是非空字符串数组（可接受的写法逐个列出）`);
    }
    const dupCheck = new Set(answers.map(normalizeAnswer));
    if (dupCheck.size !== answers.length) warnings.push(`${qw}: answer 中有归一化后重复的写法`);
    if (!isNonEmptyStr(q.explanation)) errors.push(`${qw}: 缺少 explanation（中文解析）`);

    // evidence：quote 必须逐字出现在该段原文里
    const ev = q.evidence;
    let evOk = false;
    if (!isPlainObject(ev)) {
      errors.push(`${qw}: 缺少 evidence { para, quote }`);
    } else if (!paras.has(ev.para)) {
      errors.push(`${qw}: evidence.para「${ev.para}」不是本篇的段落`);
    } else if (!isNonEmptyStr(ev.quote)) {
      errors.push(`${qw}: evidence.quote 不能为空`);
    } else if (!paras.get(ev.para).includes(ev.quote)) {
      errors.push(`${qw}: evidence.quote 未在 ${ev.para} 段原文中逐字找到：「${ev.quote.slice(0, 60)}」`);
    } else {
      evOk = true;
    }

    switch (g.type) {
      case 'tfng':
      case 'ynng':
        if (!isNonEmptyStr(q.prompt)) errors.push(`${qw}: 缺少 prompt`);
        if (answers.length !== 1 || !JUDGE_VALUES[g.type].includes(answers[0])) {
          errors.push(`${qw}: answer 必须恰好是 ${JUDGE_VALUES[g.type].join(' / ')} 之一（完整大写，缩写由判分自动接受）`);
        }
        break;
      case 'matching-headings':
        if (!paras.has(q.para)) errors.push(`${qw}: para「${q.para}」不是本篇的段落`);
        else if (usedParas.has(q.para)) errors.push(`${qw}: 段落 ${q.para} 在本组中重复`);
        usedParas.add(q.para);
        if (answers.length !== 1 || !headingKeys.has(answers[0])) errors.push(`${qw}: answer 必须是 1 个已有的标题选项 key`);
        else if (usedHeadings.has(answers[0])) errors.push(`${qw}: 标题 ${answers[0]} 在本组中被多个段落使用`);
        if (answers.length === 1) usedHeadings.add(answers[0]);
        if (isPlainObject(ev) && ev.para !== q.para) errors.push(`${qw}: evidence.para 应与配对段落 ${q.para} 一致`);
        break;
      case 'matching-information':
        if (!isNonEmptyStr(q.prompt)) errors.push(`${qw}: 缺少 prompt`);
        if (answers.length !== 1 || !paras.has(answers[0])) errors.push(`${qw}: answer 必须是 1 个段落字母`);
        else if (isPlainObject(ev) && ev.para !== answers[0]) errors.push(`${qw}: evidence.para 应与答案段落 ${answers[0]} 一致`);
        break;
      case 'mcq': {
        if (!isNonEmptyStr(q.prompt)) errors.push(`${qw}: 缺少 prompt`);
        const keys = validateOptions(q.options, /^[A-Z]$/, 'options', qw, errors);
        if (Array.isArray(q.options) && (q.options.length < 3 || q.options.length > 5)) errors.push(`${qw}: 单选题选项应为 3–5 个`);
        if (answers.length !== 1 || !keys.has(answers[0])) errors.push(`${qw}: answer 必须是 1 个已有的选项字母`);
        break;
      }
      case 'sentence-completion':
        if (!isNonEmptyStr(q.prompt) || q.prompt.split(BLANK).length !== 2) errors.push(`${qw}: prompt 必须恰好含 1 个 ${BLANK}`);
        validateCompletionAnswers(q, g, answers, evOk, qw, errors);
        break;
      case 'short-answer':
        if (!isNonEmptyStr(q.prompt)) errors.push(`${qw}: 缺少 prompt`);
        validateCompletionAnswers(q, g, answers, evOk, qw, errors);
        break;
      case 'summary-completion':
        if (isBankSummary) {
          if (answers.length !== 1 || !bankKeys.has(answers[0])) errors.push(`${qw}: 词库型摘要的 answer 必须是 1 个 wordBank 字母`);
        } else {
          validateCompletionAnswers(q, g, answers, evOk, qw, errors);
        }
        break;
      default:
        break;
    }
  });
}

// 填空类：每个可接受写法都不能超字数；首选答案须以完整词出现在 evidence.quote 里（答案取自原文）
function validateCompletionAnswers(q, g, answers, evOk, qw, errors) {
  if (!isValidWordLimit(g.wordLimit)) return;
  const label = wordLimitLabel(g.wordLimit);
  for (const a of answers) {
    const c = checkWordLimit(normalizeAnswer(a), g.wordLimit);
    if (!c.ok) errors.push(`${qw}: 可接受答案「${a}」超出字数限制（${label}）`);
  }
  if (evOk && answers.length && !containsPhrase(q.evidence.quote, answers[0])) {
    errors.push(`${qw}: 首选答案「${answers[0]}」没有在 evidence.quote 中以完整词出现（填空答案应取自原文）`);
  }
}

// 摘要正文：每个空 {qN} 恰好出现一次，且不含未知占位符
function validateSummaryText(g, questions, gw, errors) {
  if (!isPlainObject(g.summary) || !isNonEmptyStr(g.summary.text)) {
    errors.push(`${gw}: summary-completion 必须有 summary { title?, text }`);
    return;
  }
  const found = [...g.summary.text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
  const ids = questions.filter(isPlainObject).map((q) => q.id);
  for (const id of ids) {
    const n = found.filter((x) => x === id).length;
    if (n !== 1) errors.push(`${gw}: summary.text 中 {${id}} 应恰好出现 1 次（实际 ${n} 次）`);
  }
  for (const id of new Set(found)) {
    if (!ids.includes(id)) errors.push(`${gw}: summary.text 含未知占位符 {${id}}`);
  }
}

module.exports = {
  // 内容
  getContent,
  getPassages: () => getContent().passages,
  getPassage: (id) => getContent().byId.get(id) || null,
  reload,
  originOf,
  // 视图
  passageSummary,
  publicPassage,
  // 判分
  normalizeAnswer,
  checkWordLimit,
  wordLimitLabel,
  containsPhrase,
  gradeQuestion,
  gradePassage,
  estimateBand,
  bandFrom40,
  // 记录
  isValidReading,
  sanitizeReadings,
  readingStats,
  // 校验
  validateReadingContent,
  // 常量
  DIFFICULTIES,
  TOPICS,
  QUESTION_TYPES,
  MODES,
  BAND_TABLE,
  BAND_NOTE,
  MAX_READINGS,
  DEFAULT_MINUTES,
  PASSAGE_ID_RE,
  QUESTION_ID_RE,
};
