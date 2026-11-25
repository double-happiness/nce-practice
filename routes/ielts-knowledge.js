'use strict';

// 雅思基础知识库 API —— 自动挂载到 /api（契约见 docs/design/ielts-knowledge-20261125.md §3）
// 文章目录 / 完整文章 / 学习进度（已读、小测成绩）；进度存 ielts.json 的 knowledge 对象。
// 小测在前端本地判分（单人自学），这里只校验并记录分数。
const express = require('express');
const ielts = require('../lib/ielts');
const knowledge = require('../lib/ielts-knowledge');
const activity = require('../lib/activity');

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 建路由。deps 可注入替身（测试用，避免读写真实档案）：
 *   loadUser() / saveUser(u)       默认 lib/ielts.js
 *   recordActivity(correct, src)   默认 lib/activity.js 的 record
 *   getContent()                   默认 lib/ielts-knowledge.js 的 getContent
 *   now()                          默认 Date.now
 */
function createRouter(deps) {
  const d = deps || {};
  const loadUser = d.loadUser || ielts.loadUser;
  const saveUser = d.saveUser || ielts.saveUser;
  const recordActivity = d.recordActivity || activity.record;
  const getContent = d.getContent || knowledge.getContent;
  const now = d.now || Date.now;
  const log = d.logger || console;

  const router = express.Router();

  function bad(res, error) {
    return res.status(400).json({ error });
  }

  // 首次用到内容时跑一遍校验，有问题打日志提醒（正式接入 validate.js 前的兜底）
  let contentChecked = false;
  function checkContentOnce() {
    if (contentChecked) return;
    contentChecked = true;
    const c = getContent();
    const { errors, warnings } = knowledge.validateKnowledgeContent(c.items);
    const all = c.issues.map((m) => `ielts/${m}`).concat(errors);
    if (all.length) log.error(`[ielts-knowledge] 知识库内容有 ${all.length} 个错误：\n  ${all.slice(0, 20).join('\n  ')}`);
    if (warnings.length) log.warn(`[ielts-knowledge] 知识库内容有 ${warnings.length} 条警告`);
  }

  function articleList() {
    checkContentOnce();
    return [...getContent().byId.values()].sort(knowledge.compareArticles);
  }

  // :id 校验：格式非法 400，不存在 404；成功返回文章对象
  function findArticle(req, res) {
    const id = req.params.id;
    if (!knowledge.isValidId(id)) {
      bad(res, `id 非法（只能含小写字母、数字和 -，最长 ${knowledge.MAX_ID_LEN} 位）`);
      return null;
    }
    checkContentOnce();
    const a = getContent().byId.get(id);
    if (!a) {
      res.status(404).json({ error: `知识文章不存在：${id}` });
      return null;
    }
    return a;
  }

  // 读用户进度：knowledge 字段由本模块自行校验，坏数据过滤掉
  function loadProgress() {
    const user = loadUser();
    return { user, progress: knowledge.sanitizeKnowledgeProgress(user.knowledge) };
  }

  // 小测成绩落盘后再记学习活动；活动日志写失败只打日志，不影响本次提交结果
  function logActivity(correct) {
    try {
      recordActivity(correct, 'ielts-knowledge');
    } catch (e) {
      log.error(`[ielts-knowledge] 学习活动记录失败: ${e.message}`);
    }
  }

  // GET /ielts/knowledge —— 文章目录（不含 sections / exercises），按 domain、track、order 排序，每篇带本人进度
  router.get('/ielts/knowledge', (req, res) => {
    const { progress } = loadProgress();
    const items = articleList().map((a) => ({
      ...knowledge.articleSummary(a),
      progress: knowledge.progressOf(progress, a.id),
    }));
    res.json({
      total: items.length,
      items,
      domains: knowledge.DOMAINS,
      tracks: knowledge.TRACKS,
      passRatio: knowledge.PASS_RATIO,
    });
  });

  // GET /ielts/knowledge/:id —— 完整文章（含小测答案，前端本地判分）与本人进度
  router.get('/ielts/knowledge/:id', (req, res) => {
    const a = findArticle(req, res);
    if (!a) return;
    const { progress } = loadProgress();
    res.json({ ...knowledge.publicArticle(a), progress: knowledge.progressOf(progress, a.id) });
  });

  // POST /ielts/knowledge/:id/progress  body { read: true } 或 { score, total }
  router.post('/ielts/knowledge/:id/progress', (req, res) => {
    const a = findArticle(req, res);
    if (!a) return;
    const parsed = knowledge.parseProgressBody(req.body, a);
    if (parsed.error) return bad(res, parsed.error);

    // loadUser 保留未知顶层字段；knowledge 由本模块清洗后整体写回
    const { user, progress } = loadProgress();
    const entry = knowledge.applyProgress(knowledge.progressOf(progress, a.id), parsed, now());
    progress[a.id] = entry;
    user.knowledge = progress;
    saveUser(user);
    if (parsed.kind === 'quiz') logActivity(parsed.score / parsed.total >= knowledge.PASS_RATIO);

    res.json({ ok: true, id: a.id, progress: entry });
  });

  return router;
}

const router = createRouter();
router.createRouter = createRouter; // 供 scripts/test-ielts-knowledge.js 注入替身
module.exports = router;
