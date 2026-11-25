'use strict';
// 雅思阅读 / 听力错题的间隔复习。SRS key：
//   阅读 ir:<passageId>:<题目 id>   例 ir:rd-green-roofs:q3
//   听力 il:<sectionId>:<题号>      例 il:l1-sports-centre:4
// 判分直接调用 lib/ielts-reading.js 的 gradePassage、lib/ielts-listening.js 的 parseAnswers + gradeSection，
// 只取目标题那一条结果：拼写、大小写、字数限制、数字写法与原模块完全一致，这里不另写规则。

const profile = require('./profile');
const { readJSON, writeJSONAtomic } = require('./store');
const reading = require('./ielts-reading');
const listening = require('./ielts-listening');

const READING_PREFIX = 'ir:';
const LISTENING_PREFIX = 'il:';
const MAX_KEY_LEN = 100;
// 与 lib/ielts-listening.js 内部的 SECTION_ID_RE 一致（该常量未导出）
const SECTION_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const QUESTION_NO_RE = /^[1-9]\d{0,2}$/;
// 与 routes/ielts-reading.js 交卷校验的 MAX_ANSWER_LEN 一致；听力用 listening.MAX_ANSWER_LEN
const READING_MAX_ANSWER_LEN = 200;
// 交卷时只把「作答了但答错」的题送进复习；没作答的题不算错题（练习模式常只做一部分，全送进去会淹没队列）
const ENQUEUE_BLANK = false;

const BLANK = '{blank}';
const JUDGE_CHOICES = { tfng: ['TRUE', 'FALSE', 'NOT GIVEN'], ynng: ['YES', 'NO', 'NOT GIVEN'] };
const READING_LIMITED_TYPES = ['sentence-completion', 'summary-completion', 'short-answer'];

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// ---- key ----

function isIeltsKey(id) {
  return typeof id === 'string' && (id.startsWith(READING_PREFIX) || id.startsWith(LISTENING_PREFIX));
}

function readingKey(passageId, qid) {
  return `${READING_PREFIX}${passageId}:${qid}`;
}

function listeningKey(sectionId, no) {
  return `${LISTENING_PREFIX}${sectionId}:${no}`;
}

/** 解析 key；格式不对返回 null（内容 id 不含冒号，按冒号切成三段） */
function parseKey(id) {
  if (!isIeltsKey(id) || id.length > MAX_KEY_LEN) return null;
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const [prefix, contentId, qid] = parts;
  if (prefix === 'ir' && reading.PASSAGE_ID_RE.test(contentId) && reading.QUESTION_ID_RE.test(qid)) {
    return { source: 'reading', contentId, qid };
  }
  if (prefix === 'il' && SECTION_ID_RE.test(contentId) && QUESTION_NO_RE.test(qid)) {
    return { source: 'listening', contentId, no: Number(qid) };
  }
  return null;
}

// 按条件在题组里找题（防御式：跳过结构不完整的组和题）
function findQuestion(groups, match) {
  if (!Array.isArray(groups)) return null;
  for (const g of groups) {
    if (!isPlainObject(g) || !Array.isArray(g.questions)) continue;
    for (const q of g.questions) {
      if (isPlainObject(q) && match(q)) return { group: g, question: q };
    }
  }
  return null;
}

/**
 * key → 原题。文章 / section / 题目任一不存在返回 null。
 * @returns {{ source:'reading', id, passage, group, question } | { source:'listening', id, section, group, question } | null}
 */
function resolve(id) {
  const k = parseKey(id);
  if (!k) return null;
  if (k.source === 'reading') {
    const passage = reading.getPassage(k.contentId);
    if (!passage) return null;
    const hit = findQuestion(passage.groups, (q) => q.id === k.qid);
    return hit ? { source: 'reading', id, passage, ...hit } : null;
  }
  const section = listening.getSection(k.contentId);
  if (!section) return null;
  const hit = findQuestion(section.groups, (q) => q.no === k.no);
  return hit ? { source: 'listening', id, section, ...hit } : null;
}

/**
 * 原题是否确实已从内容里删除（可以安全移出复习队列）。
 * 分片读取失败、听力 section 校验不过被跳过、阅读文章自身校验报错时只算「暂时不可用」，
 * 返回 false：此时清理会让内容修好后复习记录已经丢失。
 */
function isGone(id) {
  if (!isIeltsKey(id)) return false;
  const k = parseKey(id);
  if (!k) return true; // 前缀对但格式坏的 key 永远解析不了
  if (resolve(id)) return false;
  if (k.source === 'reading') {
    const c = reading.getContent();
    if (c.issues.length) return false;
    const passage = c.byId.get(k.contentId);
    return !passage || reading.validateReadingContent([passage]).errors.length === 0;
  }
  const c = listening.getContent();
  return c.issues.length === 0 && !c.rejected.some((r) => r.id === k.contentId);
}

// ---- 出题（不含 answer / explanation / evidence）----

function optionList(list) {
  return Array.isArray(list)
    ? list.filter(isPlainObject).map((o) => ({ key: String(o.key || ''), text: String(o.text || '') }))
    : [];
}

function paragraphsOf(passage) {
  return (Array.isArray(passage.paragraphs) ? passage.paragraphs : [])
    .filter(isPlainObject)
    .map((para) => ({ label: String(para.label || ''), text: String(para.text || '') }));
}

// 选择类题目的选项；填空类返回 null
function readingChoices(r) {
  const { passage, group: g, question: q } = r;
  switch (g.type) {
    case 'tfng':
    case 'ynng':
      return JUDGE_CHOICES[g.type].map((v) => ({ key: v, text: '' }));
    case 'mcq':
      return optionList(q.options);
    case 'matching-headings':
      return optionList(g.options);
    case 'matching-information':
      return paragraphsOf(passage).map((para) => ({ key: para.label, text: '' }));
    case 'summary-completion':
      return Array.isArray(g.wordBank) ? optionList(g.wordBank) : null;
    default:
      return null;
  }
}

// 题干：空位统一用 {blank} 标出；摘要题给整段摘要，本题的空为 {blank}，其它空为 ______
function readingPrompt(g, q) {
  if (g.type === 'summary-completion') {
    const text = isPlainObject(g.summary) ? String(g.summary.text || '') : '';
    return text.replace(/\{(q\d{1,3})\}/g, (m, qid) => (qid === q.id ? BLANK : '______'));
  }
  if (g.type === 'matching-headings') return typeof q.prompt === 'string' && q.prompt ? q.prompt : `Paragraph ${q.para || ''}`;
  return typeof q.prompt === 'string' ? q.prompt : '';
}

// 所在段落原文：段落标题配对给待配对的段；信息定位题答案就是段落字母，只给一段等于泄题，所以给全文；
// 其余题型给 evidence 所在段（找不到时退回全文）
function readingContext(r) {
  const { passage, group: g, question: q } = r;
  const paras = paragraphsOf(passage);
  if (g.type === 'matching-information') return paras;
  const label = g.type === 'matching-headings' ? q.para : isPlainObject(q.evidence) ? q.evidence.para : null;
  const hit = paras.filter((p) => p.label === label);
  return hit.length ? hit : paras;
}

// 只有判分时会检查字数的题型才给字数限制（词库型摘要不限字数）
function readingWordLimitLabel(g) {
  if (!READING_LIMITED_TYPES.includes(g.type)) return '';
  if (g.type === 'summary-completion' && Array.isArray(g.wordBank)) return '';
  return reading.wordLimitLabel(g.wordLimit);
}

// 旧版前端只认 stem：给一份纯文本兜底，选择题把选项写进去，按文本作答也能判分
function fallbackStem(label, title, number, prompt, choices) {
  const p = prompt.split(BLANK).join('______');
  const opts = choices && choices.length
    ? `（可选：${choices.map((c) => (c.text ? `${c.key}. ${c.text}` : c.key)).join(' / ')}）`
    : '';
  return `【${label} · ${title}】第 ${number} 题：${p}${opts}`;
}

function readingQuestion(r) {
  const { passage, group: g, question: q, id } = r;
  const title = String(passage.title || '');
  const prompt = readingPrompt(g, q);
  const choices = readingChoices(r);
  return {
    id,
    kind: 'ielts-reading',
    type: 'fill',
    book: 0,
    lesson: 0,
    lessonTitle: `雅思阅读 · ${title}`,
    grammar: ['雅思阅读'],
    stem: fallbackStem('雅思阅读', title, q.number, prompt, choices),
    ielts: {
      source: 'reading',
      contentId: String(passage.id),
      title,
      titleCn: String(passage.titleCn || ''),
      groupType: g.type,
      number: q.number,
      instruction: typeof g.instruction === 'string' ? g.instruction : '',
      wordLimitLabel: readingWordLimitLabel(g),
      groupTitle: g.type === 'summary-completion' && isPlainObject(g.summary) ? String(g.summary.title || '') : '',
      heading: '',
      prompt,
      choices,
      choicesTitle: g.type === 'matching-headings' ? 'List of Headings' : '',
      paragraphs: readingContext(r),
      script: null,
      maxLength: READING_MAX_ANSWER_LEN,
    },
  };
}

function listeningChoices(r) {
  const { group: g, question: q } = r;
  if (g.type === 'mcq') return optionList(q.options);
  if (g.type === 'matching') return optionList(g.options);
  return null;
}

// 对应 segment 的脚本（section 已通过校验，segment 下标一定有效）
function listeningScript(r) {
  const { section: s, question: q } = r;
  const seg = s.segments[q.segment];
  const sp = s.speakers.find((x) => x.id === seg.speaker);
  return {
    index: q.segment,
    speaker: sp ? String(sp.name) : String(seg.speaker || ''),
    text: String(seg.text || ''),
  };
}

function listeningQuestion(r) {
  const { section: s, group: g, question: q, id } = r;
  const title = String(s.title || '');
  const prompt = String(q.prompt || '').replace(/_{3,}/g, BLANK);
  const choices = listeningChoices(r);
  return {
    id,
    kind: 'ielts-listening',
    type: 'fill',
    book: 0,
    lesson: 0,
    lessonTitle: `雅思听力 · ${title}`,
    grammar: ['雅思听力'],
    stem: fallbackStem('雅思听力', title, q.no, prompt, choices),
    ielts: {
      source: 'listening',
      contentId: String(s.id),
      title,
      titleCn: String(s.titleCn || ''),
      part: s.part,
      groupType: g.type,
      number: q.no,
      instruction: String(g.instruction || ''),
      wordLimitLabel: listening.COMPLETION_TYPES.includes(g.type) ? String(g.wordLimit || '') : '',
      groupTitle: String(g.title || ''),
      heading: String(q.heading || ''),
      prompt,
      choices,
      choicesTitle: g.type === 'matching' ? String(g.optionsTitle || '') : '',
      paragraphs: null,
      script: listeningScript(r),
      maxLength: listening.MAX_ANSWER_LEN,
    },
  };
}

/** 复习页用的题目（不含答案、解析、原文依据） */
function ieltsQuestion(r) {
  return r.source === 'reading' ? readingQuestion(r) : listeningQuestion(r);
}

// ---- 判分 ----

function optionTextOf(list, key) {
  const hit = optionList(list).find((o) => o.key.toUpperCase() === String(key || '').toUpperCase());
  return hit ? hit.text : '';
}

function gradeReading(r, response) {
  const { passage, group: g, question: q } = r;
  // q.id 已由 parseKey 限定为 q\d+，不会是 __proto__ 之类的键
  const out = reading.gradePassage(passage, { [q.id]: response });
  const res = out.results.find((x) => x.id === q.id);
  if (!res) return null;
  return {
    correct: res.correct,
    answer: res.answer,
    answerCn: '',
    explanation: res.explanation,
    ielts: {
      response: res.response,
      blank: res.blank,
      overLimit: res.overLimit,
      wordLimitLabel: readingWordLimitLabel(g),
      answerText: res.answerText || '',
      evidence: res.evidence ? { para: res.evidence.para, quote: res.evidence.quote } : null,
    },
  };
}

function gradeListening(r, response) {
  const { section, group: g, question: q } = r;
  const parsed = listening.parseAnswers(section, { [String(q.no)]: response });
  if (parsed.error) return { error: parsed.error };
  const out = listening.gradeSection(section, parsed.answers);
  const res = out.results.find((x) => x.no === q.no);
  if (!res) return null;
  const choices = listeningChoices(r);
  return {
    correct: res.correct,
    answer: res.answer,
    answerCn: '',
    explanation: typeof res.explanation === 'string' ? res.explanation : '',
    ielts: {
      response: res.yours,
      blank: !res.yours,
      overLimit: res.overLimit,
      wordLimitLabel: listening.COMPLETION_TYPES.includes(g.type) ? String(g.wordLimit || '') : '',
      answerText: choices && res.answer.length ? optionTextOf(choices, res.answer[0]) : '',
      evidence: typeof res.evidence === 'string' && res.evidence ? { para: '', quote: res.evidence } : null,
    },
  };
}

/**
 * 判一道雅思复习题。response 必须是字符串，长度上限与原模块交卷一致。
 * @returns {{ correct, answer, answerCn, explanation, ielts } | { error: string } | null}
 */
function gradeIelts(r, response) {
  const max = r.source === 'reading' ? READING_MAX_ANSWER_LEN : listening.MAX_ANSWER_LEN;
  if (typeof response !== 'string') return { error: 'response 必须是字符串' };
  if (response.length > max) return { error: `response 最长 ${max} 字符` };
  return r.source === 'reading' ? gradeReading(r, response) : gradeListening(r, response);
}

// ---- 交卷后错题入队 ----

/** 阅读交卷结果 → 需要复习的 key（答错的题；未作答的按 ENQUEUE_BLANK 决定） */
function readingWrongKeys(passageId, results) {
  return (Array.isArray(results) ? results : [])
    .filter((x) => isPlainObject(x) && !x.correct && (ENQUEUE_BLANK || !x.blank))
    .map((x) => readingKey(passageId, x.id));
}

/** 听力交卷结果 → 需要复习的 key */
function listeningWrongKeys(sectionId, results) {
  return (Array.isArray(results) ? results : [])
    .filter((x) => isPlainObject(x) && !x.correct && (ENQUEUE_BLANK || x.yours))
    .map((x) => listeningKey(sectionId, x.no));
}

/**
 * 把雅思题加入当前档案的复习队列（srs.json，条目结构与 routes/srs.js 的 addIds 相同）。
 * 无法解析的 key 跳过；已在队列里的不重复加入、不改动其进度。
 * srs.json 结构异常时抛错且不写文件，由调用方记日志。
 * @returns {{ added: number, total: number }}
 */
function enqueue(ids) {
  const file = profile.file('srs.json');
  const db = readJSON(file, { items: {} });
  if (!isPlainObject(db) || !isPlainObject(db.items)) {
    throw new Error('srs.json 结构异常（items 不是对象），未加入错题');
  }
  const now = Date.now();
  let added = 0;
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!resolve(id)) continue;
    if (Object.prototype.hasOwnProperty.call(db.items, id)) continue;
    db.items[id] = { step: 0, dueAt: now, reps: 0, lapses: 0, addedAt: now };
    added++;
  }
  if (added) writeJSONAtomic(file, db);
  return { added, total: Object.keys(db.items).length };
}

module.exports = {
  READING_PREFIX,
  LISTENING_PREFIX,
  ENQUEUE_BLANK,
  isIeltsKey,
  readingKey,
  listeningKey,
  parseKey,
  resolve,
  isGone,
  ieltsQuestion,
  gradeIelts,
  readingWrongKeys,
  listeningWrongKeys,
  enqueue,
};
