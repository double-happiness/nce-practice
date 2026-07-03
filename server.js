'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const data = require('./lib/data');
const profile = require('./lib/profile');
const progress = require('./lib/progress');
const { isCorrect } = require('./lib/grade');
const { snapshotDaily } = require('./lib/snapshot');
const { validate } = require('./scripts/validate');

const app = express();
const PORT = process.env.PORT || 3737;

// 默认 100kb 会拒收较大的备份导入（学习记录多了以后 nce-backup-*.json 很容易超）
app.use(express.json({ limit: '10mb' }));
// 把当前档案 id 下发给前端（cookie 可在脚本里同步读取），
// 供 public/js/profile-store.js 给 localStorage key 加档案前缀
app.use((req, res, next) => {
  res.setHeader('Set-Cookie', `nce_pid=${encodeURIComponent(profile.currentId())}; Path=/; SameSite=Lax`);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// 浏览器会自动请求 favicon，未提供时避免 404 噪音
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ---- 工具 ----
const stripAnswer = data.publicQuestion; // 去答案 + 打乱选项，防「永远选A」

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 元数据 ----
app.get('/api/meta', (req, res) => {
  const QUESTIONS = data.getQuestions();
  const META = data.getMeta();
  const stats = { total: QUESTIONS.length, byBook: {}, byType: {} };
  const grammarByBook = {};
  for (const q of QUESTIONS) {
    stats.byBook[q.book] = (stats.byBook[q.book] || 0) + 1;
    stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
    grammarByBook[q.book] = grammarByBook[q.book] || new Set();
    (q.grammar || []).forEach((g) => grammarByBook[q.book].add(g));
  }
  const grammarOut = {};
  Object.keys(grammarByBook).forEach((b) => {
    grammarOut[b] = Array.from(grammarByBook[b]).sort();
  });
  // 各册已收录的教材课数，供前端如实标注内容覆盖范围
  stats.lessonsByBook = {};
  for (const l of data.getLessons()) {
    stats.lessonsByBook[l.book] = (stats.lessonsByBook[l.book] || 0) + 1;
  }
  res.json({ books: META.books, units: META.units || {}, grammarByBook: grammarOut, stats });
});

// ---- 课程学习 ----
app.get('/api/lessons', (req, res) => {
  const { book } = req.query;
  let list = data.getLessons();
  if (book) list = list.filter((l) => String(l.book) === String(book));
  const out = list
    .map((l) => ({
      book: l.book,
      lesson: l.lesson,
      title: l.title,
      titleCn: l.titleCn,
      grammarTags: l.grammarTags || [],
      wordCount: (l.words || []).length,
    }))
    .sort((a, b) => a.lesson - b.lesson);
  res.json({ count: out.length, lessons: out });
});

app.get('/api/lesson/:book/:lesson', (req, res) => {
  const l = data
    .getLessons()
    .find((x) => String(x.book) === req.params.book && String(x.lesson) === req.params.lesson);
  if (!l) return res.status(404).json({ error: '该课程尚未收录' });
  res.json(l);
});

// ---- 出题 ----
app.get('/api/questions', (req, res) => {
  const { book, lessonMin, lessonMax, grammar, type } = req.query;
  let list = data.getQuestions().slice();
  if (book) list = list.filter((q) => String(q.book) === String(book));
  if (lessonMin) list = list.filter((q) => q.lesson >= Number(lessonMin));
  if (lessonMax) list = list.filter((q) => q.lesson <= Number(lessonMax));
  if (grammar) list = list.filter((q) => (q.grammar || []).includes(grammar));
  if (type) list = list.filter((q) => q.type === type);

  // countOnly=1：只要题量不要题目（出题设置页实时显示可用题数用，避免全量传输）
  if (req.query.countOnly === '1') return res.json({ count: list.length });

  if (req.query.random === '1' || req.query.random === 'true') list = shuffle(list);
  const limit = Number(req.query.limit) || list.length;
  list = list.slice(0, limit);
  res.json({ count: list.length, questions: list.map(stripAnswer) });
});

// ---- 判分 + 记录 ----
app.post('/api/grade', (req, res) => {
  const answers = (req.body && req.body.answers) || [];
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'answers 必须是数组' });

  const QMAP = data.getQMAP();
  const p = progress.load();
  const ts = Date.now();
  const results = [];
  let correctCount = 0;

  for (const item of answers) {
    const q = QMAP.get(item.id);
    if (!q) continue;
    const correct = isCorrect(q, item.response);
    if (correct) correctCount++;

    results.push({
      id: q.id,
      correct,
      response: item.response,
      answer: q.answer,
      explanation: q.explanation || '',
      stem: q.stem,
      lessonTitle: q.lessonTitle,
      book: q.book,
      lesson: q.lesson,
    });

    p.attempts.push({ id: q.id, correct, response: item.response, ts });
    const pq = p.perQuestion[q.id] || { seen: 0, correct: 0 };
    pq.seen++;
    if (correct) pq.correct++;
    p.perQuestion[q.id] = pq;
    if (correct) delete p.wrong[q.id];
    else p.wrong[q.id] = (p.wrong[q.id] || 0) + 1;
  }

  progress.save(p);
  res.json({
    total: results.length,
    correct: correctCount,
    accuracy: results.length ? Math.round((correctCount / results.length) * 100) : 0,
    results,
  });
});

app.get('/api/progress', (req, res) => {
  const p = progress.load();
  const total = p.attempts.length;
  const correct = p.attempts.filter((a) => a.correct).length;
  res.json({
    totalAttempts: total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    wrongCount: Object.keys(p.wrong).length,
    masteredCount: Object.values(p.perQuestion).filter((x) => x.correct > 0).length,
  });
});

app.get('/api/wrong', (req, res) => {
  const p = progress.load();
  const QMAP = data.getQMAP();
  const list = Object.keys(p.wrong).map((id) => QMAP.get(id)).filter(Boolean);
  res.json({ count: list.length, questions: list.map(stripAnswer) });
});

app.post('/api/progress/reset', (req, res) => {
  progress.save(JSON.parse(JSON.stringify(progress.DEFAULT)));
  res.json({ ok: true });
});

// ---- 自动挂载功能路由（routes/*.js），每个功能一个独立文件 ----
const routesDir = path.join(__dirname, 'routes');
if (fs.existsSync(routesDir)) {
  for (const f of fs.readdirSync(routesDir)) {
    if (!f.endsWith('.js')) continue;
    try {
      app.use('/api', require(path.join(routesDir, f)));
      console.log('挂载功能路由:', f);
    } catch (e) {
      console.error('路由加载失败:', f, '-', e.message);
    }
  }
}

// ---- API 兜底：未知接口返回 JSON 404；路由抛异常返回 JSON 500 ----
// （Express 默认返回 HTML 错误页，前端 api() 解析不了、只能显示笼统的状态码）
app.use('/api', (req, res) => res.status(404).json({ error: `接口不存在：${req.method} /api${req.path}` }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大（上限 10MB）' });
  }
  console.error('未捕获的路由错误:', err);
  res.status(500).json({ error: '服务器内部错误，详情见服务端日志' });
});

app.listen(PORT, () => {
  data.reload();
  // 学习数据每日滚动快照（保留 7 份），长期不重启的进程由定时器兜底
  const snap = snapshotDaily();
  if (snap) console.log('已创建学习数据每日快照:', path.relative(__dirname, snap));
  setInterval(snapshotDaily, 6 * 3600 * 1000).unref();
  const { errors, warnings } = validate();
  console.log(`新概念英语练习系统: http://localhost:${PORT}`);
  console.log(`题库 ${data.getQuestions().length} 题 · 课程 ${data.getLessons().length} 课`);
  if (warnings.length) console.log(`⚠️  数据警告 ${warnings.length} 条（运行 npm run validate 查看）`);
  if (errors.length) console.error(`❌ 数据错误 ${errors.length} 条（运行 npm run validate 查看）`);
});
