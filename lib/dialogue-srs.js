'use strict';
// 情景对话错句间隔复习：SRS key 形如 dlg:场景id#轮次

const data = require('./data');
const { isDialogueTurnCorrect } = require('./dialogue-grade');
const { LEARNER_ROLE } = require('./dialogue-meta');

const PREFIX = 'dlg:';

function isDialogueKey(id) {
  return String(id || '').startsWith(PREFIX);
}

function dialogueKey(dialogueId, turn) {
  return `${PREFIX}${dialogueId}#${turn}`;
}

function parseDialogueKey(id) {
  const raw = String(id || '');
  if (!raw.startsWith(PREFIX)) return null;
  const m = /^dlg:(.+)#(\d+)$/.exec(raw);
  if (!m) return null;
  return { dialogueId: m[1], turn: Number(m[2]) };
}

function isLearnerTurn(turn) {
  return turn.role === LEARNER_ROLE;
}

function resolve(id) {
  const parsed = parseDialogueKey(id);
  if (!parsed) return null;
  const d = data.getDLGMAP().get(parsed.dialogueId);
  if (!d) return null;
  const t = d.turns[parsed.turn];
  if (!t || !isLearnerTurn(t)) return null;
  return { d, turn: parsed.turn, line: t, id };
}

function dialogueQuestion(r) {
  const { d, turn, line, id } = r;
  const answers = Array.isArray(line.en) ? line.en : [line.en];
  return {
    id,
    type: 'fill',
    book: 0,
    lesson: 0,
    lessonTitle: d.titleCn || d.title || '情景对话',
    grammar: ['口语表达'],
    stem: `【情景对话 · ${d.titleCn || d.title}】${line.role}：${line.cn}`,
  };
}

function gradeLine(line, response) {
  return isDialogueTurnCorrect(line, response);
}

module.exports = {
  isDialogueKey,
  dialogueKey,
  parseDialogueKey,
  resolve,
  dialogueQuestion,
  gradeLine,
};
