'use strict';

// 理解训练 —— 从已有精读文章（lesson.article，en/cn 按行对齐）自动生成
// 听力理解 / 阅读理解选择题：出题时答案留在服务端内存，交卷统一判分。
const express = require('express');
const crypto = require('crypto');
const data = require('../lib/data');
const activity = require('../lib/activity');

const router = express.Router();

// ---- 进行中的测验（内存 Map，30 分钟过期防泄漏）----
const QUIZ_TTL_MS = 30 * 60 * 1000;
const MAX_QUIZZES = 200; // 兜底上限：超出时淘汰最早创建的
const quizzes = new Map(); // quizId -> { createdAt, expires, mode, answers: Map(qid -> {answer,en,cn,type}) }

function sweepQuizzes() {
  const now = Date.now();
  for (const [id, q] of quizzes) {
    if (q.expires <= now) quizzes.delete(id);
  }
  while (quizzes.size > MAX_QUIZZES) {
    // Map 迭代按插入序，最早的在前
    const oldest = quizzes.keys().next().value;
    quizzes.delete(oldest);
  }
}

// ---- 工具 ----
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN(arr, n) {
  return shuffle(arr).slice(0, n);
}

// 有精读文章的课程（可按册过滤）
function articleLessons(book) {
  return data
    .getLessons()
    .filter((l) => l.article && l.article.en && l.article.cn)
    .filter((l) => (book == null ? true : String(l.book) === String(book)));
}

// 一课的英中对齐句对（按行对齐，跳过空行）
function sentencePairs(lesson) {
  const en = lesson.article.en.split('\n');
  const cn = lesson.article.cn.split('\n');
  const out = [];
  const n = Math.min(en.length, cn.length);
  for (let i = 0; i < n; i++) {
    const e = en[i].trim();
    const c = cn[i].trim();
    if (e && c) out.push({ en: e, cn: c });
  }
  return out;
}

// 完形挖空：只挖实词。>3 字母的纯字母词，且不在功能词停用表里。
const STOP_WORDS = new Set([
  'this', 'that', 'these', 'those', 'there', 'here', 'what', 'when', 'where',
  'which', 'whose', 'your', 'yours', 'their', 'theirs', 'they', 'them', 'then',
  'than', 'with', 'from', 'very', 'much', 'some', 'have', 'does', 'will',
  'would', 'shall', 'should', 'could', 'must', 'been', 'being', 'about', 'into',
  'onto', 'over', 'also', 'just', 'well', 'please', 'thank', 'thanks', 'sorry',
  'hello', 'goodbye', 'okay',
]);

function clozeCandidates(sentence) {
  const tokens = sentence.match(/[A-Za-z]+/g) || [];
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    const w = t.toLowerCase();
    if (w.length <= 3 || STOP_WORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(t); // 保留原句大小写，选项展示更自然
  }
  return out;
}

// 完形干扰词池：本课单词表优先，不够再借同册其它课的单词
function wordPool(lesson, book) {
  const bad = new Set();
  const collect = (l, out) => {
    for (const w of Array.isArray(l.words) ? l.words : []) {
      const word = String(w && w.word ? w.word : '').trim().toLowerCase();
      if (/^[a-z]{4,}$/.test(word) && !STOP_WORDS.has(word) && !bad.has(word)) {
        bad.add(word);
        out.push(word);
      }
    }
  };
  const own = [];
  collect(lesson, own);
  if (own.length >= 12) return own;
  for (const l of articleLessons(book)) {
    if (l === lesson) continue;
    collect(l, own);
    if (own.length >= 40) break;
  }
  return own;
}

// 中文干扰项池：同册所有精读文章的中文句（去重）
function cnPool(book) {
  const set = new Set();
  for (const l of articleLessons(book)) {
    for (const p of sentencePairs(l)) set.add(p.cn);
  }
  return [...set];
}

// 中文四选一（听句选义 / 读句选义共用）：正确中文 + 同册其它句子的中文干扰
function buildCnOptions(correctCn, pool) {
  const distractors = pickN(pool.filter((c) => c !== correctCn), 3);
  return shuffle([correctCn, ...distractors]);
}

// GET /comprehension/meta —— 各册可用精读文章数量（前端册选择用）
router.get('/comprehension/meta', (req, res) => {
  const byBook = new Map();
  for (const l of articleLessons(null)) {
    byBook.set(l.book, (byBook.get(l.book) || 0) + 1);
  }
  const books = [...byBook.entries()]
    .map(([book, lessons]) => ({ book, lessons }))
    .sort((a, b) => a.book - b.book);
  res.json({ books });
});

// GET /comprehension/quiz?mode=listen|read&book=1&lesson=&count=5
// 从（指定或随机）一课的精读文章生成题目；答案不下发，存服务端等交卷判分。
router.get('/comprehension/quiz', (req, res) => {
  const mode = String(req.query.mode || '');
  if (mode !== 'listen' && mode !== 'read') {
    return res.status(400).json({ error: 'mode 非法，应为 listen 或 read' });
  }
  const book = req.query.book || null;
  const count = Math.min(20, Math.max(1, parseInt(req.query.count, 10) || 5));

  const pool = articleLessons(book);
  if (!pool.length) {
    return res.status(400).json({ error: '该册暂无精读文章，请先到「教材学习」查看其它册' });
  }

  let lesson;
  if (req.query.lesson) {
    lesson = pool.find((l) => String(l.lesson) === String(req.query.lesson));
    if (!lesson) {
      return res.status(400).json({ error: '该课暂无精读文章，可不指定课号随机抽取' });
    }
  } else {
    lesson = pool[Math.floor(Math.random() * pool.length)];
  }

  const pairs = sentencePairs(lesson);
  if (!pairs.length) {
    return res.status(400).json({ error: '该课文章内容为空，请换一课' });
  }

  const cnDistractorPool = cnPool(lesson.book);
  const clozeWordPool = mode === 'read' ? wordPool(lesson, lesson.book) : [];
  const picked = pickN(pairs, Math.min(count, pairs.length));

  const quizId = crypto.randomUUID();
  const answers = new Map();
  const questions = [];

  picked.forEach((pair, i) => {
    const qid = `q${i + 1}`;

    // read 模式奇偶交替出「完形选词」；不可挖空时退回「读句选义」
    if (mode === 'read' && i % 2 === 1) {
      const candidates = clozeCandidates(pair.en);
      const word = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
      const key = word ? word.toLowerCase() : '';
      const sentTokens = new Set((pair.en.match(/[A-Za-z]+/g) || []).map((t) => t.toLowerCase()));
      const distractors = word
        ? pickN(clozeWordPool.filter((w) => w !== key && !sentTokens.has(w)), 3)
        : [];
      if (word && distractors.length >= 3) {
        const blanked = pair.en.replace(new RegExp(`\\b${word}\\b`), '_____');
        questions.push({
          id: qid,
          type: 'cloze',
          en: blanked,
          options: shuffle([key, ...distractors]),
        });
        answers.set(qid, { answer: key, en: pair.en, cn: pair.cn, type: 'cloze' });
        return;
      }
      // 挖不出合适的词：落到下方读句选义
    }

    const options = buildCnOptions(pair.cn, cnDistractorPool);
    if (mode === 'listen') {
      // 听句选义：只给 speak 文本（前端播 TTS、不显示英文）
      questions.push({ id: qid, type: 'listen', speak: pair.en, options });
    } else {
      questions.push({ id: qid, type: 'read', en: pair.en, options });
    }
    answers.set(qid, { answer: pair.cn, en: pair.en, cn: pair.cn, type: mode === 'listen' ? 'listen' : 'read' });
  });

  sweepQuizzes();
  const now = Date.now();
  quizzes.set(quizId, { createdAt: now, expires: now + QUIZ_TTL_MS, mode, answers });

  res.json({
    quizId,
    mode,
    book: lesson.book,
    lesson: lesson.lesson,
    title: lesson.title || '',
    titleCn: lesson.titleCn || '',
    ttlMinutes: QUIZ_TTL_MS / 60000,
    count: questions.length,
    questions,
  });
});

// POST /comprehension/grade  body { quizId, answers: [{id, choice}] }
// 逐题判分：返回对错 + 正确答案 + 原句；每题计入学习活动（source: comprehension）。
router.post('/comprehension/grade', (req, res) => {
  sweepQuizzes();
  const body = req.body || {};
  const quiz = quizzes.get(body.quizId);
  if (!quiz) {
    return res.status(404).json({ error: '测验不存在或已过期（30 分钟），请重新开始一组' });
  }
  if (!Array.isArray(body.answers) || !body.answers.length) {
    return res.status(400).json({ error: 'answers 必须是非空数组' });
  }

  const results = [];
  let correctCount = 0;
  for (const item of body.answers) {
    const q = quiz.answers.get(item && item.id);
    if (!q) continue;
    const choice = String(item.choice == null ? '' : item.choice);
    const correct = choice === q.answer;
    if (correct) correctCount++;
    activity.record(correct, 'comprehension');
    results.push({
      id: item.id,
      type: q.type,
      correct,
      choice,
      answer: q.answer,
      en: q.en,
      cn: q.cn,
    });
  }
  quizzes.delete(body.quizId); // 一次性判分，判完即释放

  if (!results.length) {
    return res.status(400).json({ error: 'answers 中没有本测验的有效题目' });
  }
  const total = results.length;
  res.json({
    total,
    correct: correctCount,
    accuracy: Math.round((correctCount / total) * 100),
    mode: quiz.mode,
    results,
  });
});

module.exports = router;
