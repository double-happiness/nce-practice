'use strict';

// 薄弱语法统计 + 自动推荐练习（刷题 / 句型转换）
const data = require('./data');

function acc(correct, seen) {
  return seen > 0 ? Math.round((correct / seen) * 100) : null;
}

function sourceAcc(v) {
  return v.seen > 0 ? Math.round((v.correct / v.seen) * 100) : null;
}

// 合并刷题与句型转换的语法标签正确率
function buildGrammarStats(progress, transformDb) {
  const QMAP = data.getQMAP();
  const TRMAP = data.getTRMAP();
  const map = new Map();

  function bump(tag, seen, correct, source) {
    if (!tag || seen <= 0) return;
    const cur = map.get(tag) || {
      seen: 0,
      correct: 0,
      quiz: { seen: 0, correct: 0 },
      transform: { seen: 0, correct: 0 },
    };
    cur.seen += seen;
    cur.correct += correct;
    cur[source].seen += seen;
    cur[source].correct += correct;
    map.set(tag, cur);
  }

  for (const [id, pq] of Object.entries(progress.perQuestion || {})) {
    const q = QMAP.get(id);
    if (!q || !Array.isArray(q.grammar)) continue;
    const seen = Number(pq.seen) || 0;
    const correct = Number(pq.correct) || 0;
    if (seen <= 0) continue;
    for (const tag of q.grammar) bump(tag, seen, correct, 'quiz');
  }

  for (const a of transformDb.attempts || []) {
    const t = TRMAP.get(a && a.id);
    if (!t || !Array.isArray(t.grammar)) continue;
    const ok = a.correct ? 1 : 0;
    for (const tag of t.grammar) bump(tag, 1, ok, 'transform');
  }

  const list = [];
  for (const [tag, v] of map) {
    if (v.seen <= 0) continue;
    list.push({
      tag,
      seen: v.seen,
      correct: v.correct,
      wrong: v.seen - v.correct,
      accuracy: acc(v.correct, v.seen),
      quiz: { seen: v.quiz.seen, correct: v.quiz.correct, accuracy: sourceAcc(v.quiz) },
      transform: { seen: v.transform.seen, correct: v.transform.correct, accuracy: sourceAcc(v.transform) },
    });
  }
  list.sort((a, b) => a.accuracy - b.accuracy);
  return list;
}

function indexByTagBook(items, tagField) {
  const out = new Map(); // tag -> Map(book -> count)
  for (const item of items) {
    const book = item.book;
    for (const tag of item[tagField] || []) {
      if (!out.has(tag)) out.set(tag, new Map());
      const bm = out.get(tag);
      bm.set(book, (bm.get(book) || 0) + 1);
    }
  }
  return out;
}

function pickBookForTag(tag, quizIdx, tfIdx, preferredBook) {
  const qb = quizIdx.get(tag);
  const tb = tfIdx.get(tag);
  if (preferredBook != null) {
    const pb = Number(preferredBook);
    const qn = qb && qb.get(pb);
    const tn = tb && tb.get(pb);
    if (qn || tn) return pb;
  }
  const books = new Set();
  if (qb) qb.forEach((_, b) => books.add(Number(b)));
  if (tb) tb.forEach((_, b) => books.add(Number(b)));
  let best = null;
  let bestScore = -1;
  for (const b of books) {
    const score = (qb && qb.get(b) || 0) + (tb && tb.get(b) || 0);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function suggestPrimary(g, quizAvailable, transformAvailable) {
  if (!quizAvailable && transformAvailable) return 'transform';
  if (quizAvailable && !transformAvailable) return 'quiz';
  if (!quizAvailable && !transformAvailable) return null;
  const qAcc = g.quiz.accuracy;
  const tAcc = g.transform.accuracy;
  if (g.transform.seen >= 3 && g.quiz.seen >= 3) {
    if (tAcc != null && qAcc != null && tAcc < qAcc) return 'transform';
    if (qAcc != null && tAcc != null && qAcc < tAcc) return 'quiz';
  }
  if (g.transform.seen >= 3 && (g.quiz.seen < 3 || tAcc != null && qAcc != null && tAcc <= qAcc)) {
    return 'transform';
  }
  return 'quiz';
}

function buildRecommendations(grammarList, opts = {}) {
  const minSeen = opts.minSeen ?? 4;
  const maxAccuracy = opts.maxAccuracy ?? 85;
  const limit = opts.limit ?? 5;
  const preferredBook = opts.preferredBook;

  const questions = data.getQuestions();
  const transforms = data.getTransforms();
  const quizIdx = indexByTagBook(questions, 'grammar');
  const tfIdx = indexByTagBook(transforms, 'grammar');

  const weak = grammarList.filter((g) => g.seen >= minSeen && g.accuracy < maxAccuracy);

  return weak.slice(0, limit).map((g) => {
    const book = pickBookForTag(g.tag, quizIdx, tfIdx, preferredBook);
    const quizAvailable = book != null ? (quizIdx.get(g.tag) && quizIdx.get(g.tag).get(book)) || 0 : 0;
    const transformAvailable = book != null ? (tfIdx.get(g.tag) && tfIdx.get(g.tag).get(book)) || 0 : 0;
    const primary = suggestPrimary(g, quizAvailable, transformAvailable);
    let reason = '';
    if (primary === 'transform' && g.transform.seen >= 3) {
      reason = `句型转换正确率 ${g.transform.accuracy}%`;
    } else if (primary === 'quiz') {
      reason = g.quiz.seen >= 3 ? `刷题正确率 ${g.quiz.accuracy}%` : '建议先刷题巩固';
    }
    return {
      tag: g.tag,
      accuracy: g.accuracy,
      seen: g.seen,
      wrong: g.wrong,
      quiz: g.quiz,
      transform: g.transform,
      book,
      quizAvailable,
      transformAvailable,
      primary,
      reason,
    };
  }).filter((r) => r.quizAvailable || r.transformAvailable);
}

module.exports = {
  buildGrammarStats,
  buildRecommendations,
};
