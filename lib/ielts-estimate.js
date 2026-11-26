'use strict';

// 雅思四项成绩概况的「整套优先」口径（设计见 docs/design/ielts-external-scores-20261126.md §5），纯函数，供 GET /ielts/summary 使用。
// 整套成绩点：站内模考里做完的部分（听力 40 题、阅读 39 题折算、写作已按 Task 2 双倍加权）+ 剑雅等外部成绩的每一项。
// 近 6 周有整套成绩就用最近 ≤3 个整套的平均；没有时退回单项记录（排除模考拆写进各模块的记录，避免一套模考被重复计算）。
const ielts = require('./ielts');
const mockLib = require('./ielts-mock');
const ext = require('./ielts-external');
const listening = require('./ielts-listening');
const reading = require('./ielts-reading');

const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
const SKILL_LABEL = { listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' };
const SELF_UNIT = { writing: '篇', speaking: '次' };
const EXAM_SKILLS = ['listening', 'reading']; // 有考试 / 练习模式之分、客观判分的两项
const FULL_WINDOW_DAYS = 42;
const RECENT_N = 3;

function round2(x) {
  return Math.round(x * 100) / 100;
}

function meanBand(list) {
  return list.length ? round2(list.reduce((s, p) => s + p.band, 0) / list.length) : null;
}

/**
 * 整套成绩点：{ listening: [{ band, date, ts, source: 'mock'|'external' }], … }，每项按日期、时间升序。
 * 模考只要某部分 done 就算（不论整套是否出分或放弃）；时间取该部分的交卷时间。
 */
function fullTestPoints(user) {
  const out = { listening: [], reading: [], writing: [], speaking: [] };
  for (const m of mockLib.sanitizeMocks(user.mocks)) {
    for (const k of SKILLS) {
      const s = m.sections[k];
      if (!s || s.state !== 'done' || !ielts.isBand(s.band, 0) || !Number.isFinite(s.submittedAt)) continue;
      out[k].push({ band: s.band, date: ielts.todayKey(s.submittedAt), ts: s.submittedAt, source: 'mock' });
    }
  }
  for (const r of ext.sanitizeExternalTests(user.externalTests)) {
    for (const k of SKILLS) if (r[k]) out[k].push({ band: r[k].band, date: r.date, ts: r.ts, source: 'external' });
  }
  for (const k of SKILLS) out[k].sort(ext.byDateTs);
  return out;
}

/**
 * 单项成绩：听力 / 阅读取考试模式记录，写作 / 口语取自评记录；均分只用非模考记录的最近 3 次。
 * count / practiceCount 沿用原口径（全部考试模式 / 练习模式记录数，含模考写入的）。
 */
function singleStats(skill, user) {
  if (EXAM_SKILLS.includes(skill)) {
    const records = skill === 'listening' ? listening.sanitizeListenings(user.listenings) : reading.sanitizeReadings(user.readings);
    const exam = records.filter((r) => r.mode === 'exam');
    const pool = exam.filter((r) => !r.mockId).sort((a, b) => a.ts - b.ts).slice(-RECENT_N);
    return { avg: meanBand(pool), n: pool.length, count: exam.length, practiceCount: records.filter((r) => r.mode === 'practice').length };
  }
  const src = skill === 'writing' ? user.writings : user.speakings;
  const records = Array.isArray(src) ? src : [];
  const pool = records
    .filter((r) => !r.mockId && typeof r.band === 'number' && Number.isFinite(r.band))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-RECENT_N);
  return { avg: meanBand(pool), n: pool.length, count: records.length };
}

/**
 * 选口径：近 6 周的整套 → 单项 → 更早的整套 → 无。
 * @returns {{ last3Avg, basis: 'full'|'single'|null, stale, used: 整套点[] }}
 */
function chooseBasis(full, single, today) {
  const todayN = ielts.dayNumber(today);
  const fresh = full.filter((p) => todayN - ielts.dayNumber(p.date) <= FULL_WINDOW_DAYS);
  if (fresh.length) {
    const used = fresh.slice(-RECENT_N);
    return { last3Avg: meanBand(used), basis: 'full', stale: false, used };
  }
  if (single.avg != null) return { last3Avg: single.avg, basis: 'single', stale: false, used: [] };
  if (full.length) {
    const used = full.slice(-RECENT_N);
    return { last3Avg: meanBand(used), basis: 'full', stale: true, used };
  }
  return { last3Avg: null, basis: null, stale: false, used: [] };
}

function sourceText(used) {
  const mock = used.filter((p) => p.source === 'mock').length;
  const external = used.length - mock;
  const parts = [];
  if (mock) parts.push(`站内模考 ${mock} 次`);
  if (external) parts.push(`剑雅 ${external} 次`);
  return parts.join('、');
}

/** 一句话口径，前端直接显示 */
function basisLabel(skill, chosen, single) {
  const name = SKILL_LABEL[skill];
  if (chosen.basis === 'full') {
    const last = chosen.used[chosen.used.length - 1];
    const stale = chosen.stale ? `；最近一次 ${last.date}，已超过 6 周` : '';
    return `近 ${chosen.used.length} 次整套成绩均分（${sourceText(chosen.used)}${stale}）`;
  }
  if (EXAM_SKILLS.includes(skill)) {
    const p = single.practiceCount;
    if (chosen.basis === 'single') return `近 ${single.n} 次单项考试均分 · 考试模式 ${single.count} 次${p ? ` · 练习 ${p} 次` : ''}`;
    return p ? `还没有考试成绩（练习 ${p} 次不计分）` : `还没有${name}成绩`;
  }
  if (chosen.basis === 'single') return `近 ${single.n} 次自评均分 · 共 ${single.count} ${SELF_UNIT[skill]}`;
  return `还没有${name}记录`;
}

/**
 * 四项成绩概况。today 缺省为今天。
 * 每项：{ last3Avg, count, practiceCount（仅听力 / 阅读）, basis, fullCount, stale, label }
 */
function skillSummaries(user, today) {
  const day = today || ielts.todayKey();
  const full = fullTestPoints(user);
  const out = {};
  for (const k of SKILLS) {
    const single = singleStats(k, user);
    const chosen = chooseBasis(full[k], single, day);
    out[k] = {
      last3Avg: chosen.last3Avg,
      count: single.count,
      ...(EXAM_SKILLS.includes(k) ? { practiceCount: single.practiceCount } : {}),
      basis: chosen.basis,
      fullCount: full[k].length,
      stale: chosen.stale,
      label: basisLabel(k, chosen, single),
    };
  }
  return out;
}

/** 总分说明里的口径句：哪几项用了整套成绩（没有则返回空串） */
function basisNote(summaries) {
  const names = (pred) => SKILLS.filter((k) => pred(summaries[k])).map((k) => SKILL_LABEL[k]);
  const fresh = names((s) => s.basis === 'full' && !s.stale);
  const stale = names((s) => s.basis === 'full' && s.stale);
  const parts = [];
  if (fresh.length) parts.push(`${fresh.join('、')}按近 6 周的整套成绩（站内模考、剑雅）计算；`);
  if (stale.length) parts.push(`${stale.join('、')}只有 6 周以前的整套成绩，可能已过时；`);
  return parts.join('');
}

module.exports = {
  fullTestPoints,
  singleStats,
  chooseBasis,
  basisLabel,
  skillSummaries,
  basisNote,
  SKILLS,
  FULL_WINDOW_DAYS,
  RECENT_N,
};
