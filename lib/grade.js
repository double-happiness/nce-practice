'use strict';
// 判分逻辑统一出口：server.js / routes/srs.js / routes/exam.js 共用，
// 避免各处复制 isCorrect 导致判分标准不一致。

const { canonicalize } = require('./answer-equiv');
const { matchesDialogueResponse } = require('./answer-variant');

// 归一化用户输入与标准答案后再比对，避免以下情况被误判为错：
// - 手机键盘自动替换的弯引号/弯撇号（isn’t vs isn't）
// - 多敲的空格、全角空格
// - 句尾多写/少写的 . ? !（填空常见）
function normalizeAnswer(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’ʼ]/g, "'") // ‘ ’ ʼ → '
    .replace(/[“”]/g, '"') // “ ” → "
    .replace(/[　 ]/g, ' ') // 全角空格 / nbsp → 半角空格
    .trim()
    .replace(/[.?!。？！]+$/, '') // 句尾标点不参与判分
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// q.answer 可为字符串或「多个可接受答案」数组
function isCorrect(q, response) {
  return matchAnswers(response, q.answer, { equiv: false });
}

// answers 可为字符串或数组；equiv=true 时启用口语等价归一化（情景对话用）
function matchAnswers(response, answers, opts) {
  const equiv = !!(opts && opts.equiv);
  if (response == null) return false;
  const r = normalizeAnswer(response);
  if (!r) return false;
  const list = (Array.isArray(answers) ? answers : [answers]).filter(
    (s) => s != null && String(s).trim()
  );
  if (!list.length) return false;
  const normalizedResponse = equiv ? canonicalize(r) : r;
  return list.some((a) => {
    const normalizedAnswer = normalizeAnswer(a);
    if (!normalizedAnswer) return false;
    if (equiv) return matchesDialogueResponse(r, normalizedAnswer);
    return normalizedAnswer === normalizedResponse;
  });
}

module.exports = { normalizeAnswer, isCorrect, matchAnswers };
