'use strict';
// 雅思备考后端测试：周数映射（D6）、band 取整（D5）、检查点判定、profile 校验、任务统计、内容加载与校验。
// 用法：npm run test:ielts（内容目录固定指向 scripts/fixtures/ielts，不读写任何档案学习数据）

const path = require('path');
const assert = require('assert');

process.env.IELTS_DATA_DIR = path.join(__dirname, 'fixtures', 'ielts');

const ielts = require('../lib/ielts');
const P = require('../lib/ielts-plan');
const { validateIelts } = require('./validate');

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}\n  ${e.message.split('\n').join('\n  ')}`);
  }
}

const TODAY = '2026-11-24';
const activeProfile = (over) => ielts.normalizeProfile({ active: true, startDate: TODAY, examDate: '2027-05-24', ...over }, TODAY);

// ---------------- 周数映射（D6）----------------
test('实际周数 = ceil(天数 / 7)，夹在 [4, 52]', () => {
  assert.strictEqual(P.totalWeeksFor(TODAY, '2027-05-24'), 26); // 181 天
  assert.strictEqual(P.totalWeeksFor(TODAY, '2027-05-25'), 26); // 182 天
  assert.strictEqual(P.totalWeeksFor(TODAY, '2027-05-26'), 27);
  assert.strictEqual(P.totalWeeksFor(TODAY, '2026-11-30'), 4); // 不足 4 周按 4 周
  assert.strictEqual(P.totalWeeksFor(TODAY, '2029-01-01'), 52); // 超过 52 周按 52 周
});

test('26 周时实际周与模板周一一对应', () => {
  for (let i = 1; i <= 26; i++) assert.strictEqual(P.templateWeekFor(i, 26), i);
});

test('压缩到 4 / 13 周、拉伸到 52 周的映射', () => {
  assert.deepStrictEqual([1, 2, 3, 4].map((i) => P.templateWeekFor(i, 4)), [1, 8, 14, 21]);
  assert.deepStrictEqual([1, 2, 7, 13].map((i) => P.templateWeekFor(i, 13)), [1, 3, 13, 25]);
  assert.strictEqual(P.templateWeekFor(1, 52), 1);
  assert.strictEqual(P.templateWeekFor(3, 52), 2); // round(2×0.5)=1 → 2
  // 公式在 52 周末尾会算出 27，需夹回模板周数
  assert.strictEqual(P.templateWeekFor(52, 52), 26);
  for (let n = 4; n <= 52; n++) {
    let prev = 0;
    for (let i = 1; i <= n; i++) {
      const t = P.templateWeekFor(i, n);
      assert.ok(t >= 1 && t <= 26, `n=${n} i=${i} 越界 ${t}`);
      assert.ok(t >= prev, `n=${n} i=${i} 映射不单调`);
      prev = t;
    }
  }
});

test('当前周按开始日每 7 天一周，夹在 [1, 总周数]', () => {
  assert.strictEqual(P.actualWeekFor(TODAY, TODAY, 26), 1);
  assert.strictEqual(P.actualWeekFor('2026-11-30', TODAY, 26), 1);
  assert.strictEqual(P.actualWeekFor('2026-12-01', TODAY, 26), 2);
  assert.strictEqual(P.actualWeekFor('2026-11-01', TODAY, 26), 1); // 开始日之前
  assert.strictEqual(P.actualWeekFor('2028-01-01', TODAY, 26), 26); // 考试之后
  assert.deepStrictEqual(P.weekDateRange(TODAY, 2), { from: '2026-12-01', to: '2026-12-07' });
});

test('检查点模板周换算到实际周', () => {
  assert.deepStrictEqual([8, 14, 20].map((t) => P.firstActualWeekOfTemplate(t, 26)), [8, 14, 20]);
  assert.deepStrictEqual([8, 14, 20].map((t) => P.firstActualWeekOfTemplate(t, 13)), [5, 8, 11]);
});

test('deriveTimeline：倒计时、阶段；未开启时按今天开始预览', () => {
  const plan = ielts.getPlan();
  const tl = P.deriveTimeline(activeProfile(), '2027-01-20', plan);
  assert.strictEqual(tl.totalWeeks, 26);
  assert.strictEqual(tl.currentWeek, 9);
  assert.strictEqual(tl.templateWeek, 9);
  assert.strictEqual(tl.phase.key, 'skills');
  assert.strictEqual(tl.daysLeft, 124);
  const inactive = ielts.normalizeProfile({ active: false, startDate: '2026-01-01', examDate: '2027-05-24' }, TODAY);
  const tl2 = P.deriveTimeline(inactive, TODAY, plan);
  assert.strictEqual(tl2.currentWeek, 1);
  assert.strictEqual(tl2.startDate, TODAY);
  // 考试日已过，倒计时不出现负数
  assert.strictEqual(P.deriveTimeline(activeProfile(), '2027-06-01', plan).daysLeft, 0);
});

// ---------------- band 取整（D5）----------------
test('自评四维平均后向下取整到 0.5', () => {
  assert.strictEqual(P.floorHalf(6.375), 6);
  assert.strictEqual(P.floorHalf(6.5), 6.5);
  assert.strictEqual(P.floorHalf(6.875), 6.5);
  assert.strictEqual(P.floorHalf(6.125), 6);
  assert.strictEqual(P.bandFromScores({ TR: 6, CC: 6, LR: 5.5, GRA: 5.5 }), 5.5); // 均值 5.75
  assert.strictEqual(P.bandFromScores({ FC: 5, LR: 5, GRA: 5, P: 5.5 }), 5); // 均值 5.125
  assert.strictEqual(P.bandFromScores({ FC: 7, LR: 7, GRA: 7, P: 7 }), 7);
  assert.strictEqual(P.bandFromScores({}), null);
});

test('总分按官方规则：.25 进为 .5，.75 进为整数', () => {
  assert.strictEqual(P.officialRound(6.25), 6.5);
  assert.strictEqual(P.officialRound(6.75), 7);
  assert.strictEqual(P.officialRound(6.125), 6);
  assert.strictEqual(P.officialRound(6.375), 6.5);
  assert.strictEqual(P.officialRound(6.625), 6.5);
  assert.strictEqual(P.officialRound(6.875), 7);
  assert.strictEqual(P.officialRound(7), 7);
});

// ---------------- 检查点判定 ----------------
const CP = { week: 8, name: 'B1 检查点', criteria: { vocabBand: 'B1', vocabCoverageMin: 70, writingMin: 5.0, speakingMin: 5.0 } };
const metricsOf = (user) => P.computeMetrics({ writings: [], speakings: [], vocabChecks: [], ...user });
const ctx = (over) => ({ currentWeek: 8, examDate: '2027-05-24', targetOverall: 7, level: 'starter', ...over });

test('未到对应实际周为 future', () => {
  const r = P.evaluateCheckpoint(CP, 8, metricsOf({}), ctx({ currentWeek: 7 }));
  assert.strictEqual(r.status, 'future');
  assert.deepStrictEqual(r.suggestions, []);
  assert.ok(r.detail.includes('第 8 周'));
});

test('已到但缺数据为 due，并提示补做', () => {
  const r = P.evaluateCheckpoint(CP, 8, metricsOf({ writings: [{ band: 6, ts: 1 }] }), ctx());
  assert.strictEqual(r.status, 'due');
  assert.strictEqual(r.suggestions.length, 2); // 缺词汇诊断、缺口语
  assert.ok(r.detail.includes('还没有做过雅思词汇诊断'));
});

test('全部达标为 passed；只取最近 3 次均值与最近一次诊断', () => {
  const user = {
    writings: [{ band: 3, ts: 1 }, { band: 5, ts: 2 }, { band: 5.5, ts: 3 }, { band: 5, ts: 4 }],
    speakings: [{ band: 5, ts: 1 }],
    vocabChecks: [
      { ts: 1, byBand: { B1: { total: 10, correct: 5, coverage: 33 } }, overall: 30 },
      { ts: 2, byBand: { B1: { total: 10, correct: 8, coverage: 73 } }, overall: 61 },
    ],
  };
  const m = metricsOf(user);
  assert.strictEqual(m.writing.avg, 5.17);
  assert.strictEqual(m.writing.count, 3);
  const r = P.evaluateCheckpoint(CP, 8, m, ctx());
  assert.strictEqual(r.status, 'passed');
  assert.strictEqual(r.metrics.vocabCoverage, 73);
  assert.deepStrictEqual(r.suggestions, []);
});

test('未达标为 failed，给出切预设、推迟日期、调目标三类建议', () => {
  const user = {
    writings: [{ band: 4, ts: 1 }],
    speakings: [{ band: 5, ts: 1 }],
    vocabChecks: [{ ts: 1, byBand: { B1: { total: 10, correct: 8, coverage: 73 } }, overall: 61 }],
  };
  const r = P.evaluateCheckpoint(CP, 8, metricsOf(user), ctx());
  assert.strictEqual(r.status, 'failed');
  assert.strictEqual(r.suggestions.length, 3);
  assert.ok(r.suggestions[0].includes('切到「雅思」'));
  // 写作差 1.0 band → 推迟 6 周
  assert.deepStrictEqual(r.postpone, { weeks: 6, examDate: '2027-07-05' });
  assert.ok(r.suggestions[1].includes('2027-07-05'));
  assert.ok(r.suggestions[2].includes('6.5'));
});

test('failed 建议随预设与目标调整；差距折算推迟周数', () => {
  const user = { writings: [{ band: 5, ts: 1 }], speakings: [{ band: 5, ts: 1 }], vocabChecks: [{ ts: 1, byBand: { B1: { coverage: 65 } } }] };
  const r = P.evaluateCheckpoint(CP, 8, metricsOf(user), ctx({ level: 'ielts', targetOverall: 6.5 }));
  assert.strictEqual(r.status, 'failed');
  assert.strictEqual(r.suggestions.length, 2); // 目标已是 6.5，不再建议下调
  assert.ok(r.suggestions[0].includes('已是「雅思」预设'));
  assert.strictEqual(r.postpone.weeks, 4); // 覆盖率差 5 个百分点 ≈ 0.25 band
  assert.strictEqual(P.postponeWeeksForGap(0.5), 4);
  assert.strictEqual(P.postponeWeeksForGap(1), 6);
  assert.strictEqual(P.postponeWeeksForGap(1.5), 8);
});

// ---------------- profile 校验 ----------------
test('normalizeProfile：缺失或非法字段回落默认', () => {
  const p = ielts.normalizeProfile(null, TODAY);
  assert.deepStrictEqual(p, {
    active: false, examType: 'A', examDate: '2027-05-24', startDate: null, baseline: 'A2',
    target: { overall: 7, listening: null, reading: null, writing: null, speaking: null },
  });
  const q = ielts.normalizeProfile({ active: 'yes', examType: 'X', examDate: '2027-02-30', startDate: 'x', baseline: 'Z', target: { overall: 7.3, writing: 6.5 } }, TODAY);
  assert.strictEqual(q.active, false);
  assert.strictEqual(q.examType, 'A');
  assert.strictEqual(q.examDate, '2027-05-24');
  assert.strictEqual(q.startDate, null);
  assert.strictEqual(q.baseline, 'A2');
  assert.strictEqual(q.target.overall, 7);
  assert.strictEqual(q.target.writing, 6.5);
  // 默认考试日已不足 4 周时改为 26 周后
  assert.strictEqual(ielts.normalizeProfile(null, '2027-05-01').examDate, '2027-10-30');
});

test('applyProfilePatch：非法输入返回 error', () => {
  const cur = ielts.normalizeProfile(null, TODAY);
  const bad = [
    [null, '请求体必须是 JSON 对象'],
    [[], '请求体必须是 JSON 对象'],
    [{}, '没有要更新的字段'],
    [{ startDate: TODAY }, '不支持的字段'],
    [{ active: 1 }, 'active'],
    [{ examType: 'a' }, 'examType'],
    [{ examDate: '2027/05/24' }, 'examDate'],
    [{ examDate: TODAY }, '晚于今天'],
    [{ examDate: '2030-01-01' }, '不能晚于'],
    [{ baseline: 'B3' }, 'baseline'],
    [{ target: 7 }, 'target 必须是对象'],
    [{ target: { overall: 9.5 } }, 'target.overall'],
    [{ target: { overall: null } }, 'target.overall'],
    [{ target: { writing: 6.2 } }, 'target.writing'],
    [{ target: { total: 7 } }, 'target 不支持'],
  ];
  for (const [patch, msg] of bad) {
    const r = ielts.applyProfilePatch(cur, patch, TODAY);
    assert.ok(r.error && r.error.includes(msg), `${JSON.stringify(patch)} → ${JSON.stringify(r)}`);
  }
});

test('applyProfilePatch：首次激活写入 startDate，再次激活保留原开始日', () => {
  const cur = ielts.normalizeProfile(null, TODAY);
  const r1 = ielts.applyProfilePatch(cur, { active: true, examType: 'G', target: { overall: 6.5, speaking: 7 } }, TODAY);
  assert.ok(!r1.error, r1.error);
  assert.strictEqual(r1.profile.startDate, TODAY);
  assert.strictEqual(r1.profile.examType, 'G');
  assert.strictEqual(r1.profile.target.overall, 6.5);
  assert.strictEqual(r1.profile.target.speaking, 7);
  assert.strictEqual(r1.profile.target.listening, null);
  const off = ielts.applyProfilePatch(r1.profile, { active: false }, '2026-12-10').profile;
  const on = ielts.applyProfilePatch(off, { active: true }, '2026-12-20').profile;
  assert.strictEqual(on.startDate, TODAY);
  // 考试日已过时开启，必须同时给新日期
  const stale = { ...cur, examDate: '2026-11-01' };
  assert.ok(ielts.applyProfilePatch(stale, { active: true }, TODAY).error.includes('考试日期已过'));
  assert.ok(!ielts.applyProfilePatch(stale, { active: true, examDate: '2027-06-01' }, TODAY).error);
});

// ---------------- 任务统计 ----------------
test('taskStatus：按天、按周、external 打勾', () => {
  const counts = new Map([
    ['2026-11-24', { quiz: 3, 'ielts-writing': 1 }],
    ['2026-11-25', { quiz: 4, 'ielts-writing': 1 }],
    ['2026-12-01', { 'ielts-writing': 5 }], // 下一周，不计入本周
  ]);
  const c = { counts, manualDone: { '2026-11-24': ['cam'] }, today: '2026-11-25', weekFrom: TODAY, weekTo: '2026-11-30' };
  const day = P.taskStatus({ key: 'q', kind: 'internal', source: ['quiz', 'lesson'], target: 5 }, c);
  assert.deepStrictEqual([day.per, day.done, day.met], ['day', 4, false]);
  const week = P.taskStatus({ key: 'w', kind: 'internal', source: ['ielts-writing'], target: 2, per: 'week' }, c);
  assert.deepStrictEqual([week.done, week.met], [2, true]);
  const ext = P.taskStatus({ key: 'cam', kind: 'external', target: 1, per: 'week' }, c);
  assert.deepStrictEqual([ext.done, ext.met, ext.checkedToday], [1, true, false]);
  const extDay = P.taskStatus({ key: 'cam', kind: 'external' }, { ...c, today: TODAY });
  assert.deepStrictEqual([extDay.target, extDay.done, extDay.checkedToday], [1, 1, true]);
  assert.strictEqual(P.minutesPerDay([{ minutes: 30 }, { minutes: 70, per: 'week' }]), 40);
});

test('buildPlanView：夹具计划第 1 周的今日任务与检查点', () => {
  const plan = ielts.getPlan();
  const user = { writings: [], speakings: [], vocabChecks: [], manualDone: { [TODAY]: ['cam-test'] } };
  const counts = new Map([[TODAY, { quiz: 5, 'ielts-speaking': 1 }]]);
  const v = P.buildPlanView({ plan, profile: activeProfile(), user, counts, today: TODAY, level: '' });
  assert.strictEqual(v.totalWeeks, 26);
  assert.strictEqual(v.currentWeek, 1);
  assert.strictEqual(v.week.from, TODAY);
  const byKey = Object.fromEntries(v.today.tasks.map((t) => [t.key, t]));
  assert.strictEqual(byKey.practice.met, true);
  assert.strictEqual(byKey.writing.met, false);
  assert.strictEqual(byKey.speaking.done, 1);
  assert.strictEqual(byKey['cam-test'].checkedToday, true);
  assert.strictEqual(v.today.metCount, 3);
  assert.deepStrictEqual(v.upcoming.map((u) => u.week), [2, 3]);
  assert.deepStrictEqual(v.checkpoints.map((c) => c.status), ['future', 'future', 'future']);
  assert.deepStrictEqual(v.phases.map((p) => p.actualWeeks), [[1, 8], [9, 20], [21, 26]]);
  assert.ok(v.warning.includes('600 小时'));
  const found = P.findTaskOnDate(plan, activeProfile(), TODAY, 'cam-test', TODAY);
  assert.strictEqual(found.task.kind, 'external');
});

// ---------------- 内容加载与校验 ----------------
test('IELTS_DATA_DIR 指向夹具：分片、local/ 私有分片、rubrics、plan 均被加载', () => {
  const c = ielts.getContent();
  assert.strictEqual(c.dir, process.env.IELTS_DATA_DIR);
  assert.deepStrictEqual(c.issues, []);
  assert.strictEqual(c.vocab.length, 17);
  assert.ok(ielts.getVocabEntry('Curriculum'), 'local/ 分片应被加载（normKey 查询）');
  assert.strictEqual(ielts.getWriting('w1g-01').variant, 'G');
  assert.strictEqual(ielts.getSpeaking('s2-person-01').part3.length, 2);
  assert.ok(ielts.getRubrics().speaking.length === 4);
  assert.strictEqual(ielts.getPlan().weeks.length, 26);
});

test('countWords 按空白切分', () => {
  assert.strictEqual(ielts.countWords('Dear Anna,\n\nThank you.\nBest wishes,\nLucy'), 7);
  assert.strictEqual(ielts.countWords('  '), 0);
  assert.strictEqual(ielts.countWords(null), 0);
});

test('validateIelts：夹具无错误', () => {
  const r = validateIelts(ielts.getContent());
  assert.deepStrictEqual(r.errors, []);
});

test('validateIelts：能发现典型内容错误', () => {
  const good = ielts.getContent();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const writing = clone(good.writing);
  writing[0].modelAnswer = 'Too short.';
  writing[1].chart.series[0].values.pop();
  writing[1].chart.type = 'pie'; // 3 个 series 的 pie
  writing.push({ ...clone(good.writing[2]), id: 'w2-edu-01' }); // id 重复（G 类无 topic 不报错）
  const plan = clone(good.plan);
  plan.weeks[0].tasks[0].tab = 'nowhere';
  plan.weeks[0].tasks[1].source = ['no-such-source'];
  plan.weeks.pop();
  const vocab = [...good.vocab, { ...good.vocab[0] }]; // 重复词
  const rubrics = clone(good.rubrics);
  rubrics.speaking.pop();
  const r = validateIelts({ ...good, vocab, writing, plan, rubrics, issues: [] });
  const has = (s) => assert.ok(r.errors.some((e) => e.includes(s)), `应报错：${s}\n实际：${r.errors.join('\n')}`);
  has('范文仅');
  has('values 长度');
  has('pie 图只能有 1 个 series');
  has('id 重复');
  has('tab 非法');
  has('source 非法');
  has('weeks 应有 26 周');
  has('词重复');
  has('缺少维度 P');
  assert.ok(!r.errors.some((e) => e.includes('w1g-01') && e.includes('topic')), 'G 类书信不应要求 topic');
});

test('真实计划模板 data/ielts/plan.json 通过校验，W1–W25 日均 180–210 分钟', () => {
  const { readJSON } = require('../lib/store');
  const plan = readJSON(path.join(__dirname, '..', 'data', 'ielts', 'plan.json'), null);
  assert.ok(plan, 'data/ielts/plan.json 缺失');
  const r = validateIelts({ vocab: [], writing: [], speaking: [], rubrics: null, plan, issues: [] });
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
  for (const w of plan.weeks) {
    const m = P.minutesPerDay(w.tasks);
    if (w.week <= 25) assert.ok(m >= 180 && m <= 210, `W${w.week} 日均 ${m} 分钟`);
  }
});

test('查词典：雅思来源排在教材、extras、全局词库之后（只补充新词）', () => {
  const { findEntry } = require('../lib/wordlookup');
  assert.strictEqual(findEntry('homogeneous').source, 'ielts');
  assert.strictEqual(findEntry('homogeneous').cefr, 'C1');
  assert.ok(findEntry('homogeneous').eg.endsWith('有人担心全球品牌会让文化变得更加单一。'));
  assert.strictEqual(findEntry('pollution').source, 'textbook'); // 教材优先
  assert.strictEqual(findEntry('curriculum').source, 'global'); // 全局词库已有的词保持原词条，不被雅思覆盖
});

test('重新开启备考：停用超过 8 周后开始日重置为当天，短暂停用保留原开始日', () => {
  const today = '2027-01-10';
  const base = ielts.normalizeProfile({ active: false, examDate: '2027-06-01', startDate: '2026-10-01' }, today);
  assert.strictEqual(ielts.applyProfilePatch(base, { active: true }, today).profile.startDate, today);
  const recent = { ...base, startDate: '2026-12-20' };
  assert.strictEqual(ielts.applyProfilePatch(recent, { active: true }, today).profile.startDate, '2026-12-20');
  const running = { ...base, active: true };
  assert.strictEqual(ielts.applyProfilePatch(running, { examType: 'G' }, today).profile.startDate, '2026-10-01');
});

test('考试日最远 364 天，与 52 周上限对齐', () => {
  const today = '2027-01-10';
  const p = ielts.normalizeProfile({}, today);
  assert.ok(ielts.applyProfilePatch(p, { examDate: '2028-01-09' }, today).profile, '364 天应接受');
  assert.ok(ielts.applyProfilePatch(p, { examDate: '2028-01-10' }, today).error, '365 天应拒绝');
});

// ---------------- Task 1 流程图 / 地图题校验 ----------------
// 以夹具里的 w1a-01 为底（范文字数等已合法），只替换 chart
const chartItem = (id, chart) => ({ ...JSON.parse(JSON.stringify(ielts.getWriting('w1a-01'))), id, chart });
const goodProcess = () => ({
  type: 'process',
  title: 'How paper is recycled',
  stages: [
    { id: 'collect', label: 'Collection', note: 'paper put in bins' },
    { id: 'sort', label: 'Sorting' },
    { id: 'pulp', label: 'Pulping', note: 'mixed with water' },
    { id: 'press', label: 'Pressing' },
    { id: 'waste', label: 'Waste' },
  ],
  links: [
    { from: 'collect', to: 'sort' },
    { from: 'sort', to: 'pulp' },
    { from: 'pulp', to: 'press' },
    { from: 'sort', to: 'waste', label: 'rejected' }, // 一处分支
    { from: 'press', to: 'collect', label: 'reused' }, // 一处回路
  ],
});
const goodMap = () => ({
  type: 'map',
  title: 'Town centre',
  compass: true,
  maps: [
    { title: '1990', features: [{ kind: 'building', x: 10, y: 10, w: 20, h: 15, label: 'Library' }, { kind: 'road', x: 0, y: 45, w: 100, h: 6, label: 'High Street' }] },
    { title: '2020', features: [{ kind: 'car-park', x: 10, y: 10, w: 20, h: 15, label: 'Car park' }, { kind: 'label', x: 80, y: 80, w: 0, h: 0, label: 'Station' }] },
  ],
});
// rubrics / plan 传 null 会带出「文件缺失」警告，所以下面只看本组题目（id=t-…）相关的警告
const validateWriting = (items) => validateIelts({ vocab: [], writing: items, speaking: [], rubrics: null, plan: null, issues: [] });
const itemWarnings = (r) => r.warnings.filter((w) => w.includes('id=t-'));

test('validateIelts：合法的流程图（含分支和回路）、循环流程图与地图不报错', () => {
  const cycle = { ...goodProcess(), cycle: true };
  const r = validateWriting([chartItem('t-proc', goodProcess()), chartItem('t-cycle', cycle), chartItem('t-map', goodMap())]);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(itemWarnings(r), []);
});

test('validateIelts：流程图 stage id 重复、links 引用不存在的 id、label 为空', () => {
  const p = goodProcess();
  p.stages[4].id = 'sort'; // 与第 2 个阶段重复
  p.stages[1].label = '  ';
  p.links.push({ from: 'press', to: 'nowhere' });
  p.links.push({ from: 'ghost', to: 'press' });
  p.links.push({ from: 'pulp', to: 'pulp' });
  p.cycle = 'yes';
  const r = validateWriting([chartItem('t-proc-bad', p)]);
  const has = (s) => assert.ok(r.errors.some((e) => e.includes('t-proc-bad') && e.includes(s)), `应报错：${s}\n实际：${r.errors.join('\n')}`);
  has('stage id 重复 (sort)');
  has('stages[1]: label 不能为空');
  has('to 引用了不存在的 stage id (nowhere)');
  has('from 引用了不存在的 stage id (ghost)');
  has('from 和 to 不能是同一个阶段');
  has('chart.cycle 必须是 true / false');
  // 流程图不要求 categories / series
  assert.ok(!r.errors.some((e) => e.includes('categories') || e.includes('series')), r.errors.join('\n'));
});

test('validateIelts：流程图 stages / links 为空', () => {
  const r = validateWriting([
    chartItem('t-proc-empty', { type: 'process', title: 'x', stages: [], links: [] }),
    chartItem('t-proc-nolink', { ...goodProcess(), links: [] }),
  ]);
  assert.ok(r.errors.some((e) => e.includes('t-proc-empty') && e.includes('至少要有 2 个阶段')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.includes('t-proc-nolink') && e.includes('chart.links 不能为空')), r.errors.join('\n'));
});

test('validateIelts：地图不是恰好 2 张、坐标越界、label 为空、kind 非法', () => {
  const one = goodMap();
  one.maps.pop();
  const three = goodMap();
  three.maps.push(JSON.parse(JSON.stringify(three.maps[0])));
  const bad = goodMap();
  bad.maps[0].features[0].x = -5;
  bad.maps[0].features[1].w = 120;
  bad.maps[1].features[0].label = '';
  bad.maps[1].features[1].kind = 'tree';
  bad.maps[1].features.push({ kind: 'park', x: 90, y: 90, w: 20, h: 5, label: 'Edge park' }); // x + w > 100
  bad.maps[1].features.push({ kind: 'water', x: 5, y: 5, w: 0, h: 10, label: 'Pond' }); // 非 label 的地物没有面积
  bad.maps[1].title = '';
  const r = validateWriting([chartItem('t-map-one', one), chartItem('t-map-three', three), chartItem('t-map-bad', bad)]);
  const has = (id, s) => assert.ok(r.errors.some((e) => e.includes(id) && e.includes(s)), `应报错：${id} ${s}\n实际：${r.errors.join('\n')}`);
  has('t-map-one', '必须恰好 2 张（实际 1）');
  has('t-map-three', '必须恰好 2 张（实际 3）');
  has('t-map-bad', 'features[0]: x 必须是 0–100 的数字');
  has('t-map-bad', 'features[1]: w 必须是 0–100 的数字');
  has('t-map-bad', 'maps[1].features[0]: label 不能为空');
  has('t-map-bad', 'kind 必须是');
  has('t-map-bad', '超出地图范围');
  has('t-map-bad', 'water 的 w、h 必须大于 0');
  has('t-map-bad', 'maps[1]: 缺少 title');
  // 缺 compass 只给警告
  const noCompass = goodMap();
  delete noCompass.compass;
  const r2 = validateWriting([chartItem('t-map-nc', noCompass)]);
  assert.deepStrictEqual(r2.errors, []);
  assert.ok(itemWarnings(r2).some((w) => w.includes('compass')), r2.warnings.join('\n'));
});

test('validateIelts：未知图表类型的报错列出全部合法类型', () => {
  const r = validateWriting([chartItem('t-type', { type: 'radar', title: 'x', categories: ['a'], series: [{ name: 's', values: [1] }] })]);
  assert.ok(r.errors.some((e) => e.includes('bar / line / pie / table / process / map (radar)')), r.errors.join('\n'));
});

if (failed) {
  console.error(`\ntest-ielts：${failed} 项未通过，${passed} 项通过`);
  process.exit(1);
}
console.log(`test-ielts：全部 ${passed} 项通过`);
