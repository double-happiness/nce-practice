'use strict';
// 雅思 26 周计划引擎：周映射（D6）、当前周与阶段、今日任务完成数、external 手动打勾、
// 检查点判定与建议（§5）、band 取整（D5）。
// 计算部分尽量写成纯函数（显式传入 today / plan / 用户数据），IO 只在 load* 函数里，便于 scripts/test-ielts.js 测试。
//
// 任务字段约定（data/ielts/plan.json）：
// - kind: internal 按活动来源自动统计；external 只能手动打勾（manualDone[日期] 里记 taskKey）
// - per:  缺省为 'day'，target 是每天的量；'week' 表示 target 是本实际周（从开始日起每 7 天）的累计量
// - minutes: 该任务在一个周期（天或周）内的预计用时；日均用时 = 按天任务 minutes + 按周任务 minutes / 7

const ielts = require('./ielts');
const progress = require('./progress');
const activity = require('./activity');
const profile = require('./profile');
const { readJSON } = require('./store');

const { dayNumber, addDays } = ielts;

const MIN_WEEKS = 4;
const MAX_WEEKS = 52;
const DEFAULT_TEMPLATE_WEEKS = 26;
const CEFR_LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const HOURS_PER_CEFR_LEVEL = 200; // A2→C1 跨三档约 600 小时（设计文档 §1）

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// ---- band 取整（D5）----

// 自评四维平均后向下取整到 0.5（自评偏乐观，向下更保守）；epsilon 防浮点误差把 6.5 算成 6.4999
function floorHalf(x) {
  return Math.floor(x * 2 + 1e-9) / 2;
}

// 官方总分规则：四舍五入到 0.5，.25 进为 .5，.75 进为整数
function officialRound(x) {
  return Math.floor(x * 2 + 0.5 + 1e-9) / 2;
}

function bandFromScores(scores) {
  const vals = Object.values(scores);
  if (!vals.length) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return floorHalf(mean);
}

// ---- 周映射（D6）----

// 实际周数 = ceil((考试日 − 开始日) / 7)，夹在 [4, 52]
function totalWeeksFor(startDate, examDate) {
  const days = dayNumber(examDate) - dayNumber(startDate);
  return clamp(Math.ceil(days / 7), MIN_WEEKS, MAX_WEEKS);
}

// 第 i 实际周 → 模板第 round((i−1)×26/实际周数)+1 周。
// 实际周数较大时公式可能超出 26（如 52 周时第 52 周算出 27），因此夹到 [1, 模板周数]
function templateWeekFor(actualWeek, totalWeeks, templateWeeks) {
  const tw = templateWeeks || DEFAULT_TEMPLATE_WEEKS;
  return clamp(Math.round(((actualWeek - 1) * tw) / totalWeeks) + 1, 1, tw);
}

// 某日期落在第几实际周（开始日所在为第 1 周，每 7 天一周），夹在 [1, totalWeeks]
function actualWeekFor(date, startDate, totalWeeks) {
  const diff = dayNumber(date) - dayNumber(startDate);
  return clamp(Math.floor(diff / 7) + 1, 1, totalWeeks);
}

function weekDateRange(startDate, actualWeek) {
  return { from: addDays(startDate, (actualWeek - 1) * 7), to: addDays(startDate, actualWeek * 7 - 1) };
}

// 模板周 t 对应的第一个实际周（映射单调不减，取第一个映射到 ≥ t 的实际周）
function firstActualWeekOfTemplate(templateWeek, totalWeeks, templateWeeks) {
  for (let i = 1; i <= totalWeeks; i++) {
    if (templateWeekFor(i, totalWeeks, templateWeeks) >= templateWeek) return i;
  }
  return totalWeeks;
}

function phaseOfTemplateWeek(plan, templateWeek) {
  const phases = (plan && plan.phases) || [];
  return phases.find((p) => Array.isArray(p.weeks) && templateWeek >= p.weeks[0] && templateWeek <= p.weeks[1]) || null;
}

function templateWeekData(plan, templateWeek) {
  return ((plan && plan.weeks) || []).find((w) => w.week === templateWeek) || null;
}

// 未开启时按「今天开始」预览时间线
function effectiveStartDate(prof, today) {
  return prof.active && prof.startDate ? prof.startDate : today;
}

/** GET /ielts/profile 的 derived：倒计时、总周数、当前周、模板周、阶段 */
function deriveTimeline(prof, today, plan) {
  const templateWeeks = (plan && plan.templateWeeks) || DEFAULT_TEMPLATE_WEEKS;
  const startDate = effectiveStartDate(prof, today);
  const totalWeeks = totalWeeksFor(startDate, prof.examDate);
  const currentWeek = actualWeekFor(today, startDate, totalWeeks);
  const templateWeek = templateWeekFor(currentWeek, totalWeeks, templateWeeks);
  return {
    daysLeft: Math.max(0, dayNumber(prof.examDate) - dayNumber(today)),
    totalWeeks,
    currentWeek,
    templateWeek,
    phase: phaseOfTemplateWeek(plan, templateWeek),
    startDate,
    templateWeeks,
  };
}

// ---- 今日任务完成数 ----

/**
 * 读取当前档案的练习记录，按「日期 → 来源 → 次数」汇总：
 * progress.json 的 attempts 计为 quiz，transforms.json 的 attempts 计为 transform，activity 日志按其 source。
 * 口径与 routes/plan.js 的 collectAllAttempts 一致，但不复用其函数（该文件只追加不改动）。
 */
function loadDailyCounts() {
  const counts = new Map();
  const add = (ts, source) => {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return;
    const d = ielts.dateKey(ts);
    let m = counts.get(d);
    if (!m) counts.set(d, (m = {}));
    m[source] = (m[source] || 0) + 1;
  };
  const p = progress.load();
  for (const a of Array.isArray(p.attempts) ? p.attempts : []) if (a) add(a.ts, 'quiz');
  const tf = readJSON(profile.file('transforms.json'), null);
  for (const a of tf && Array.isArray(tf.attempts) ? tf.attempts : []) if (a) add(a.ts, 'transform');
  for (const a of activity.load().log) if (a) add(a.ts, a.source || 'other');
  return counts;
}

function datesBetween(from, to) {
  const out = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n++) out.push(addDays(from, n - dayNumber(from)));
  return out;
}

/** 单个任务的完成情况：按天任务只看今天，按周任务累计本实际周开始日到今天 */
function taskStatus(task, ctx) {
  const { counts, manualDone, today, weekFrom, weekTo } = ctx;
  const isWeekly = task.per === 'week';
  const last = dayNumber(today) < dayNumber(weekTo) ? today : weekTo;
  const days = isWeekly ? (dayNumber(weekFrom) <= dayNumber(last) ? datesBetween(weekFrom, last) : []) : [today];
  const target = Number.isFinite(task.target) && task.target > 0 ? task.target : 1;
  let done = 0;
  if (task.kind === 'external') {
    done = days.filter((d) => (manualDone[d] || []).includes(task.key)).length;
  } else {
    const sources = Array.isArray(task.source) ? task.source : [];
    for (const d of days) {
      const m = counts.get(d);
      if (!m) continue;
      for (const s of sources) done += m[s] || 0;
    }
  }
  const out = { ...task, per: isWeekly ? 'week' : 'day', target, done, met: done >= target };
  if (task.kind === 'external') out.checkedToday = (manualDone[today] || []).includes(task.key);
  return out;
}

function minutesPerDay(tasks) {
  const total = (tasks || []).reduce((s, t) => {
    const m = Number(t.minutes) || 0;
    return s + (t.per === 'week' ? m / 7 : m);
  }, 0);
  return Math.round(total);
}

// ---- 检查点（§5）----

function lastNAvg(records, n) {
  const list = records
    .filter((r) => typeof r.band === 'number' && Number.isFinite(r.band))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-n);
  if (!list.length) return { avg: null, count: 0 };
  const avg = list.reduce((s, r) => s + r.band, 0) / list.length;
  return { avg: Math.round(avg * 100) / 100, count: list.length };
}

function latestVocabCheck(vocabChecks) {
  let best = null;
  for (const v of vocabChecks) if (v && (!best || (v.ts || 0) >= (best.ts || 0))) best = v;
  return best;
}

/** 检查点与总览共用的成绩指标：写作 / 口语近 3 次均值、最近一次词汇诊断 */
function computeMetrics(user) {
  return {
    writing: lastNAvg(user.writings || [], 3),
    speaking: lastNAvg(user.speakings || [], 3),
    vocab: latestVocabCheck(user.vocabChecks || []),
  };
}

// 差距折算成推迟周数：写作 / 口语按 band 差，词汇覆盖率每 10 个百分点约折 0.5 band
function postponeWeeksForGap(gap) {
  if (gap <= 0.5) return 4;
  if (gap <= 1) return 6;
  return 8;
}

function fmtBand(x) {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/**
 * 判定一个检查点。ctx: { currentWeek, examDate, targetOverall, level }
 * status：未到对应实际周为 future；已到但缺数据为 due；数据齐全时全部达标 passed，否则 failed
 */
function evaluateCheckpoint(cp, actualWeek, metrics, ctx) {
  const c = cp.criteria || {};
  const base = { week: actualWeek, templateWeek: cp.week, name: cp.name, criteria: c };
  if (ctx.currentWeek < actualWeek) {
    return {
      ...base,
      status: 'future',
      detail: `第 ${actualWeek} 周到达后判定：词汇 ${c.vocabBand} 段覆盖率 ≥ ${c.vocabCoverageMin}%，写作 ≥ ${fmtBand(c.writingMin)}，口语 ≥ ${fmtBand(c.speakingMin)}`,
      metrics: null,
      suggestions: [],
    };
  }

  const vocabCov = metrics.vocab && metrics.vocab.byBand && metrics.vocab.byBand[c.vocabBand]
    ? metrics.vocab.byBand[c.vocabBand].coverage
    : null;
  const items = [
    { name: '词汇', value: typeof vocabCov === 'number' ? vocabCov : null, min: c.vocabCoverageMin,
      text: (v) => `词汇 ${c.vocabBand} 段覆盖率 ${v}%（需 ≥ ${c.vocabCoverageMin}%）`,
      missing: `词汇：还没有做过雅思词汇诊断（需 ${c.vocabBand} 段覆盖率 ≥ ${c.vocabCoverageMin}%）`,
      todo: '做 1 次雅思词汇诊断（雅思备考 → 词汇）', gapUnit: 20 },
    { name: '写作', value: metrics.writing.avg, min: c.writingMin,
      text: (v) => `写作近 ${metrics.writing.count} 次自评均分 ${fmtBand(v)}（需 ≥ ${fmtBand(c.writingMin)}）`,
      missing: `写作：还没有自评记录（需 ≥ ${fmtBand(c.writingMin)}）`,
      todo: '提交至少 1 篇写作并完成四维自评', gapUnit: 1 },
    { name: '口语', value: metrics.speaking.avg, min: c.speakingMin,
      text: (v) => `口语近 ${metrics.speaking.count} 次自评均分 ${fmtBand(v)}（需 ≥ ${fmtBand(c.speakingMin)}）`,
      missing: `口语：还没有自评记录（需 ≥ ${fmtBand(c.speakingMin)}）`,
      todo: '完成至少 1 次口语练习并完成四维自评', gapUnit: 1 },
  ];
  const resultMetrics = {
    vocabCoverage: items[0].value,
    writingAvg: items[1].value,
    writingCount: metrics.writing.count,
    speakingAvg: items[2].value,
    speakingCount: metrics.speaking.count,
  };

  const missing = items.filter((it) => it.value == null);
  if (missing.length) {
    const detail = items.map((it) => (it.value == null ? it.missing : `${it.text(it.value)}${it.value >= it.min ? '，达标' : '，未达标'}`)).join('；');
    return { ...base, status: 'due', detail, metrics: resultMetrics, suggestions: missing.map((it) => it.todo) };
  }

  const failedItems = items.filter((it) => it.value < it.min);
  const detail = items.map((it) => `${it.text(it.value)}${it.value >= it.min ? '，达标' : '，未达标'}`).join('；');
  if (!failedItems.length) return { ...base, status: 'passed', detail, metrics: resultMetrics, suggestions: [] };

  // 未达标时给出三类建议，只做提示，不自动修改任何设置
  const weak = failedItems.map((it) => it.name).join('、');
  const gap = Math.max(...failedItems.map((it) => (it.min - it.value) / it.gapUnit));
  const weeks = postponeWeeksForGap(gap);
  const newDate = addDays(ctx.examDate, weeks * 7);
  const suggestions = [
    ctx.level === 'ielts'
      ? `学习计划已是「雅思」预设：在未达标的${weak}上每天再加量 30 分钟`
      : `把「学习计划」的水平预设切到「雅思」（或「冲刺」），并在未达标的${weak}上每天加量 30 分钟`,
    `按当前差距，把考试日推迟 ${weeks} 周到 ${newDate}（在雅思备考设置里修改，计划会自动拉伸）`,
  ];
  if (ctx.targetOverall > 6.5) suggestions.push(`把目标分暂调到 6.5，下一个检查点达标后再调回 ${fmtBand(ctx.targetOverall)}`);
  return { ...base, status: 'failed', detail, metrics: resultMetrics, suggestions, postpone: { weeks, examDate: newDate } };
}

// ---- 时间线说明 ----

function cefrOfBand(band) {
  if (band >= 7) return 'C1';
  if (band >= 5.5) return 'B2';
  if (band >= 4) return 'B1';
  return 'A2';
}

const CN_NUM = ['零', '一', '两', '三', '四', '五', '六'];

function timelineWarning(prof, totalWeeks, checkpointWeeks) {
  const goal = cefrOfBand(prof.target.overall);
  const from = CEFR_LEVELS.indexOf(prof.baseline);
  const to = CEFR_LEVELS.indexOf(goal);
  const steps = to - from;
  if (steps <= 0) {
    return `起点 ${prof.baseline} 已达到目标 ${fmtBand(prof.target.overall)} 对应的 ${goal} 水平，计划以巩固和应试技巧为主。`;
  }
  const levels = CEFR_LEVELS.slice(from + 1, to + 1).join('、');
  const hours = steps * HOURS_PER_CEFR_LEVEL;
  const perDay = (hours / (totalWeeks * 7)).toFixed(1);
  const cpText = (checkpointWeeks || []).length ? `第 ${checkpointWeeks.join('、')} 周设了检查点` : '设了检查点';
  let s = `从 ${prof.baseline} 到雅思 ${fmtBand(prof.target.overall)}（约 ${goal}）要跨 ${levels} ${CN_NUM[steps] ? `${CN_NUM[steps]}档` : `${steps} 档`}，约需 ${hours} 小时有效学习；按 ${totalWeeks} 周算每天约 ${perDay} 小时。`;
  if (steps >= 3 && totalWeeks <= DEFAULT_TEMPLATE_WEEKS) s += `时间线非常激进，计划在${cpText}，未达标时会给出加量、推迟考试或调整目标的建议。`;
  else s += `计划在${cpText}，会按实际水平给出调整建议。`;
  if (totalWeeks < DEFAULT_TEMPLATE_WEEKS) s += `当前只有 ${totalWeeks} 周，26 周模板已按比例压缩，部分周会被跳过、强度更高。`;
  return s;
}

// ---- 计划视图（GET /ielts/plan）----

/**
 * 纯函数：根据计划模板、档案、用户数据和每日计数生成计划视图。
 * input: { plan, profile, user, counts, today, level }
 */
function buildPlanView(input) {
  const { plan, user, counts, today, level } = input;
  const prof = input.profile;
  const tl = deriveTimeline(prof, today, plan);
  const { totalWeeks, currentWeek, templateWeek, startDate, templateWeeks } = tl;

  const phases = (plan.phases || []).map((p, i, arr) => {
    const from = firstActualWeekOfTemplate(p.weeks[0], totalWeeks, templateWeeks);
    const next = arr[i + 1];
    const to = next ? firstActualWeekOfTemplate(next.weeks[0], totalWeeks, templateWeeks) - 1 : totalWeeks;
    return { ...p, actualWeeks: from <= to ? [from, to] : null };
  });

  const range = weekDateRange(startDate, currentWeek);
  const tpl = templateWeekData(plan, templateWeek) || { focus: '', tips: '', tasks: [] };
  const ctx = { counts, manualDone: user.manualDone || {}, today, weekFrom: range.from, weekTo: range.to };
  const tasks = (tpl.tasks || []).map((t) => taskStatus(t, ctx));
  const phase = phaseOfTemplateWeek(plan, templateWeek);

  const week = {
    week: currentWeek,
    templateWeek,
    phase: tpl.phase || (phase && phase.key) || null,
    phaseName: phase ? phase.name : '',
    from: range.from,
    to: range.to,
    focus: tpl.focus || '',
    tips: tpl.tips || '',
    tasks: tpl.tasks || [],
    minutesPerDay: minutesPerDay(tpl.tasks),
  };

  const upcoming = [];
  for (let w = currentWeek + 1; w <= Math.min(totalWeeks, currentWeek + 2); w++) {
    const tw = templateWeekFor(w, totalWeeks, templateWeeks);
    const t = templateWeekData(plan, tw) || { tasks: [] };
    const ph = phaseOfTemplateWeek(plan, tw);
    const r = weekDateRange(startDate, w);
    upcoming.push({
      week: w,
      templateWeek: tw,
      phase: t.phase || (ph && ph.key) || null,
      phaseName: ph ? ph.name : '',
      from: r.from,
      to: r.to,
      focus: t.focus || '',
      taskCount: (t.tasks || []).length,
      minutesPerDay: minutesPerDay(t.tasks),
    });
  }

  const metrics = computeMetrics(user);
  const cpCtx = { currentWeek, examDate: prof.examDate, targetOverall: prof.target.overall, level };
  const checkpoints = (plan.checkpoints || []).map((cp) =>
    evaluateCheckpoint(cp, firstActualWeekOfTemplate(cp.week, totalWeeks, templateWeeks), metrics, cpCtx)
  );

  return {
    active: prof.active,
    date: today,
    daysLeft: tl.daysLeft,
    phases,
    totalWeeks,
    currentWeek,
    week,
    today: {
      date: today,
      tasks,
      metCount: tasks.filter((t) => t.met).length,
      minutesPerDay: week.minutesPerDay,
    },
    upcoming,
    checkpoints,
    warning: timelineWarning(prof, totalWeeks, checkpoints.map((c) => c.week)),
  };
}

/** 查找某日期所在实际周的模板任务（POST /ielts/plan/check 用） */
function findTaskOnDate(plan, prof, date, taskKey, today) {
  const startDate = effectiveStartDate(prof, today);
  const templateWeeks = plan.templateWeeks || DEFAULT_TEMPLATE_WEEKS;
  const totalWeeks = totalWeeksFor(startDate, prof.examDate);
  const actualWeek = actualWeekFor(date, startDate, totalWeeks);
  const tw = templateWeekFor(actualWeek, totalWeeks, templateWeeks);
  const tpl = templateWeekData(plan, tw);
  const task = tpl ? (tpl.tasks || []).find((t) => t.key === taskKey) : null;
  return { actualWeek, templateWeek: tw, task: task || null };
}

/** 学习计划当前预设（routes/plan.js 存在 plan.json 的 level 字段），用于检查点建议文案 */
function loadPlanLevel() {
  const obj = readJSON(profile.file('plan.json'), {}) || {};
  return typeof obj.level === 'string' ? obj.level : '';
}

// ---- 分数粗估（GET /ielts/summary）----

/** 仅用写作、口语自评近 3 次均值粗估总分（按官方规则取整）；听力、阅读暂无站内雅思题型 */
function estimateOverall(metrics) {
  const parts = [];
  if (metrics.writing.avg != null) parts.push(metrics.writing.avg);
  if (metrics.speaking.avg != null) parts.push(metrics.speaking.avg);
  if (!parts.length) {
    return { overall: null, note: '还没有写作或口语自评记录，暂无法估分。' };
  }
  const overall = officialRound(parts.reduce((a, b) => a + b, 0) / parts.length);
  const used = [metrics.writing.avg != null ? '写作' : '', metrics.speaking.avg != null ? '口语' : ''].filter(Boolean).join('、');
  return {
    overall,
    note: `仅按${used}近 3 次自评均值粗估（官方规则取整到 0.5）；自评通常偏乐观，听力、阅读暂无站内雅思题型，请结合剑雅模考成绩判断。`,
  };
}

module.exports = {
  // 取整（D5）
  floorHalf,
  officialRound,
  bandFromScores,
  // 周映射（D6）
  totalWeeksFor,
  templateWeekFor,
  actualWeekFor,
  weekDateRange,
  firstActualWeekOfTemplate,
  phaseOfTemplateWeek,
  deriveTimeline,
  // 任务统计
  loadDailyCounts,
  taskStatus,
  minutesPerDay,
  // 检查点与视图
  computeMetrics,
  evaluateCheckpoint,
  postponeWeeksForGap,
  timelineWarning,
  buildPlanView,
  findTaskOnDate,
  loadPlanLevel,
  estimateOverall,
  MIN_WEEKS,
  MAX_WEEKS,
};
