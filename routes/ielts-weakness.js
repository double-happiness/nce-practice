'use strict';

// 雅思弱项统计 API —— 自动挂载到 /api（设计见 docs/design/ielts-weakness-20261126.md §4）
// 只读：按当前题库重判 ielts.json 里的 listenings / readings，统计各题型正确率与听力错误原因，不改存储结构。
const express = require('express');
const ielts = require('../lib/ielts');
const weakness = require('../lib/ielts-weakness');

const router = express.Router();

// 查询参数 days：缺省（或空串）为 60；否则必须是 7–365 的整数，数组形式 ?days=1&days=2 视为非法。返回 NaN 表示非法
function parseDays(raw) {
  if (raw == null || raw === '') return weakness.DEFAULT_DAYS;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return NaN;
  const n = Number(raw);
  return weakness.isValidDays(n) ? n : NaN;
}

// GET /ielts/weakness?days=60 —— { days, from, to, listening, reading, weakest }
router.get('/ielts/weakness', (req, res) => {
  const days = parseDays(req.query.days);
  if (Number.isNaN(days)) {
    return res.status(400).json({ error: `days 必须是 ${weakness.MIN_DAYS}–${weakness.MAX_DAYS} 的整数` });
  }
  const user = ielts.loadUser();
  res.json(weakness.analyzeWeakness(user, { days, today: ielts.todayKey() }));
});

module.exports = router;
