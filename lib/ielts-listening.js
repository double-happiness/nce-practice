'use strict';
// 雅思听力：内容加载（data/ielts/listening/ + local/listening/）、内容校验、判分与 band 估算、作答记录清洗。
// 设计见 docs/design/ielts-listening-20261124.md。内容目录跟随 lib/ielts.js 的 dataDir()（IELTS_DATA_DIR 可覆盖）。

const fs = require('fs');
const path = require('path');
const ielts = require('./ielts');
const { readJSON } = require('./store');

// ---- 枚举与常量（与设计文档 §3、§4 保持一致）----
const PARTS = [1, 2, 3, 4];
const COMPLETION_TYPES = ['form-completion', 'note-completion', 'sentence-completion', 'summary-completion'];
const CHOICE_TYPES = ['mcq', 'matching'];
const GROUP_TYPES = [...COMPLETION_TYPES, ...CHOICE_TYPES];
// 各部分约定的题型（不符只给 warning：真实考试题型更多样）
const PART_TYPES = {
  1: ['form-completion', 'note-completion'],
  2: ['mcq', 'matching'],
  3: ['mcq', 'matching', 'sentence-completion'],
  4: ['note-completion', 'summary-completion'],
};
// 字数限制：words = 词数上限，numbers = 另外允许的数字个数（0 表示数字也按词计）
const WORD_LIMITS = {
  'ONE WORD ONLY': { words: 1, numbers: 0 },
  'ONE WORD AND/OR A NUMBER': { words: 1, numbers: 1 },
  'NO MORE THAN TWO WORDS': { words: 2, numbers: 0 },
  'NO MORE THAN TWO WORDS AND/OR A NUMBER': { words: 2, numbers: 1 },
  'NO MORE THAN THREE WORDS': { words: 3, numbers: 0 },
  'NO MORE THAN THREE WORDS AND/OR A NUMBER': { words: 3, numbers: 1 },
};
const GENDERS = ['female', 'male'];
const MODES = ['exam', 'practice'];
const QUESTIONS_PER_SECTION = 10;
const MIN_OPTIONS = 3;
const MAX_SEGMENT_CHARS = 700;
const MAX_LISTENINGS = 300;
const MAX_ANSWER_LEN = 100;
const MAX_DURATION_SEC = 7200;

const SECTION_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const OPTION_KEY_RE = /^[A-Z]$/;
const GAP_RE = /_{3,}/g;
// 数字记号：可带货币符号、千分位 / 小数点 / 冒号 / 斜杠，以及序数、时间、百分号等后缀
const NUMBER_TOKEN_RE = /^[£$€]?\d+(?:[.,:/]\d+)*(?:st|nd|rd|th|am|pm|%|p)?$/i;

// 40 题原始分 → band 的近似换算表（雅思听力常见口径，只是近似值）；按下限从高到低查
const BAND_TABLE = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5],
  [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [0, 1],
];
const BAND_NOTE = 'band 为估算：本组原始分按比例折算到 40 题，再查雅思听力常见换算表，只是近似值；10 题样本小，单次波动大，仅供参考。';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';

// ---- 文本归一化 ----

// 两侧共用的基础归一化：全角转半角、引号 / 破折号统一、小写、去千分位、合并空白
function baseNormalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/([£$€])\s+(?=\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 判分用的答案归一化：在基础归一化之上去掉首尾标点（拼写本身不做任何纠正） */
function normalizeAnswer(s) {
  return baseNormalize(s).replace(/^["'.,;:!?()\s]+|["'.,;:!?()\s]+$/g, '');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsBounded(text, phrase) {
  if (!phrase) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(phrase)}(?=$|[^a-z0-9])`).test(text);
}

/** 短语是否出现在文本里：忽略大小写与多余空白，按词边界比较；再按去掉全部空白比一次 */
function containsPhrase(text, phrase) {
  const t = baseNormalize(text);
  const p = normalizeAnswer(phrase);
  if (!p) return false;
  if (containsBounded(t, p)) return true;
  return containsBounded(t.replace(/\s+/g, ''), p.replace(/\s+/g, ''));
}

// ---- 字数限制 ----

/** 统计答案里的词与数字个数（连字符词算 1 个词；数字见 NUMBER_TOKEN_RE） */
function countAnswerTokens(s) {
  const n = normalizeAnswer(s);
  if (!n) return { words: 0, numbers: 0, total: 0 };
  const tokens = n.split(' ');
  const numbers = tokens.filter((t) => NUMBER_TOKEN_RE.test(t)).length;
  return { words: tokens.length - numbers, numbers, total: tokens.length };
}

/** 答案是否符合字数限制；空答案视为符合（空答案由判分单独判错） */
function fitsWordLimit(s, limitKey) {
  const limit = WORD_LIMITS[limitKey];
  if (!limit) return false;
  const t = countAnswerTokens(s);
  if (!t.total) return true;
  if (!limit.numbers) return t.total <= limit.words;
  return t.words <= limit.words && t.numbers <= limit.numbers;
}

// ---- 判分 ----

/**
 * 判一道题。group 提供题型与字数限制；input 为用户原始输入。
 * @returns {{ correct: boolean, overLimit: boolean, empty: boolean }}
 */
function gradeQuestion(question, group, input) {
  const yours = typeof input === 'string' ? input.trim() : '';
  if (!yours) return { correct: false, overLimit: false, empty: true };
  const answers = Array.isArray(question.answer) ? question.answer : [];
  if (CHOICE_TYPES.includes(group.type)) {
    const key = yours.toUpperCase();
    return { correct: answers.some((a) => String(a).toUpperCase() === key), overLimit: false, empty: false };
  }
  // 雅思规则：超过字数限制直接判错，即便包含正确答案
  if (!fitsWordLimit(yours, group.wordLimit)) return { correct: false, overLimit: true, empty: false };
  const norm = normalizeAnswer(yours);
  return { correct: answers.some((a) => normalizeAnswer(a) === norm), overLimit: false, empty: false };
}

function scaleTo40(raw, total) {
  if (!(total > 0)) return 0;
  const r = Math.min(Math.max(Number(raw) || 0, 0), total);
  return Math.round((r / total) * 40);
}

function bandFrom40(raw40) {
  for (const [min, band] of BAND_TABLE) if (raw40 >= min) return band;
  return BAND_TABLE[BAND_TABLE.length - 1][1];
}

/** 原始分按比例折算到 40 题后查近似换算表 */
function estimateBand(raw, total) {
  const raw40 = scaleTo40(raw, total);
  return { raw40, band: bandFrom40(raw40) };
}

function eachQuestion(section, fn) {
  for (const g of section.groups) for (const q of g.questions) fn(q, g);
}

/** 整个 section 判分；answers 为 { "题号": "答案" } */
function gradeSection(section, answers) {
  const src = isPlainObject(answers) ? answers : {};
  const results = [];
  let raw = 0;
  eachQuestion(section, (q, g) => {
    const input = Object.prototype.hasOwnProperty.call(src, String(q.no)) ? src[String(q.no)] : '';
    const r = gradeQuestion(q, g, input);
    if (r.correct) raw++;
    const item = {
      no: q.no,
      correct: r.correct,
      yours: typeof input === 'string' ? input.trim() : '',
      overLimit: r.overLimit,
      answer: q.answer.slice(),
      explanation: q.explanation,
      segment: q.segment,
    };
    if (q.evidence) item.evidence = q.evidence;
    results.push(item);
  });
  const total = results.length;
  const est = estimateBand(raw, total);
  return { raw, total, raw40: est.raw40, band: est.band, results };
}

/**
 * 校验并清洗提交的 answers：键只能是本 section 的题号，值为字符串或 null。
 * @returns {{ answers: object } | { error: string }}
 */
function parseAnswers(section, raw) {
  if (!isPlainObject(raw)) return { error: 'answers 必须是对象，键为题号，如 { "1": "Brennan", "11": "C" }' };
  const nos = questionNumbers(section);
  const valid = new Set(nos.map(String));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!valid.has(k)) {
      return { error: `answers 里有不存在的题号「${String(k).slice(0, 20)}」（本题组为 ${nos[0]}–${nos[nos.length - 1]}）` };
    }
    if (v == null) continue;
    if (typeof v !== 'string') return { error: `answers.${k} 必须是字符串或 null` };
    if (v.length > MAX_ANSWER_LEN) return { error: `answers.${k} 最长 ${MAX_ANSWER_LEN} 字符` };
    const t = v.trim();
    if (t) out[k] = t;
  }
  return { answers: out };
}

function questionNumbers(section) {
  const nos = [];
  eachQuestion(section, (q) => nos.push(q.no));
  return nos;
}

// ---- 内容校验 ----

function checkOptions(opts, where, err) {
  if (!Array.isArray(opts) || opts.length < MIN_OPTIONS) {
    err(`${where}: 至少需要 ${MIN_OPTIONS} 个选项`);
    return null;
  }
  const keys = new Set();
  opts.forEach((o, i) => {
    if (!isPlainObject(o) || typeof o.key !== 'string' || !OPTION_KEY_RE.test(o.key) || !isNonEmptyStr(o.text)) {
      err(`${where}[${i}]: 选项必须是 { key: 单个大写字母, text: 非空字符串 }`);
      return;
    }
    if (keys.has(o.key)) err(`${where}[${i}]: 选项字母重复 (${o.key})`);
    keys.add(o.key);
  });
  return keys;
}

function validateSpeakers(s, err) {
  const ids = new Set();
  if (!Array.isArray(s.speakers) || !s.speakers.length) {
    err('speakers 必须是非空数组');
    return ids;
  }
  s.speakers.forEach((sp, i) => {
    const w = `speakers[${i}]`;
    if (!isPlainObject(sp)) {
      err(`${w}: 必须是对象`);
      return;
    }
    if (!isNonEmptyStr(sp.id)) err(`${w}: 缺少 id`);
    else if (ids.has(sp.id)) err(`${w}: id 重复 (${sp.id})`);
    else ids.add(sp.id);
    if (!isNonEmptyStr(sp.name)) err(`${w}: 缺少 name`);
    if (!GENDERS.includes(sp.gender)) err(`${w}: gender 必须是 female 或 male`);
  });
  return ids;
}

function validateSegments(s, speakerIds, err, warn) {
  if (!Array.isArray(s.segments) || !s.segments.length) {
    err('segments 必须是非空数组');
    return [];
  }
  const used = new Set();
  s.segments.forEach((sg, i) => {
    const w = `segments[${i}]`;
    if (!isPlainObject(sg)) {
      err(`${w}: 必须是对象`);
      return;
    }
    if (!speakerIds.has(sg.speaker)) err(`${w}: speaker 不在 speakers 里 (${sg.speaker})`);
    else used.add(sg.speaker);
    if (!isNonEmptyStr(sg.text)) err(`${w}: 缺少 text`);
    else if (sg.text.length > MAX_SEGMENT_CHARS) warn(`${w}: text 超过 ${MAX_SEGMENT_CHARS} 字符，复盘定位不够精确，建议拆段`);
  });
  speakerIds.forEach((id) => {
    if (!used.has(id)) warn(`说话人 ${id} 没有任何台词`);
  });
  return s.segments;
}

function validateQuestion(q, ctx, err, warn) {
  const { g, qw, isCompletion, groupOptKeys, segs, segEnd } = ctx;
  if (!isPlainObject(q)) {
    err(`${qw}: 必须是对象`);
    return;
  }
  if (!Number.isInteger(q.no) || q.no < 1) err(`${qw}: no 必须是正整数`);
  else ctx.nos.push(q.no);
  if (q.heading != null && !isNonEmptyStr(q.heading)) err(`${qw}: heading 必须是非空字符串`);
  if (!isNonEmptyStr(q.prompt)) err(`${qw}: 缺少 prompt`);
  else if (isCompletion) {
    const gaps = (q.prompt.match(GAP_RE) || []).length;
    if (gaps !== 1) err(`${qw}: 填空题 prompt 必须恰好包含一个 ___（实际 ${gaps} 个）`);
  }
  if (!isNonEmptyStr(q.explanation)) err(`${qw}: 缺少 explanation（中文解析）`);

  const answers = Array.isArray(q.answer) && q.answer.length && q.answer.every(isNonEmptyStr) ? q.answer : null;
  if (!answers) err(`${qw}: answer 必须是非空字符串数组`);

  const segOk = Number.isInteger(q.segment) && q.segment >= 0 && q.segment < segs.length;
  if (!segOk) {
    err(`${qw}: segment 必须是有效的段下标 0–${segs.length - 1}`);
  } else if (Number.isInteger(g.from) && (q.segment < g.from || q.segment > segEnd)) {
    err(`${qw}: segment ${q.segment} 不在本组音频范围 ${g.from}–${segEnd} 内（考试模式按组播放）`);
  } else {
    if (q.segment < ctx.prevSeg) warn(`${qw}: 答案出现位置早于上一题（雅思听力答案一般按题号顺序出现）`);
    ctx.prevSeg = q.segment;
  }
  const segText = segOk && isPlainObject(segs[q.segment]) && typeof segs[q.segment].text === 'string' ? segs[q.segment].text : '';

  let optKeys = groupOptKeys;
  if (g.type === 'mcq') optKeys = checkOptions(q.options, `${qw}.options`, err);
  else if (q.options != null) err(`${qw}: 只有 mcq 题可以有 options（matching 的选项放在组上）`);

  if (!answers) return;
  if (CHOICE_TYPES.includes(g.type)) {
    if (answers.length !== 1) err(`${qw}: 选择 / 匹配题 answer 只能有一个字母`);
    else if (optKeys && !optKeys.has(answers[0])) err(`${qw}: answer ${answers[0]} 不在选项里`);
    if (!isNonEmptyStr(q.evidence)) err(`${qw}: 选择 / 匹配题必须给出 evidence（原文依据，用于核对 segment）`);
    else if (segText && !containsPhrase(segText, q.evidence)) err(`${qw}: evidence「${q.evidence}」没有出现在 segment ${q.segment} 的文本里`);
    return;
  }
  if (!isCompletion) return;
  const seen = new Set();
  for (const a of answers) {
    const n = normalizeAnswer(a);
    if (!n) err(`${qw}: 答案「${a}」归一化后为空`);
    else if (seen.has(n)) warn(`${qw}: answer 有重复写法「${a}」`);
    seen.add(n);
    if (WORD_LIMITS[g.wordLimit] && !fitsWordLimit(a, g.wordLimit)) err(`${qw}: 答案「${a}」超出字数限制 ${g.wordLimit}`);
  }
  if (segText && !answers.some((a) => containsPhrase(segText, a))) {
    err(`${qw}: 可接受答案（${answers.join(' / ')}）都没有出现在 segment ${q.segment} 的文本里`);
  }
}

function validateGroups(s, segs, err, warn) {
  if (!Array.isArray(s.groups) || !s.groups.length) {
    err('groups 必须是非空数组');
    return [];
  }
  const ctx = { nos: [], prevSeg: -1 };
  let prevFrom = -1;
  s.groups.forEach((g, gi) => {
    const w = `groups[${gi}]`;
    if (!isPlainObject(g)) {
      err(`${w}: 必须是对象`);
      return;
    }
    if (!GROUP_TYPES.includes(g.type)) err(`${w}: type 非法 (${g.type})，可选 ${GROUP_TYPES.join(' / ')}`);
    else if (PARTS.includes(s.part) && !PART_TYPES[s.part].includes(g.type)) warn(`${w}: Part ${s.part} 一般不用 ${g.type}`);
    if (!isNonEmptyStr(g.instruction)) err(`${w}: 缺少 instruction`);
    if (g.title != null && !isNonEmptyStr(g.title)) err(`${w}: title 必须是非空字符串`);
    if (!Number.isInteger(g.from) || g.from < 0 || g.from >= segs.length) {
      err(`${w}: from 必须是有效的段下标 0–${segs.length - 1}`);
    } else {
      if (gi === 0 && g.from !== 0) err(`${w}: 第一组的 from 必须是 0`);
      if (g.from <= prevFrom) err(`${w}: from 必须严格递增`);
      prevFrom = g.from;
    }
    const isCompletion = COMPLETION_TYPES.includes(g.type);
    if (isCompletion && !Object.prototype.hasOwnProperty.call(WORD_LIMITS, g.wordLimit)) {
      err(`${w}: 填空题必须给出 wordLimit（${Object.keys(WORD_LIMITS).join(' / ')}）`);
    }
    if (!isCompletion && g.wordLimit != null) warn(`${w}: 选择 / 匹配题不需要 wordLimit`);
    let groupOptKeys = null;
    if (g.type === 'matching') groupOptKeys = checkOptions(g.options, `${w}.options`, err);
    else if (g.options != null) err(`${w}: 只有 matching 组可以有 options`);
    if (!Array.isArray(g.questions) || !g.questions.length) {
      err(`${w}: questions 必须是非空数组`);
      return;
    }
    const next = s.groups[gi + 1];
    const segEnd = isPlainObject(next) && Number.isInteger(next.from) ? next.from - 1 : segs.length - 1;
    g.questions.forEach((q, qi) => {
      const qw = `${w}.questions[${qi}] no=${isPlainObject(q) ? q.no : '?'}`;
      validateQuestion(q, Object.assign(ctx, { g, qw, isCompletion, groupOptKeys, segs, segEnd }), err, warn);
    });
  });
  return ctx.nos;
}

function validateNumbers(s, nos, err, warn) {
  if (nos.length) {
    const dup = [...new Set(nos.filter((n, i) => nos.indexOf(n) !== i))];
    if (dup.length) err(`题号重复：${dup.join(', ')}`);
    else if (nos.some((n, i) => n !== nos[0] + i)) err('题号必须按顺序连续');
    const expected = PARTS.includes(s.part) ? (s.part - 1) * 10 + 1 : null;
    if (expected && nos[0] !== expected) warn(`Part ${s.part} 的题号一般从 ${expected} 开始（实际 ${nos[0]}）`);
  }
  if (nos.length !== QUESTIONS_PER_SECTION) warn(`每个 section 应有 ${QUESTIONS_PER_SECTION} 题（实际 ${nos.length}）`);
}

/** 校验单个 section；消息不带位置前缀 */
function validateSection(s) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  if (!isPlainObject(s)) {
    err('条目必须是对象');
    return { errors, warnings };
  }
  if (typeof s.id !== 'string' || !SECTION_ID_RE.test(s.id)) err('id 必须由小写字母、数字和连字符组成，2–64 位');
  if (!PARTS.includes(s.part)) err('part 必须是 1–4 的整数');
  if (!isNonEmptyStr(s.title)) err('缺少 title');
  if (!isNonEmptyStr(s.titleCn)) warn('缺少 titleCn');
  if (!isNonEmptyStr(s.intro)) warn('缺少 intro（考试模式开场旁白）');

  const speakerIds = validateSpeakers(s, err);
  const n = speakerIds.size;
  if (s.part === 1 && n !== 2) warn(`Part 1 一般是两人对话（实际 ${n} 人）`);
  if ((s.part === 2 || s.part === 4) && n !== 1) warn(`Part ${s.part} 一般是独白（实际 ${n} 人）`);
  if (s.part === 3 && (n < 2 || n > 3)) warn(`Part 3 一般是 2–3 人讨论（实际 ${n} 人）`);

  const segs = validateSegments(s, speakerIds, err, warn);
  const nos = validateGroups(s, segs, err, warn);
  validateNumbers(s, nos, err, warn);
  return { errors, warnings };
}

const ORIGIN = new WeakMap(); // 条目 -> 来源分片相对路径

/**
 * 校验听力内容（原始条目数组，可混合多个分片）。
 * @returns {{ errors: string[], warnings: string[] }} 消息统一以 ielts/ 开头便于定位
 */
function validateListeningContent(items) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items)) {
    errors.push('ielts/listening: 内容必须是数组');
    return { errors, warnings };
  }
  const seen = new Map();
  items.forEach((item, i) => {
    const origin = (isPlainObject(item) && ORIGIN.get(item)) || 'listening';
    const id = isPlainObject(item) && typeof item.id === 'string' ? item.id : '?';
    const where = `ielts/${origin} [${i}] id=${id}`;
    const r = validateSection(item);
    r.errors.forEach((m) => errors.push(`${where}: ${m}`));
    r.warnings.forEach((m) => warnings.push(`${where}: ${m}`));
    if (id !== '?') {
      if (seen.has(id)) errors.push(`${where}: id 重复（首次出现于 ${seen.get(id)}）`);
      else seen.set(id, `ielts/${origin}`);
    }
  });
  return { errors, warnings };
}

// ---- 内容加载 ----

// 读一个目录下全部 *.json 分片（每个分片须为数组）；目录不存在视为空
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
    arr.forEach((item) => {
      if (isPlainObject(item)) ORIGIN.set(item, rel);
      out.push(item);
    });
  }
  return out;
}

function buildContent() {
  const base = ielts.dataDir();
  const issues = [];
  const raw = [
    ...loadShardDir(path.join(base, 'listening'), 'listening', issues),
    // data/ielts/local/listening/ 存放不入库的私有资料，schema 相同
    ...loadShardDir(path.join(base, 'local', 'listening'), 'local/listening', issues),
  ];
  // 有 error 的 section 不下发（判分依赖结构完整）；重复 id 只保留首次出现的那条
  const items = [];
  const byId = new Map();
  const rejected = [];
  for (const item of raw) {
    const id = isPlainObject(item) ? item.id : undefined;
    const r = validateSection(item);
    if (r.errors.length) rejected.push({ id: id || '?', errors: r.errors });
    else if (byId.has(id)) rejected.push({ id, errors: ['id 重复'] });
    else {
      byId.set(id, item);
      items.push(item);
    }
  }
  items.sort((a, b) => a.part - b.part); // 稳定排序：同一部分内保持分片顺序
  if (rejected.length || issues.length) {
    console.error(
      `[ielts-listening] 听力内容有误：${rejected.length} 个 section 已跳过，${issues.length} 个分片读取失败` +
        '（运行 node scripts/test-ielts-listening.js 或 npm run validate 查看详情）'
    );
  }
  return { dir: base, raw, items, byId, issues, rejected };
}

let content = null;
function getContent() {
  if (!content) content = buildContent();
  return content;
}

function reload() {
  content = null;
}

/** 读取问题 + 全部原始条目的校验结果（供 scripts/validate.js 接入） */
function validateAll() {
  const c = getContent();
  const r = validateListeningContent(c.raw);
  return { errors: [...c.issues.map((m) => `ielts/${m}`), ...r.errors], warnings: r.warnings };
}

// ---- 对外视图 ----

function scriptWords(section) {
  return section.segments.reduce((n, sg) => n + ielts.countWords(sg.text), 0);
}

/** 列表概要 */
function sectionSummary(s) {
  return {
    id: s.id,
    part: s.part,
    title: s.title,
    titleCn: s.titleCn || '',
    questionCount: questionNumbers(s).length,
    types: [...new Set(s.groups.map((g) => g.type))],
    speakerCount: s.speakers.length,
    segmentCount: s.segments.length,
    scriptWords: scriptWords(s),
  };
}

const pickOption = (o) => ({ key: o.key, text: o.text });

/** 下发给前端的题目与脚本：去掉 answer / explanation / segment / evidence */
function publicSection(s) {
  return {
    id: s.id,
    part: s.part,
    title: s.title,
    titleCn: s.titleCn || '',
    intro: s.intro || '',
    speakers: s.speakers.map((sp) => ({ id: sp.id, name: sp.name, gender: sp.gender })),
    segments: s.segments.map((sg) => ({ speaker: sg.speaker, text: sg.text })),
    groups: s.groups.map((g) => {
      const out = {
        type: g.type,
        from: g.from,
        instruction: g.instruction,
        wordLimit: g.wordLimit || null,
        title: g.title || '',
        questions: g.questions.map((q) => {
          const pq = { no: q.no, prompt: q.prompt };
          if (q.heading) pq.heading = q.heading;
          if (Array.isArray(q.options)) pq.options = q.options.map(pickOption);
          return pq;
        }),
      };
      if (Array.isArray(g.options)) {
        out.options = g.options.map(pickOption);
        out.optionsTitle = g.optionsTitle || '';
      }
      return out;
    }),
    questionCount: questionNumbers(s).length,
  };
}

// ---- 作答记录（ielts.json 的 listenings 数组）----

function isValidRecord(r) {
  return (
    isPlainObject(r) &&
    typeof r.sectionId === 'string' &&
    SECTION_ID_RE.test(r.sectionId) &&
    MODES.includes(r.mode) &&
    Number.isInteger(r.total) && r.total > 0 && r.total <= 100 &&
    Number.isInteger(r.raw) && r.raw >= 0 && r.raw <= r.total &&
    ielts.isBand(r.band, 0) &&
    typeof r.ts === 'number' && Number.isFinite(r.ts)
  );
}

/** 读取时自行校验：不合法的记录丢弃 */
function sanitizeListenings(raw) {
  return Array.isArray(raw) ? raw.filter(isValidRecord) : [];
}

/** 追加一条并只保留最近 MAX_LISTENINGS 条 */
function appendRecord(raw, entry) {
  const list = sanitizeListenings(raw);
  list.push(entry);
  return list.length > MAX_LISTENINGS ? list.slice(-MAX_LISTENINGS) : list;
}

// a 是否优于 b：正确率高者优先，同分取更近的一次
function better(a, b) {
  const ra = a.raw / a.total;
  const rb = b.raw / b.total;
  if (ra !== rb) return ra > rb;
  return a.ts >= b.ts;
}

/** 按 section 汇总：{ attempts, best, last } */
function statsBySection(records) {
  const m = new Map();
  for (const r of records) {
    const s = m.get(r.sectionId) || { attempts: 0, best: null, last: null };
    s.attempts++;
    const brief = { raw: r.raw, total: r.total, band: r.band, mode: r.mode, ts: r.ts };
    if (!s.best || better(brief, s.best)) s.best = brief;
    if (!s.last || r.ts >= s.last.ts) s.last = brief;
    m.set(r.sectionId, s);
  }
  return m;
}

module.exports = {
  // 内容
  getContent,
  reload,
  getSections: () => getContent().items,
  getSection: (id) => getContent().byId.get(id) || null,
  sectionSummary,
  publicSection,
  questionNumbers,
  // 校验
  validateListeningContent,
  validateSection,
  validateAll,
  // 判分
  normalizeAnswer,
  containsPhrase,
  countAnswerTokens,
  fitsWordLimit,
  gradeQuestion,
  gradeSection,
  parseAnswers,
  estimateBand,
  scaleTo40,
  bandFrom40,
  // 记录
  sanitizeListenings,
  appendRecord,
  statsBySection,
  better,
  // 常量
  PARTS,
  GROUP_TYPES,
  COMPLETION_TYPES,
  CHOICE_TYPES,
  WORD_LIMITS,
  MODES,
  BAND_TABLE,
  BAND_NOTE,
  MAX_LISTENINGS,
  MAX_ANSWER_LEN,
  MAX_DURATION_SEC,
  QUESTIONS_PER_SECTION,
};
