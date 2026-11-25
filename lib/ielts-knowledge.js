'use strict';
// 雅思基础知识库：内容加载（data/ielts/knowledge/*.json 分片）、内容校验、小测判分与对外视图。
// 文章 schema、接口与前端要求见 docs/design/ielts-knowledge-20261125.md。
// 内容目录默认是 lib/ielts.js dataDir() 下的 knowledge/，可用环境变量 IELTS_KNOWLEDGE_DIR 覆盖（相对路径按项目根目录解析）。

const fs = require('fs');
const path = require('path');
const ielts = require('./ielts');
const { readJSON } = require('./store');

const ROOT = path.join(__dirname, '..');

// ---- 枚举与常量（契约 §1 §2）----
const DOMAINS = {
  grammar: '语法',
  strategy: '题型技巧',
  language: '功能表达',
  pronunciation: '发音',
  wordform: '构词',
};
const DOMAIN_KEYS = Object.keys(DOMAINS);
const ID_PREFIX = { grammar: 'gr-', strategy: 'st-', language: 'lang-', pronunciation: 'pron-', wordform: 'wf-' };
// 各领域允许的 track（顺序即目录里的展示顺序）
const TRACKS = {
  grammar: { core: '核心语法', advanced: '写作进阶语法' },
  strategy: { listening: '听力技巧', reading: '阅读技巧', writing: '写作方法', speaking: '口语方法' },
  language: { writing: '写作表达', speaking: '口语表达' },
  pronunciation: { sounds: '音素', stress: '重音与语调', connected: '连读与弱读' },
  wordform: { affix: '词缀', root: '词根', collocation: '搭配' },
};
const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
const EXERCISE_TYPES = ['mcq', 'fill', 'correct'];
const TABS = [
  'learn', 'practice', 'dictionary', 'dictation', 'exam', 'transform', 'dialogue', 'review', 'words', 'comprehension',
  'ielts:plan', 'ielts:vocab', 'ielts:listening', 'ielts:reading', 'ielts:writing', 'ielts:speaking',
];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LEN = 64;
const SECTIONS_RANGE = [2, 6];
const EXERCISES_RANGE = [3, 8];
const MINUTES_RANGE = [5, 40];
const MCQ_OPTIONS_RANGE = [2, 6];
const MIN_PITFALLS = 3; // 语法 / 表达 / 发音 / 构词类建议至少 3 条（不足只给 warning）
const MAX_ORDER = 9999;
const CURLY_RE = /[‘’“”]/;
const HTML_TAG_RE = /<\/?[a-z][a-z0-9]*\b[^>]*>/i;
const NCE_BOOKS = [1, 2, 3, 4];

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function isNonEmptyStr(v) {
  return typeof v === 'string' && v.trim() !== '';
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isValidId(id) {
  return typeof id === 'string' && id.length <= MAX_ID_LEN && ID_RE.test(id);
}

// ---- 内容加载 ----
const ORIGIN = new WeakMap(); // 条目 -> 来源分片文件名（校验报错定位用）
let content = null;

function knowledgeDir() {
  const env = process.env.IELTS_KNOWLEDGE_DIR;
  return env ? path.resolve(ROOT, env) : path.join(ielts.dataDir(), 'knowledge');
}

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
  const dir = knowledgeDir();
  const issues = [];
  const items = loadShardDir(dir, 'knowledge', issues);
  // 重复 id 只保留首次出现的那篇（重复由 validateKnowledgeContent 报错）
  const byId = new Map();
  for (const a of items) {
    if (isValidId(a.id) && !byId.has(a.id)) byId.set(a.id, a);
  }
  return { dir, items, byId, issues };
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

// ---- 排序与对外视图 ----
function domainRank(d) {
  const i = DOMAIN_KEYS.indexOf(d);
  return i >= 0 ? i : DOMAIN_KEYS.length;
}
function trackRank(d, t) {
  const keys = TRACKS[d] ? Object.keys(TRACKS[d]) : [];
  const i = keys.indexOf(t);
  return i >= 0 ? i : keys.length;
}
// 目录顺序：domain → track（按 TRACKS 定义顺序）→ order → id
function compareArticles(a, b) {
  return (
    domainRank(a.domain) - domainRank(b.domain) ||
    trackRank(a.domain, a.track) - trackRank(b.domain, b.track) ||
    (Number.isFinite(a.order) ? a.order : MAX_ORDER) - (Number.isFinite(b.order) ? b.order : MAX_ORDER) ||
    String(a.id).localeCompare(String(b.id))
  );
}

const str = (v) => (typeof v === 'string' ? v : '');
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

// 目录条目：不含 sections 和 exercises
function articleSummary(a) {
  return {
    id: a.id,
    domain: str(a.domain),
    domainLabel: DOMAINS[a.domain] || '',
    track: str(a.track),
    trackLabel: (TRACKS[a.domain] && TRACKS[a.domain][a.track]) || '',
    title: str(a.title),
    titleEn: str(a.titleEn),
    level: str(a.level),
    skills: strList(a.skills),
    order: Number.isFinite(a.order) ? a.order : null,
    minutes: Number.isInteger(a.minutes) ? a.minutes : null,
    summary: str(a.summary),
    sectionCount: Array.isArray(a.sections) ? a.sections.length : 0,
    exerciseCount: Array.isArray(a.exercises) ? a.exercises.length : 0,
  };
}

// 完整文章：按 schema 重新组装，结构不完整的部分丢弃（前端不必再防御畸形数据）
function publicArticle(a) {
  const sections = (Array.isArray(a.sections) ? a.sections : []).filter(isPlainObject).map((s) => {
    const out = {
      heading: str(s.heading),
      body: str(s.body),
      examples: (Array.isArray(s.examples) ? s.examples : []).filter(isPlainObject).map((e) => ({
        en: str(e.en),
        cn: str(e.cn),
        note: str(e.note),
      })),
    };
    if (isPlainObject(s.table) && Array.isArray(s.table.head)) {
      out.table = {
        head: s.table.head.map((h) => (typeof h === 'string' ? h : '')),
        rows: (Array.isArray(s.table.rows) ? s.table.rows : []).filter(Array.isArray).map((r) => r.map((c) => (typeof c === 'string' ? c : ''))),
      };
    }
    return out;
  });
  const pitfalls = (Array.isArray(a.pitfalls) ? a.pitfalls : []).filter(isPlainObject).map((p) => ({
    wrong: str(p.wrong),
    right: str(p.right),
    why: str(p.why),
  }));
  const exercises = (Array.isArray(a.exercises) ? a.exercises : [])
    .filter((e) => isPlainObject(e) && EXERCISE_TYPES.includes(e.type))
    .map((e) => {
      const out = { id: str(e.id), type: e.type, q: str(e.q), explain: str(e.explain) };
      if (e.type === 'mcq') {
        out.options = strList(e.options);
        out.answer = str(e.answer);
      } else {
        out.answer = strList(e.answer);
      }
      return out;
    });
  const rel = isPlainObject(a.related) ? a.related : {};
  const related = {
    grammarTags: strList(rel.grammarTags),
    nceLessons: (Array.isArray(rel.nceLessons) ? rel.nceLessons : [])
      .filter((l) => isPlainObject(l) && Number.isInteger(l.book) && Number.isInteger(l.lesson))
      .map((l) => ({ book: l.book, lesson: l.lesson })),
    tabs: strList(rel.tabs).filter((t) => TABS.includes(t)),
  };
  return { ...articleSummary(a), sections, pitfalls, exercises, related };
}

// ---- 判分（前端 public/js/ielts-knowledge-ui.js 复制同一套规则，改动时两边一起改）----

// 归一化：弯引号统一为直引号，合并空白，去掉句末标点，不区分大小写
function normalizeAnswer(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.!?…。！？]+$/u, '')
    .toLowerCase();
}

/**
 * 判一道小测题。mcq 比较所选选项与 answer；fill / correct 与任一可接受写法归一化后相同即对。
 * @returns {{ correct: boolean, blank: boolean }}
 */
function gradeExercise(ex, response) {
  const norm = normalizeAnswer(response);
  if (!norm) return { correct: false, blank: true };
  if (!isPlainObject(ex)) return { correct: false, blank: false };
  if (ex.type === 'mcq') return { correct: typeof ex.answer === 'string' && normalizeAnswer(ex.answer) === norm, blank: false };
  const accepted = strList(ex.answer).map(normalizeAnswer).filter(Boolean);
  return { correct: accepted.includes(norm), blank: false };
}

// ---- 内容校验 ----

// 题库里已有的语法标签（related.grammarTags 只能用这些）
function collectGrammarTags() {
  const tags = new Set();
  for (const q of require('./data').getQuestions()) {
    for (const g of Array.isArray(q.grammar) ? q.grammar : []) if (typeof g === 'string') tags.add(g);
  }
  return tags;
}

// 已收录的新概念课程「册-课」集合（related.nceLessons 指向未收录的课只给 warning）
function collectLessonKeys() {
  return new Set(require('./data').getLessons().map((l) => `${l.book}-${l.lesson}`));
}

// 递归找出含弯引号的字符串字段路径
function findCurlyQuotes(v, at, out) {
  if (typeof v === 'string') {
    if (CURLY_RE.test(v)) out.push(at);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findCurlyQuotes(x, `${at}[${i}]`, out));
  } else if (isPlainObject(v)) {
    for (const [k, x] of Object.entries(v)) findCurlyQuotes(x, at ? `${at}.${k}` : k, out);
  }
  return out;
}

/**
 * 校验知识库内容（getContent().items 或任意条目数组）。
 * opts.grammarTags / opts.lessonKeys 可注入（测试用），默认从 lib/data 的题库与课程汇总。
 * 消息以 ielts/ 开头便于定位。
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateKnowledgeContent(items, opts) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items)) {
    errors.push('ielts/knowledge: 知识库内容必须是数组');
    return { errors, warnings };
  }
  const o = opts || {};
  const ctx = {
    grammarTags: o.grammarTags instanceof Set ? o.grammarTags : collectGrammarTags(),
    lessonKeys: o.lessonKeys instanceof Set ? o.lessonKeys : collectLessonKeys(),
    idSeen: new Map(),
    orderSeen: new Map(),
  };
  items.forEach((a, i) => validateArticle(a, i, ctx, errors, warnings));
  return { errors, warnings };
}

function validateArticle(a, index, ctx, errors, warnings) {
  const where = `ielts/${isPlainObject(a) ? originOf(a) : '?'} knowledge[${index}] id=${(isPlainObject(a) && a.id) || '?'}`;
  if (!isPlainObject(a)) {
    errors.push(`${where}: 条目必须是对象`);
    return;
  }

  // id：格式、唯一、前缀与 domain 对应
  if (!isValidId(a.id)) {
    errors.push(`${where}: id 必须由小写字母、数字和单个 - 组成（最长 ${MAX_ID_LEN} 位）`);
  } else if (ctx.idSeen.has(a.id)) {
    errors.push(`${where}: id 重复（首次出现于 ${ctx.idSeen.get(a.id)}）`);
  } else {
    ctx.idSeen.set(a.id, originOf(a));
  }
  const domainOk = hasOwn(DOMAINS, a.domain);
  if (!domainOk) {
    errors.push(`${where}: domain 必须是 ${DOMAIN_KEYS.join(' / ')} 之一`);
  } else {
    if (typeof a.id === 'string' && !a.id.startsWith(ID_PREFIX[a.domain])) {
      errors.push(`${where}: ${a.domain} 类文章的 id 必须以 ${ID_PREFIX[a.domain]} 开头`);
    }
    if (!hasOwn(TRACKS[a.domain], a.track)) {
      errors.push(`${where}: domain=${a.domain} 的 track 必须是 ${Object.keys(TRACKS[a.domain]).join(' / ')} 之一（实际 ${a.track}）`);
    }
  }

  // 基本字段
  if (!isNonEmptyStr(a.title)) errors.push(`${where}: 缺少 title`);
  if (!isNonEmptyStr(a.titleEn)) errors.push(`${where}: 缺少 titleEn`);
  if (!LEVELS.includes(a.level)) errors.push(`${where}: level 必须是 ${LEVELS.join(' / ')} 之一`);
  if (!Array.isArray(a.skills) || !a.skills.length || !a.skills.every((s) => SKILLS.includes(s))) {
    errors.push(`${where}: skills 必须是非空数组，取值 ${SKILLS.join(' / ')}`);
  } else if (new Set(a.skills).size !== a.skills.length) {
    warnings.push(`${where}: skills 有重复项`);
  }
  if (!Number.isInteger(a.order) || a.order < 0 || a.order > MAX_ORDER) {
    errors.push(`${where}: order 必须是 0–${MAX_ORDER} 的整数`);
  } else if (domainOk && typeof a.track === 'string') {
    const key = `${a.domain}/${a.track}#${a.order}`;
    if (ctx.orderSeen.has(key)) warnings.push(`${where}: 与 ${ctx.orderSeen.get(key)} 在同一 track 内 order 相同，排序将按 id 决定`);
    else ctx.orderSeen.set(key, a.id);
  }
  if (!Number.isInteger(a.minutes) || a.minutes < MINUTES_RANGE[0] || a.minutes > MINUTES_RANGE[1]) {
    errors.push(`${where}: minutes 必须是 ${MINUTES_RANGE[0]}–${MINUTES_RANGE[1]} 的整数`);
  }
  if (!isNonEmptyStr(a.summary)) errors.push(`${where}: 缺少 summary`);

  validateSections(a.sections, where, errors, warnings);
  validatePitfalls(a, where, errors, warnings);
  validateExercises(a, where, errors, warnings);
  validateRelated(a.related, where, ctx, errors, warnings);

  // 全部字符串字段：不用弯引号（中文引用请用「」）
  const curly = findCurlyQuotes(a, '', []);
  if (curly.length) {
    errors.push(`${where}: 含弯引号（‘ ’ “ ”），英文改用直引号，中文引用改用「」：${curly.slice(0, 5).join(', ')}${curly.length > 5 ? ` 等 ${curly.length} 处` : ''}`);
  }
}

function validateSections(sections, where, errors, warnings) {
  if (!Array.isArray(sections) || sections.length < SECTIONS_RANGE[0] || sections.length > SECTIONS_RANGE[1]) {
    errors.push(`${where}: sections 必须是 ${SECTIONS_RANGE[0]}–${SECTIONS_RANGE[1]} 节的数组`);
    if (!Array.isArray(sections)) return;
  }
  sections.forEach((s, i) => {
    const sw = `${where} sections[${i}]`;
    if (!isPlainObject(s)) {
      errors.push(`${sw}: 必须是对象 { heading, body, examples?, table? }`);
      return;
    }
    if (!isNonEmptyStr(s.heading)) errors.push(`${sw}: 缺少 heading`);
    if (!isNonEmptyStr(s.body)) errors.push(`${sw}: 缺少 body`);
    else if (HTML_TAG_RE.test(s.body)) warnings.push(`${sw}: body 里像是写了 HTML 标签（页面会按纯文本显示），加粗请用 **…**`);
    if (s.examples !== undefined) {
      if (!Array.isArray(s.examples)) {
        errors.push(`${sw}: examples 必须是数组`);
      } else {
        s.examples.forEach((e, j) => {
          const ew = `${sw} examples[${j}]`;
          if (!isPlainObject(e)) {
            errors.push(`${ew}: 必须是对象 { en, cn, note? }`);
            return;
          }
          if (!isNonEmptyStr(e.en)) errors.push(`${ew}: 缺少 en`);
          if (!isNonEmptyStr(e.cn)) errors.push(`${ew}: 缺少 cn`);
          if (e.note !== undefined && typeof e.note !== 'string') errors.push(`${ew}: note 必须是字符串`);
        });
      }
    }
    if (s.table !== undefined) validateTable(s.table, `${sw} table`, errors);
  });
}

function validateTable(t, tw, errors) {
  if (!isPlainObject(t)) {
    errors.push(`${tw}: 必须是对象 { head, rows }`);
    return;
  }
  if (!Array.isArray(t.head) || !t.head.length || !t.head.every((h) => typeof h === 'string')) {
    errors.push(`${tw}: head 必须是非空字符串数组`);
    return;
  }
  if (!Array.isArray(t.rows) || !t.rows.length) {
    errors.push(`${tw}: rows 必须是非空数组`);
    return;
  }
  t.rows.forEach((r, k) => {
    if (!Array.isArray(r) || !r.every((c) => typeof c === 'string')) errors.push(`${tw}.rows[${k}]: 必须是字符串数组`);
    else if (r.length !== t.head.length) errors.push(`${tw}.rows[${k}]: 列数 ${r.length} 与 head 的 ${t.head.length} 列不一致`);
  });
}

function validatePitfalls(a, where, errors, warnings) {
  if (!Array.isArray(a.pitfalls)) {
    errors.push(`${where}: pitfalls 必须是数组（技巧类可为空数组）`);
    return;
  }
  a.pitfalls.forEach((p, i) => {
    const pw = `${where} pitfalls[${i}]`;
    if (!isPlainObject(p)) {
      errors.push(`${pw}: 必须是对象 { wrong, right, why }`);
      return;
    }
    for (const k of ['wrong', 'right', 'why']) if (!isNonEmptyStr(p[k])) errors.push(`${pw}: 缺少 ${k}`);
    if (isNonEmptyStr(p.wrong) && isNonEmptyStr(p.right) && normalizeAnswer(p.wrong) === normalizeAnswer(p.right)) {
      errors.push(`${pw}: wrong 与 right 相同`);
    }
  });
  if (a.domain !== 'strategy' && a.pitfalls.length < MIN_PITFALLS) {
    warnings.push(`${where}: pitfalls 只有 ${a.pitfalls.length} 条，${DOMAINS[a.domain] || '该'}类建议至少 ${MIN_PITFALLS} 条`);
  }
}

function validateExercises(a, where, errors, warnings) {
  const list = a.exercises;
  if (!Array.isArray(list) || list.length < EXERCISES_RANGE[0] || list.length > EXERCISES_RANGE[1]) {
    errors.push(`${where}: exercises 必须是 ${EXERCISES_RANGE[0]}–${EXERCISES_RANGE[1]} 题的数组`);
    if (!Array.isArray(list)) return;
  }
  const seen = new Set();
  list.forEach((ex, i) => {
    const xw = `${where} exercises[${i}]`;
    if (!isPlainObject(ex)) {
      errors.push(`${xw}: 必须是对象`);
      return;
    }
    if (!isValidId(ex.id)) errors.push(`${xw}: id 必须由小写字母、数字和 - 组成`);
    else if (seen.has(ex.id)) errors.push(`${xw}: 题目 id「${ex.id}」在本篇内重复`);
    else {
      seen.add(ex.id);
      if (typeof a.id === 'string' && !ex.id.startsWith(`${a.id}-`)) warnings.push(`${xw}: 题目 id 建议以文章 id 开头（如 ${a.id}-q${i + 1}）`);
    }
    if (!EXERCISE_TYPES.includes(ex.type)) {
      errors.push(`${xw}: type 必须是 ${EXERCISE_TYPES.join(' / ')} 之一`);
      return;
    }
    if (!isNonEmptyStr(ex.q)) errors.push(`${xw}: 缺少 q`);
    if (!isNonEmptyStr(ex.explain)) errors.push(`${xw}: 缺少 explain（中文解析）`);

    if (ex.type === 'mcq') {
      const opts = ex.options;
      if (!Array.isArray(opts) || opts.length < MCQ_OPTIONS_RANGE[0] || opts.length > MCQ_OPTIONS_RANGE[1] || !opts.every(isNonEmptyStr)) {
        errors.push(`${xw}: mcq 的 options 必须是 ${MCQ_OPTIONS_RANGE[0]}–${MCQ_OPTIONS_RANGE[1]} 个非空字符串`);
        return;
      }
      if (new Set(opts.map(normalizeAnswer)).size !== opts.length) errors.push(`${xw}: options 有归一化后重复的选项`);
      if (typeof ex.answer !== 'string' || !opts.includes(ex.answer)) errors.push(`${xw}: mcq 的 answer 必须与某个 option 完全一致`);
      return;
    }

    // fill / correct：answer 是非空的可接受写法数组
    if (!Array.isArray(ex.answer) || !ex.answer.length || !ex.answer.every(isNonEmptyStr)) {
      errors.push(`${xw}: ${ex.type} 的 answer 必须是非空字符串数组（可接受写法逐个列出）`);
      return;
    }
    const norms = ex.answer.map(normalizeAnswer);
    if (new Set(norms).size !== norms.length) warnings.push(`${xw}: answer 有归一化后重复的写法`);
    if (ex.type === 'fill' && isNonEmptyStr(ex.q) && !/_{2,}/.test(ex.q)) warnings.push(`${xw}: fill 题的 q 里没有 ___ 空位`);
    if (ex.type === 'correct' && isNonEmptyStr(ex.q) && norms.includes(normalizeAnswer(ex.q))) {
      errors.push(`${xw}: correct 题的原句本身就是可接受答案（原句应含错误）`);
    }
  });
}

function validateRelated(rel, where, ctx, errors, warnings) {
  if (rel === undefined) return;
  const rw = `${where} related`;
  if (!isPlainObject(rel)) {
    errors.push(`${rw}: 必须是对象 { grammarTags?, nceLessons?, tabs? }`);
    return;
  }
  const extra = Object.keys(rel).filter((k) => !['grammarTags', 'nceLessons', 'tabs'].includes(k));
  if (extra.length) warnings.push(`${rw}: 未知字段 ${extra.join(', ')}（会被忽略）`);
  if (rel.grammarTags !== undefined) {
    if (!Array.isArray(rel.grammarTags) || !rel.grammarTags.every(isNonEmptyStr)) {
      errors.push(`${rw}.grammarTags: 必须是字符串数组`);
    } else {
      const unknown = rel.grammarTags.filter((t) => !ctx.grammarTags.has(t));
      if (unknown.length) errors.push(`${rw}.grammarTags: 题库里没有这些语法标签：${unknown.join('、')}`);
    }
  }
  if (rel.nceLessons !== undefined) {
    if (!Array.isArray(rel.nceLessons)) {
      errors.push(`${rw}.nceLessons: 必须是数组`);
    } else {
      rel.nceLessons.forEach((l, i) => {
        const lw = `${rw}.nceLessons[${i}]`;
        if (!isPlainObject(l) || !NCE_BOOKS.includes(l.book) || !Number.isInteger(l.lesson) || l.lesson < 1 || l.lesson > 200) {
          errors.push(`${lw}: 必须是 { book: 1–4, lesson: 1–200 的整数 }`);
        } else if (!ctx.lessonKeys.has(`${l.book}-${l.lesson}`)) {
          warnings.push(`${lw}: 新概念第 ${l.book} 册第 ${l.lesson} 课尚未收录，跳转后会提示「该课程尚未收录」`);
        }
      });
    }
  }
  if (rel.tabs !== undefined) {
    if (!Array.isArray(rel.tabs) || !rel.tabs.every((t) => typeof t === 'string')) {
      errors.push(`${rw}.tabs: 必须是字符串数组`);
    } else {
      const bad = rel.tabs.filter((t) => !TABS.includes(t));
      if (bad.length) errors.push(`${rw}.tabs: 不支持的跳转目标 ${bad.join(', ')}（可用：${TABS.join(' ')}）`);
    }
  }
}

module.exports = {
  // 内容
  knowledgeDir,
  getContent,
  getArticles: () => getContent().items,
  getArticle: (id) => getContent().byId.get(id) || null,
  reload,
  originOf,
  // 视图
  compareArticles,
  articleSummary,
  publicArticle,
  // 判分
  normalizeAnswer,
  gradeExercise,
  // 校验
  validateKnowledgeContent,
  collectGrammarTags,
  // 常量
  DOMAINS,
  TRACKS,
  ID_PREFIX,
  LEVELS,
  SKILLS,
  EXERCISE_TYPES,
  TABS,
  ID_RE,
  MAX_ID_LEN,
  isValidId,
};
