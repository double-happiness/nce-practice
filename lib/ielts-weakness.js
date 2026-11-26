'use strict';

// 雅思弱项统计（设计见 docs/design/ielts-weakness-20261126.md §3），纯函数，供 GET /ielts/weakness 使用。
// 听力：按当前题库重判记录，按题型 / Part 统计正确率，错题按原因归类；阅读：只算考试模式，按题型 / 难度统计。
// 再从两项的题型里挑出最弱 2–3 项，附一句建议、知识库讲解 id 与练习入口。
// 不读写档案；题库与知识库查找通过 lookup 注入（缺省用各模块的内容缓存），测试可传替身。
const ielts = require('./ielts');
const listening = require('./ielts-listening');
const reading = require('./ielts-reading');
const knowledge = require('./ielts-knowledge');

const DEFAULT_DAYS = 60;
const MIN_DAYS = 7;
const MAX_DAYS = 365;
const MIN_SAMPLE = 8; // 题数不到 8 不参与最弱项排名（样本太少）
const WEAK_BELOW = 0.7; // 正确率低于 70% 才算弱项
const MAX_WEAKEST = 3;
const TOP_CAUSE_MIN = 3; // 最多的错误原因至少出现 3 次才单独提示

// 题型中文标签：与前端 ielts-listening-ui.js / ielts-reading-ui.js 的 TYPE_LABEL 一致
const LISTENING_TYPE_LABEL = {
  'form-completion': '表格填空',
  'note-completion': '笔记填空',
  'sentence-completion': '句子填空',
  'summary-completion': '摘要填空',
  'flowchart-completion': '流程图填空',
  mcq: '单选',
  matching: '匹配',
  'map-labelling': '地图标注',
  'mcq-multi': '多选',
};
const READING_TYPE_LABEL = {
  tfng: '判断 T/F/NG',
  ynng: '观点 Y/N/NG',
  'matching-headings': '段落标题配对',
  'matching-information': '信息定位',
  mcq: '单选',
  'sentence-completion': '句子填空',
  'summary-completion': '摘要填空',
  'short-answer': '简答',
};
const DIFFICULTY_LABEL = { easy: '易', medium: '中', hard: '难' };

// 听力错误原因：数组顺序即判定优先级（classifyCause 按顺序取第一个命中的）
const CAUSES = [
  { key: 'blank', label: '未作答', knowledgeId: 'st-listening-prediction' },
  { key: 'over-limit', label: '超出字数', knowledgeId: 'st-listening-spelling-format' },
  { key: 'choice', label: '选项选错', knowledgeId: 'st-listening-mcq' },
  { key: 'plural', label: '单复数', knowledgeId: 'st-listening-spelling-format' },
  { key: 'number', label: '数字 / 日期听错', knowledgeId: 'st-listening-spelling-format' },
  { key: 'spelling', label: '拼写', knowledgeId: 'st-listening-spelling-format' },
  { key: 'other', label: '其他（没听到 / 听错词）', knowledgeId: 'st-listening-prediction' },
];
const CAUSE_BY_KEY = new Map(CAUSES.map((c) => [c.key, c]));

// 题型 → 知识库讲解文章（文章不存在时返回 null，见 knowledgeIdFor）
const TYPE_KNOWLEDGE = {
  listening: {
    'form-completion': 'st-listening-form-completion',
    'note-completion': 'st-listening-form-completion',
    'sentence-completion': 'st-listening-form-completion',
    'summary-completion': 'st-listening-form-completion',
    'flowchart-completion': 'st-listening-form-completion',
    mcq: 'st-listening-mcq',
    matching: 'st-listening-matching-maps',
    'map-labelling': 'st-listening-matching-maps',
    'mcq-multi': 'st-listening-mcq',
  },
  reading: {
    tfng: 'st-reading-tfng',
    ynng: 'st-reading-tfng',
    'matching-headings': 'st-reading-matching-headings',
    'matching-information': 'st-reading-matching-information',
    'sentence-completion': 'st-reading-completion',
    'summary-completion': 'st-reading-completion',
    'short-answer': 'st-reading-completion',
    mcq: 'st-reading-mcq-paraphrase',
  },
};

// 每个题型一句建议（最弱项卡片上显示）
const TIPS = {
  listening: {
    'form-completion': '先看空格前后判断要填的信息类型（姓名、数字、日期、地址），听到拼读逐个字母记下，交卷前核对拼写和字数。',
    'note-completion': '先扫一遍笔记的标题和层级，预判每个空的词性和内容；原文常用同义替换，听到对应说法后再落笔。',
    'sentence-completion': '先读句子划关键词、预判空格词性，填进去的词要让句子语法完整，注意单复数和字数限制。',
    'summary-completion': '先通读摘要抓主线，跟着录音按顺序推进；摘要多是原文改写，留意同义替换之后出现的原词。',
    mcq: '先划出题干和各选项的区别点；先被提到的选项常被随后否定或修正，听完整句再选。',
    matching: '先熟悉选项列表并预想它们可能的同义说法，按题号顺序跟听，一个选项通常只用一次。',
    'flowchart-completion': '先顺着箭头把各步骤读一遍，弄清先后顺序并预判每个空的词性，录音按流程推进，留意 first / then / after that 等顺序词。',
    'map-labelling': '先在图上找好入口、指北针等参照点，听到 opposite / next to / beyond 等方位词时用手指跟着路线走，已用的字母随手划掉。',
    'mcq-multi': '先看清题干要找的是哪一类信息，录音常把几个选项都提一遍，只选被明确肯定的那几项，被否定或只是顺带提到的都是干扰项，顺序不限。',
  },
  reading: {
    tfng: '用题干关键词定位原文后逐项比对限定词（all / some / only）和数量；原文没提到就是 NOT GIVEN，别用常识推断。',
    ynng: '判断的是作者观点而非事实：先找作者的态度表达，再和题干逐项比对，作者没表态就是 NOT GIVEN。',
    'matching-headings': '先读每段首尾句抓段落主旨，别被段中的细节词带偏；先排除有把握的段落，剩下的再对比。',
    'matching-information': '题目考细节且不按顺序出题：先想好题干关键词的同义说法再扫读全文，同一段可能对应多题。',
    mcq: '先定位题干对应的段落，再把选项和原文逐句比对；和原文同词的选项常是干扰项，正确项多为同义改写。',
    'sentence-completion': '答案大体按原文顺序出现：用题干关键词定位，从原文原样摘词，填完通读整句检查语法和字数。',
    'summary-completion': '先判断每个空的词性，再定位摘要对应的原文段落；词库型摘要的选项多是同义替换，不一定是原词。',
    'short-answer': '按题号顺序定位，答案直接摘自原文，严格遵守字数限制，不改写、不加多余的词。',
  },
};

const SKILL_PRACTICE = { listening: 'listening', reading: 'reading' };

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isValidDays(n) {
  return Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;
}

/** 统计窗口：含今天在内的最近 days 天（本地日期，闭区间） */
function windowRange(today, days) {
  return { from: ielts.addDays(today, -(days - 1)), to: today };
}

function inWindow(ts, range) {
  const d = ielts.dateKey(ts);
  return d >= range.from && d <= range.to;
}

// ---- 错误原因判定 ----

/** 两个字符串的编辑距离（Levenshtein：插入 / 删除 / 替换各算 1） */
function editDistance(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[t.length];
}

/** 两个（已归一化的）答案是否只差结尾的 s / es */
function differsByPlural(a, b) {
  if (!a || !b || a === b) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long === `${short}s` || long === `${short}es`;
}

// 拼写容错：可接受答案不超过 5 个字符时只容 1 处差异，更长的容 2 处
function spellingTolerance(answer) {
  return answer.length <= 5 ? 1 : 2;
}

/**
 * 判定一道听力错题的原因，按 CAUSES 的顺序取第一个命中的。
 * @param {{ type: string, yours: string, overLimit: boolean, answers: string[] }} wrong
 *   type 为题组题型，yours 为考生作答（原文），answers 为可接受答案（原文）
 * @returns {string} cause key
 */
function classifyCause(wrong) {
  // 「未作答」与判分口径一致：去首尾空白后为空（gradeQuestion 的 empty）
  if (typeof wrong.yours !== 'string' || !wrong.yours.trim()) return 'blank';
  if (wrong.overLimit) return 'over-limit';
  if (listening.CHOICE_TYPES.includes(wrong.type)) return 'choice';
  const yours = listening.normalizeAnswer(wrong.yours);
  if (!yours) return 'other'; // 只写了标点之类，归一化后为空：没有可比的内容
  const answers = (Array.isArray(wrong.answers) ? wrong.answers : []).map(listening.normalizeAnswer).filter(Boolean);
  if (answers.some((a) => differsByPlural(yours, a))) return 'plural';
  const hasDigit = (s) => /\d/.test(s);
  if (hasDigit(yours) && answers.some(hasDigit)) return 'number';
  if (answers.some((a) => editDistance(yours, a) <= spellingTolerance(a))) return 'spelling';
  return 'other';
}

// ---- 正确率汇总 ----

function round2(x) {
  return Math.round(x * 100) / 100;
}

function accuracyOf(correct, total) {
  return total > 0 ? round2(correct / total) : null;
}

function addTally(map, key, correct) {
  const t = map.get(key) || { total: 0, correct: 0 };
  t.total++;
  if (correct) t.correct++;
  map.set(key, t);
}

/** 维度项 { key, label, total, correct, accuracy, enough }；只列有数据的项，按 order 的固定顺序 */
function dimensionItems(map, order, labelOf) {
  return order
    .filter((key) => map.has(key))
    .map((key) => {
      const t = map.get(key);
      return {
        key,
        label: labelOf(key),
        total: t.total,
        correct: t.correct,
        accuracy: accuracyOf(t.correct, t.total),
        enough: t.total >= MIN_SAMPLE,
      };
    });
}

function knowledgeIdFor(id, hasArticle) {
  return id && hasArticle(id) ? id : null;
}

// ---- 听力 ----

/**
 * 一条听力记录按当前题库重判。题目已不在题库、记录没有作答内容、或重判的 total / raw 与记录不一致时返回 null
 * （口径同 routes/ielts.js 的 listeningWrongItems）。
 * @returns {{ section, items: { no, type, correct, yours, overLimit, answer }[] } | null}
 */
function regradeListening(r, getSection) {
  const section = getSection(r.sectionId);
  if (!section || !isPlainObject(r.answers)) return null;
  const graded = listening.gradeSection(section, r.answers);
  if (graded.total !== r.total || graded.raw !== r.raw) return null;
  const typeOf = new Map();
  for (const g of section.groups) for (const q of g.questions) typeOf.set(q.no, g.type);
  const items = graded.results.map((x) => ({
    no: x.no,
    type: typeOf.get(x.no),
    correct: x.correct,
    yours: x.yours,
    overLimit: x.overLimit,
    answer: x.answer,
  }));
  return { section, items };
}

/**
 * 听力统计。考试模式（含模考写入的）每题都算、未作答记为错；练习模式只算作答了的题。
 * @returns {{ records, skipped, questions, byType, byPart, causes, topCause }}
 */
function analyzeListening(records, range, lookup) {
  const byType = new Map();
  const byPart = new Map();
  const causeCount = new Map();
  let used = 0;
  let skipped = 0;
  let questions = 0;
  for (const r of records) {
    if (!inWindow(r.ts, range)) continue;
    const regraded = regradeListening(r, lookup.getSection);
    if (!regraded) {
      skipped++;
      continue;
    }
    used++;
    for (const x of regraded.items) {
      if (r.mode !== 'exam' && !x.yours) continue;
      questions++;
      addTally(byType, x.type, x.correct);
      addTally(byPart, regraded.section.part, x.correct);
      if (!x.correct) {
        const cause = classifyCause({ type: x.type, yours: x.yours, overLimit: x.overLimit, answers: x.answer });
        causeCount.set(cause, (causeCount.get(cause) || 0) + 1);
      }
    }
  }
  // 按次数降序；同次数按 CAUSES 的固定顺序（sort 稳定）
  const causes = CAUSES.filter((c) => causeCount.has(c.key))
    .map((c) => ({ key: c.key, label: c.label, count: causeCount.get(c.key) }))
    .sort((a, b) => b.count - a.count);
  const top = causes[0];
  const topCause =
    top && top.count >= TOP_CAUSE_MIN
      ? { ...top, knowledgeId: knowledgeIdFor(CAUSE_BY_KEY.get(top.key).knowledgeId, lookup.hasArticle) }
      : null;
  return {
    records: used,
    skipped,
    questions,
    byType: dimensionItems(byType, listening.GROUP_TYPES, (k) => LISTENING_TYPE_LABEL[k] || k),
    byPart: dimensionItems(byPart, listening.PARTS, (k) => `Part ${k}`),
    causes,
    topCause,
  };
}

// ---- 阅读 ----

/**
 * 一条阅读记录按当前题库还原每题对错（记录只存错题 id）。文章不在题库、题数变了、缺 wrong、
 * 错题数与 raw 对不上或 wrong 里有不存在的题 id 时返回 null（口径同 routes/ielts.js 的 readingWrongItems）。
 * @returns {{ passage, items: { id, type, correct }[] } | null}
 */
function regradeReading(r, getPassage) {
  const passage = getPassage(r.passageId);
  if (!passage || !Array.isArray(r.wrong)) return null;
  const graded = reading.gradePassage(passage, {});
  if (graded.total !== r.total) return null;
  const wrongIds = new Set(r.wrong);
  const ids = new Set(graded.results.map((x) => x.id));
  if (wrongIds.size !== r.total - r.raw || ![...wrongIds].every((id) => ids.has(id))) return null;
  return { passage, items: graded.results.map((x) => ({ id: x.id, type: x.type, correct: !wrongIds.has(x.id) })) };
}

/**
 * 阅读统计：只算考试模式（含模考）。练习模式分不清「没做」和「做错」，直接忽略（不计入 skipped）。
 * @returns {{ records, skipped, questions, byType, byDifficulty }}
 */
function analyzeReading(records, range, lookup) {
  const byType = new Map();
  const byDifficulty = new Map();
  let used = 0;
  let skipped = 0;
  let questions = 0;
  for (const r of records) {
    if (r.mode !== 'exam' || !inWindow(r.ts, range)) continue;
    const regraded = regradeReading(r, lookup.getPassage);
    if (!regraded) {
      skipped++;
      continue;
    }
    used++;
    const difficulty = regraded.passage.difficulty;
    for (const x of regraded.items) {
      questions++;
      addTally(byType, x.type, x.correct);
      if (Object.prototype.hasOwnProperty.call(DIFFICULTY_LABEL, difficulty)) addTally(byDifficulty, difficulty, x.correct);
    }
  }
  return {
    records: used,
    skipped,
    questions,
    byType: dimensionItems(byType, reading.QUESTION_TYPES, (k) => READING_TYPE_LABEL[k] || k),
    byDifficulty: dimensionItems(byDifficulty, reading.DIFFICULTIES, (k) => DIFFICULTY_LABEL[k]),
  };
}

// ---- 最弱项 ----

/**
 * 听力、阅读题型里 enough 且正确率 < 70% 的，按正确率升序取前 3；正确率相同按题数多的在前（再相同保持听力在前、题型固定顺序）。
 * 正确率按两位小数的 accuracy 比较，与页面上显示的数字一致。
 */
function pickWeakest(listeningByType, readingByType, hasArticle) {
  const pool = [
    ...listeningByType.map((x) => ({ skill: 'listening', x })),
    ...readingByType.map((x) => ({ skill: 'reading', x })),
  ].filter(({ x }) => x.enough && x.accuracy != null && x.accuracy < WEAK_BELOW);
  pool.sort((a, b) => a.x.accuracy - b.x.accuracy || b.x.total - a.x.total);
  return pool.slice(0, MAX_WEAKEST).map(({ skill, x }) => ({
    skill,
    key: x.key,
    label: x.label,
    total: x.total,
    correct: x.correct,
    accuracy: x.accuracy,
    tip: TIPS[skill][x.key] || '',
    knowledgeId: knowledgeIdFor(TYPE_KNOWLEDGE[skill][x.key], hasArticle),
    practice: SKILL_PRACTICE[skill],
  }));
}

function defaultLookup() {
  return {
    getSection: listening.getSection,
    getPassage: reading.getPassage,
    hasArticle: (id) => !!knowledge.getArticle(id),
  };
}

/**
 * 弱项统计入口。
 * @param {object} user  ielts.loadUser() 的结果（只读 listenings / readings）
 * @param {{ days?: number, today?: string, lookup?: { getSection, getPassage, hasArticle } }} [opts]
 *   days 缺省 60（须为 7–365 的整数）；today 缺省为本地今天；lookup 缺省用题库与知识库的内容缓存
 * @returns 结构见设计文档 §4：{ days, from, to, listening, reading, weakest }
 */
function analyzeWeakness(user, opts) {
  const o = opts || {};
  const days = o.days == null ? DEFAULT_DAYS : o.days;
  if (!isValidDays(days)) throw new RangeError(`days 必须是 ${MIN_DAYS}–${MAX_DAYS} 的整数`);
  const today = o.today == null ? ielts.todayKey() : o.today;
  if (!ielts.isValidDateKey(today)) throw new RangeError('today 必须是 YYYY-MM-DD 格式的有效日期');
  const lookup = { ...defaultLookup(), ...(o.lookup || {}) };
  const range = windowRange(today, days);
  const src = isPlainObject(user) ? user : {};
  const l = analyzeListening(listening.sanitizeListenings(src.listenings), range, lookup);
  const r = analyzeReading(reading.sanitizeReadings(src.readings), range, lookup);
  return {
    days,
    from: range.from,
    to: range.to,
    listening: l,
    reading: r,
    weakest: pickWeakest(l.byType, r.byType, lookup.hasArticle),
  };
}

module.exports = {
  analyzeWeakness,
  analyzeListening,
  analyzeReading,
  pickWeakest,
  classifyCause,
  editDistance,
  differsByPlural,
  accuracyOf,
  isValidDays,
  windowRange,
  // 常量
  DEFAULT_DAYS,
  MIN_DAYS,
  MAX_DAYS,
  MIN_SAMPLE,
  WEAK_BELOW,
  MAX_WEAKEST,
  TOP_CAUSE_MIN,
  CAUSES,
  TYPE_KNOWLEDGE,
  TIPS,
  LISTENING_TYPE_LABEL,
  READING_TYPE_LABEL,
  DIFFICULTY_LABEL,
};
