'use strict';

// 句型转换共用工具：判分归一化 + SRS 复习用的「步骤伪题」构造。
// 转换步骤进入 SRS 队列时的 key 形如 tf-b1-001#2（练习 id + '#' + 步骤下标）。

const KIND_LABEL = {
  translate: '中译英',
  yesno: '一般疑问句',
  negative: '否定句',
  wh: '特殊疑问句',
  indirect: '间接引语',
  passive: '被动语态',
};
const KINDS = Object.keys(KIND_LABEL);

// 判分归一化：大小写/标点/多余空格不敏感；n't 缩写与 not 全形等价
//（其余缩写变体如 What's / She's 由题目数据显式给出，避免 's＝is/has 歧义误判）
function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'") // 弯引号 → 直引号
    .replace(/\bcan't\b/g, 'can not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bshan't\b/g, 'shall not')
    .replace(/\bcannot\b/g, 'can not')
    .replace(/n't\b/g, ' not')
    .replace(/[^a-z0-9'\s]/g, ' ') // 去掉撇号以外的标点
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrectStep(step, response) {
  if (response == null || String(response).trim() === '') return false;
  const r = normalize(response);
  return step.answers.some((a) => normalize(a) === r);
}

// 解析 SRS key（tf-xxx#n）；不是转换步骤 key 或练习/步骤不存在时返回 null
function resolveStep(trmap, key) {
  const m = /^(.+)#(\d+)$/.exec(String(key || ''));
  if (!m) return null;
  const t = trmap.get(m[1]);
  const idx = Number(m[2]);
  if (!t || !Array.isArray(t.steps) || idx >= t.steps.length) return null;
  return { t, idx, step: t.steps[idx] };
}

// 构造复习界面用的伪题（自由输入型，不含答案）。
// 复习时脱离转换链上下文，所以 stem 必须自含：非首步带上标准原句。
function stepQuestion(t, idx, key) {
  const step = t.steps[idx];
  const label = KIND_LABEL[step.kind] || step.kind;
  const stem =
    step.kind === 'translate'
      ? `【句型转换 · ${label}】${step.prompt}：${t.cn}`
      : `【句型转换 · ${label}】原句：${t.steps[0].answers[0]} —— ${step.prompt}`;
  return {
    id: key,
    type: 'transform',
    book: t.book,
    lesson: t.lesson,
    lessonTitle: '句型转换',
    grammar: t.grammar || [],
    stem,
  };
}

module.exports = { KINDS, KIND_LABEL, normalize, isCorrectStep, resolveStep, stepQuestion };
