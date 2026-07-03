'use strict';
// 成就徽章体系（后端）—— 全部从当前档案既有数据只读计算，不新增任何写入。
// 活动汇总口径与 routes/plan.js 的 collectAllAttempts 保持一致（独立实现，不跨路由 require）。
const express = require('express');
const profile = require('../lib/profile');
const { readJSON } = require('../lib/store');

const router = express.Router();

const DAY = 86400000;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 汇总所有练习活动：刷题(progress) + 句型转换(transforms) + 单词/听写/对话等(activity) */
function collectAllAttempts(quizAttempts) {
  const out = [];
  for (const a of quizAttempts) {
    if (a && typeof a.ts === 'number') out.push({ ts: a.ts, correct: !!a.correct });
  }
  const tr = readJSON(profile.file('transforms.json'), {}) || {};
  for (const a of Array.isArray(tr.attempts) ? tr.attempts : []) {
    if (a && typeof a.ts === 'number') out.push({ ts: a.ts, correct: !!a.correct });
  }
  const act = readJSON(profile.file('activity.json'), {}) || {};
  for (const a of Array.isArray(act.log) ? act.log : []) {
    if (a && typeof a.ts === 'number') out.push({ ts: a.ts, correct: !!a.correct });
  }
  return out;
}

/** 按自然日聚合 -> Map<当日零点ts, {count, correct}> */
function groupByDay(attempts) {
  const map = new Map();
  for (const a of attempts) {
    const day = startOfDay(a.ts);
    const e = map.get(day) || { count: 0, correct: 0 };
    e.count++;
    if (a.correct) e.correct++;
    map.set(day, e);
  }
  return map;
}

/** 历史最长连续打卡天数（徽章一旦达成不应回退，故取历史最大值而非当前 streak） */
function maxStreak(byDay) {
  const days = [...byDay.keys()].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    const diff = i > 0 ? days[i] - days[i - 1] : 0;
    // 相邻自然日间隔约为 1 天（放宽以兼容夏令时 23/25 小时的日子）
    run = i > 0 && diff > 0 && diff < DAY * 1.5 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

// GET /badges —— 返回 { badges: [{key,icon,label,desc,earned,earnedHint,progress:{cur,target}}] }
router.get('/badges', (req, res) => {
  try {
    // ---- 各数据源（全部带默认值，文件缺失不报错）----
    const prog = readJSON(profile.file('progress.json'), {}) || {};
    const quizAttempts = Array.isArray(prog.attempts) ? prog.attempts : [];
    const wrongCount = prog.wrong && typeof prog.wrong === 'object' ? Object.keys(prog.wrong).length : 0;

    const attempts = collectAllAttempts(quizAttempts);
    const byDay = groupByDay(attempts);
    const streakBest = maxStreak(byDay);

    const ui = readJSON(profile.file('ui.json'), {}) || {};
    const checkin = ui['nce-checkin-lessons'];
    const lessonCount =
      checkin && typeof checkin === 'object' && !Array.isArray(checkin) ? Object.keys(checkin).length : 0;

    const wordsDb = readJSON(profile.file('words.json'), {}) || {};
    const states = wordsDb.states && typeof wordsDb.states === 'object' ? wordsDb.states : {};
    let knownWords = 0; // 标记过「认识」且未被重置的词（level >= 1，认识一次即升 1 级）
    for (const k of Object.keys(states)) {
      const s = states[k];
      if (s && typeof s.level === 'number' && s.level >= 1) knownWords++;
    }

    const dlg = readJSON(profile.file('dialogues.json'), {}) || {};
    const dlgDone = dlg.completed && typeof dlg.completed === 'object' ? Object.keys(dlg.completed).length : 0;

    // 神射手：任意一天答题 ≥20 且当日正确率 ≥90%；进度取正确率达标日子里的最高题量
    let sharpBest = 0;
    for (const e of byDay.values()) {
      if (e.count && e.correct / e.count >= 0.9 && e.count > sharpBest) sharpBest = e.count;
    }

    // ---- 组装徽章 ----
    const badges = [];
    const add = (key, icon, label, desc, cur, target, unearnedHint) => {
      const earned = cur >= target;
      badges.push({
        key,
        icon,
        label,
        desc,
        earned,
        earnedHint: earned ? '已达成' : unearnedHint || `还差 ${target - cur}`,
        progress: { cur, target },
      });
    };

    add('streak3', '🔥', '坚持 · 3 天', '连续打卡 3 天（任意练习即算打卡）', streakBest, 3);
    add('streak7', '🔥', '坚持 · 7 天', '连续打卡 7 天（任意练习即算打卡）', streakBest, 7);
    add('streak30', '🔥', '坚持 · 30 天', '连续打卡 30 天（任意练习即算打卡）', streakBest, 30);

    add('quiz100', '✏️', '刷题 · 100', '累计答题 100 道（刷题/测验）', quizAttempts.length, 100);
    add('quiz500', '✏️', '刷题 · 500', '累计答题 500 道（刷题/测验）', quizAttempts.length, 500);
    add('quiz1000', '✏️', '刷题 · 1000', '累计答题 1000 道（刷题/测验）', quizAttempts.length, 1000);

    add('sharpshooter', '🎯', '神射手', '单日答题 ≥20 且当日正确率 ≥90%（任意一天达成即得）', sharpBest, 20, '正确率 ≥90% 的当日最高题量');

    add('reader10', '📖', '读书人 · 10 课', '教材学习打卡 10 课', lessonCount, 10);
    add('reader36', '📖', '读书人 · 36 课', '教材学习打卡 36 课', lessonCount, 36);
    add('reader72', '📖', '读书人 · 72 课', '教材学习打卡 72 课（NCE1 全册）', lessonCount, 72);

    add('vocab100', '🔤', '词汇家 · 100', '背单词标记「认识」累计 100 个', knownWords, 100);
    add('vocab500', '🔤', '词汇家 · 500', '背单词标记「认识」累计 500 个', knownWords, 500);

    add('social10', '💬', '社交家 · 10', '完成 10 组情景对话', dlgDone, 10);
    add('social50', '💬', '社交家 · 50', '完成 50 组情景对话', dlgDone, 50);

    // 清道夫：错题本清零且累计答题 >50（避免「没刷过题所以没错题」也算达成）
    const cleanerEarned = wrongCount === 0 && quizAttempts.length > 50;
    badges.push({
      key: 'cleaner',
      icon: '🧹',
      label: '清道夫',
      desc: '错题本清零（需累计答题超过 50 道）',
      earned: cleanerEarned,
      earnedHint: cleanerEarned
        ? '已达成'
        : quizAttempts.length <= 50
          ? `先累计答题 ${51 - quizAttempts.length} 道`
          : `还有 ${wrongCount} 道错题待清`,
      progress: { cur: cleanerEarned ? 1 : 0, target: 1 },
    });

    res.json({ badges });
  } catch (e) {
    res.status(500).json({ error: '徽章计算失败：' + e.message });
  }
});

module.exports = router;
