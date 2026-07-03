'use strict';
// 判分逻辑统一出口：server.js / routes/srs.js / routes/exam.js 共用，
// 避免各处复制 isCorrect 导致判分标准不一致。

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
  if (response == null) return false;
  const r = normalizeAnswer(response);
  if (!r) return false;
  const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
  return answers.some((a) => normalizeAnswer(a) === r);
}

module.exports = { normalizeAnswer, isCorrect };
