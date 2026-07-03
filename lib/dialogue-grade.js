'use strict';
// 情景对话判分：收集标准答案 + 可选 aliases，并启用口语等价归一化。

const { matchAnswers } = require('./grade');

function collectTurnAnswers(turn) {
  const primary = Array.isArray(turn.en) ? turn.en : [turn.en];
  const aliases = Array.isArray(turn.aliases) ? turn.aliases : [];
  return [...primary, ...aliases].filter((s) => s != null && String(s).trim());
}

function isDialogueTurnCorrect(turn, response) {
  return matchAnswers(response, collectTurnAnswers(turn), { equiv: true });
}

module.exports = { collectTurnAnswers, isDialogueTurnCorrect };
