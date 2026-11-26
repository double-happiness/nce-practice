'use strict';
// 雅思全真模考测试：组卷（避开最近做过的内容、全部做过后挑最久没做的）、各项算分、写作加权、总分取整、
// 状态机（顺序、重新开始、放弃、出分）、中断后续做、请求体校验、记录清洗，以及接口集成（400 / 404 / 409、写入各模块记录）。
// 用法：node scripts/test-ielts-mock.js
//
// 【隔离】纯函数测试不读写档案。接口集成测试在进程内起一个只挂 routes/ielts-mock.js 的 Express，
// 用 lib/profile.js 新建临时档案（create 会自动切过去），所有读写都落在临时档案；结束时切回原档案、
// 删除临时档案并清掉 data/profiles/.trash/ 里对应的目录。与 scripts/test-ielts-api.js 一样，
// 若脚本被 kill -9 硬杀，当前档案会停在临时档案上，需要手动切回；运行期间不要同时操作同一数据目录的服务。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M = require('../lib/ielts-mock');
const listening = require('../lib/ielts-listening');
const reading = require('../lib/ielts-reading');

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}\n  ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n  ')}`);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}\n  ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n  ')}`);
  }
}

// 可复现的伪随机数（线性同余）
function seeded(seed) {
  // 先把种子打散：相邻的小种子直接进线性同余，前几个输出几乎一样
  let s = Math.imul(seed >>> 0, 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------- 构造的题库 ----------------
const POOLS = {
  listening: [
    { id: 'l1-a', part: 1 }, { id: 'l1-b', part: 1 }, { id: 'l2-a', part: 2 }, { id: 'l2-b', part: 2 },
    { id: 'l3-a', part: 3 }, { id: 'l4-a', part: 4 }, { id: 'l4-b', part: 4 },
  ],
  reading: [
    { id: 'rd-e1', difficulty: 'easy' }, { id: 'rd-e2', difficulty: 'easy' }, { id: 'rd-m1', difficulty: 'medium' },
    { id: 'rd-m2', difficulty: 'medium' }, { id: 'rd-h1', difficulty: 'hard' }, { id: 'rd-h2', difficulty: 'hard' },
  ],
  writing: [
    { id: 'w1a-1', task: 1, variant: 'A', prompt: 'p' }, { id: 'w1a-2', task: 1, variant: 'A', prompt: 'p' },
    { id: 'w1g-1', task: 1, variant: 'G', prompt: 'p' }, { id: 'w1g-2', task: 1, variant: 'G', prompt: 'p' },
    { id: 'w2-1', task: 2, prompt: 'p' }, { id: 'w2-2', task: 2, prompt: 'p' },
  ],
  speaking: [
    { id: 's1-a', part: 1, questions: [{ q: 'q' }] }, { id: 's1-b', part: 1, questions: [{ q: 'q' }] },
    { id: 's1-empty', part: 1, questions: [] },
    { id: 's2-a', part: 2, cueCard: { title: 't' } }, { id: 's2-b', part: 2, cueCard: { title: 't' } },
  ],
};
const usedOf = (obj) => {
  const out = { listening: new Map(), reading: new Map(), writing: new Map(), speaking: new Map() };
  for (const k of Object.keys(obj)) for (const [id, ts] of Object.entries(obj[k])) out[k].set(id, ts);
  return out;
};
const allIds = (paper) => [
  ...paper.listening, ...paper.reading, paper.writing.task1, paper.writing.task2, paper.speaking.part1, paper.speaking.part2,
];

// ---------------- 组卷 ----------------
test('组卷：最近做过的内容不会被抽到（多种随机种子）', () => {
  const used = usedOf({
    listening: { 'l1-a': 1000, 'l2-b': 900, 'l4-a': 800 },
    reading: { 'rd-e1': 1000, 'rd-m2': 700, 'rd-h1': 500 },
    writing: { 'w1a-1': 1000, 'w2-1': 600 },
    speaking: { 's1-a': 1000, 's2-a': 400 },
  });
  for (let seed = 1; seed <= 40; seed++) {
    const r = M.assemblePaper({ examType: 'A', used, rand: seeded(seed), pools: POOLS });
    assert.ok(r.paper, r.error);
    assert.deepStrictEqual(r.paper.listening, ['l1-b', 'l2-a', 'l3-a', 'l4-b']);
    assert.deepStrictEqual(r.paper.reading, ['rd-e2', 'rd-m1', 'rd-h2']);
    assert.deepStrictEqual(r.paper.writing, { task1: 'w1a-2', task2: 'w2-2' });
    assert.deepStrictEqual(r.paper.speaking, { part1: 's1-b', part2: 's2-b' });
  }
});

test('组卷：全部做过后挑最久没做的（允许重复）', () => {
  const used = usedOf({
    listening: { 'l1-a': 300, 'l1-b': 200, 'l2-a': 100, 'l2-b': 900, 'l3-a': 50, 'l4-a': 10, 'l4-b': 20 },
    reading: { 'rd-e1': 5, 'rd-e2': 6, 'rd-m1': 9, 'rd-m2': 8, 'rd-h1': 2, 'rd-h2': 1 },
    writing: { 'w1a-1': 2, 'w1a-2': 1, 'w2-1': 1, 'w2-2': 2 },
    speaking: { 's1-a': 1, 's1-b': 2, 's2-a': 2, 's2-b': 1 },
  });
  const r = M.assemblePaper({ examType: 'A', used, rand: seeded(7), pools: POOLS });
  assert.deepStrictEqual(r.paper.listening, ['l1-b', 'l2-a', 'l3-a', 'l4-a']);
  assert.deepStrictEqual(r.paper.reading, ['rd-e1', 'rd-m2', 'rd-h2']);
  assert.deepStrictEqual(r.paper.writing, { task1: 'w1a-2', task2: 'w2-1' });
  assert.deepStrictEqual(r.paper.speaking, { part1: 's1-a', part2: 's2-b' });
});

test('组卷：从没做过的候选之间随机（不同种子会抽到不同的）', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    seen.add(M.assemblePaper({ examType: 'A', rand: seeded(seed), pools: POOLS }).paper.listening[0]);
  }
  assert.deepStrictEqual([...seen].sort(), ['l1-a', 'l1-b']);
});

test('组卷：Task 1 按 examType 出题；Part 1 跳过没有题目的话题', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const g = M.assemblePaper({ examType: 'G', rand: seeded(seed), pools: POOLS }).paper;
    assert.ok(g.writing.task1.startsWith('w1g-'));
    assert.notStrictEqual(g.speaking.part1, 's1-empty');
    const a = M.assemblePaper({ examType: 'A', rand: seeded(seed), pools: POOLS }).paper;
    assert.ok(a.writing.task1.startsWith('w1a-'));
  }
});

test('组卷：阅读缺一个难度时从其余文章补足，并按易 → 中 → 难排序', () => {
  const pools = { ...POOLS, reading: POOLS.reading.filter((p) => p.difficulty !== 'medium') };
  for (let seed = 1; seed <= 10; seed++) {
    const ids = M.assemblePaper({ examType: 'A', rand: seeded(seed), pools }).paper.reading;
    assert.strictEqual(new Set(ids).size, 3);
    const rank = { e: 0, m: 1, h: 2 };
    const ranks = ids.map((id) => rank[id[3]]);
    assert.deepStrictEqual(ranks, ranks.slice().sort());
  }
});

test('组卷：题库不足时报错', () => {
  assert.match(M.assemblePaper({ pools: { ...POOLS, listening: POOLS.listening.filter((s) => s.part !== 3) } }).error, /Part 3/);
  assert.match(M.assemblePaper({ pools: { ...POOLS, reading: POOLS.reading.slice(0, 2) } }).error, /阅读/);
  assert.match(M.assemblePaper({ examType: 'G', pools: { ...POOLS, writing: POOLS.writing.filter((w) => w.variant !== 'G') } }).error, /G 类/);
  assert.match(M.assemblePaper({ pools: { ...POOLS, speaking: POOLS.speaking.filter((s) => s.part !== 2) } }).error, /Part 2/);
});

test('最近使用时间：来自各模块记录和历次模考试卷', () => {
  const paper = { listening: ['l1-a', 'l2-a', 'l3-a', 'l4-a'], reading: ['rd-e1', 'rd-m1', 'rd-h1'], writing: { task1: 'w1a-1', task2: 'w2-1' }, speaking: { part1: 's1-a', part2: 's2-a' } };
  const mock = M.createMock({ id: 'm1', paper, examType: 'A', now: 5000 });
  const user = {
    listenings: [{ id: 'x', sectionId: 'l1-a', part: 1, mode: 'exam', raw: 5, total: 10, band: 5, ts: 9000 }, { sectionId: 'BAD' }],
    readings: [{ id: 'r1', passageId: 'rd-e2', mode: 'exam', raw: 5, total: 13, band: 5, ts: 3000 }],
    writings: [{ promptId: 'w2-2', ts: 7000, band: 6, text: 'x' }],
    speakings: [{ itemId: 's1-b', ts: 100, band: 6 }],
    mocks: [mock, { id: 'broken' }],
  };
  const u = M.usageFromUser(user);
  assert.strictEqual(u.listening.get('l1-a'), 9000); // 记录比模考新，取较新的
  assert.strictEqual(u.listening.get('l2-a'), 5000);
  assert.strictEqual(u.reading.get('rd-e2'), 3000);
  assert.strictEqual(u.writing.get('w2-2'), 7000);
  assert.strictEqual(u.writing.get('w1a-1'), 5000);
  assert.strictEqual(u.speaking.get('s1-b'), 100);
  assert.strictEqual(u.speaking.get('s2-a'), 5000);
  assert.strictEqual(u.listening.has('BAD'), false);
});

test('组卷（真实题库）：结构正确，且避开每个 Part / 难度最近做过的那一个', () => {
  const lsecs = listening.getSections();
  const firstOfPart = [1, 2, 3, 4].map((p) => lsecs.find((s) => s.part === p).id);
  const passages = M.defaultPools().reading;
  const firstOfDiff = ['easy', 'medium', 'hard'].map((d) => passages.find((p) => p.difficulty === d).id);
  const user = {
    listenings: firstOfPart.map((id, i) => ({ id: `r${i}`, sectionId: id, part: i + 1, mode: 'exam', raw: 5, total: 10, band: 5, ts: Date.now() })),
    readings: firstOfDiff.map((id, i) => ({ id: `p${i}`, passageId: id, mode: 'exam', raw: 5, total: 13, band: 5, ts: Date.now() })),
  };
  const used = M.usageFromUser(user);
  for (let seed = 1; seed <= 15; seed++) {
    const r = M.assemblePaper({ examType: 'A', used, rand: seeded(seed) });
    assert.ok(r.paper, r.error);
    assert.deepStrictEqual(r.paper.listening.map((id) => listening.getSection(id).part), [1, 2, 3, 4]);
    assert.deepStrictEqual(r.paper.reading.map((id) => reading.getPassage(id).difficulty), ['easy', 'medium', 'hard']);
    for (const id of [...firstOfPart, ...firstOfDiff]) assert.ok(!allIds(r.paper).includes(id), `不该抽到最近做过的 ${id}`);
    assert.strictEqual(require('../lib/ielts').getWriting(r.paper.writing.task1).variant, 'A');
  }
});

// ---------------- 算分 ----------------
const REAL_PAPER = (() => {
  const ls = listening.getSections();
  const ps = M.defaultPools().reading;
  const ielts = require('../lib/ielts');
  const w = [...ielts.getContent().writingById.values()];
  const s = [...ielts.getContent().speakingById.values()];
  return {
    listening: [1, 2, 3, 4].map((p) => ls.find((x) => x.part === p).id),
    reading: ['easy', 'medium', 'hard'].map((d) => ps.find((x) => x.difficulty === d).id),
    writing: { task1: w.find((x) => x.task === 1 && x.variant === 'A').id, task2: w.find((x) => x.task === 2).id },
    speaking: { part1: s.find((x) => x.part === 1).id, part2: s.find((x) => x.part === 2).id },
  };
})();

// 每个听力 section 前 n[i] 题答对，其余留空。
// mcq-multi 每题的 answer 是完整正确集合，按题在组内的位置各填一个字母（都填 answer[0] 会被组内去重判错）
function listeningAnswers(paper, counts) {
  const out = {};
  paper.listening.forEach((sid, i) => {
    const sec = listening.getSection(sid);
    const a = {};
    let k = 0;
    for (const g of sec.groups) {
      g.questions.forEach((q, j) => {
        if (k++ < counts[i]) a[String(q.no)] = g.type === 'mcq-multi' ? q.answer[j] : q.answer[0];
      });
    }
    out[sid] = a;
  });
  return out;
}
// 每篇阅读前 n[i] 题答对，其余填一个必错答案
function readingAnswers(paper, counts) {
  const out = {};
  paper.reading.forEach((pid, i) => {
    const p = reading.getPassage(pid);
    const a = {};
    let k = 0;
    for (const g of p.groups) for (const q of g.questions) a[q.id] = k++ < counts[i] ? q.answer[0] : 'zzzz';
    out[pid] = a;
  });
  return out;
}
function runningMock(paper, section) {
  const m = M.createMock({ id: 'mx', paper: paper || REAL_PAPER, examType: 'A', now: 1000 });
  for (const k of M.SECTIONS) {
    if (k === section) break;
    m.sections[k].state = 'skipped';
  }
  M.beginSection(m, section, 2000);
  return m;
}
const SCORES4 = (a, b, c, d, keys) => Object.fromEntries(keys.map((k, i) => [k, [a, b, c, d][i]]));

test('听力：4 个 section 原始分相加（满分 40）后查听力换算表', () => {
  const m = runningMock(null, 'listening');
  const cases = [[[10, 10, 10, 10], 40, 9], [[8, 8, 7, 7], 30, 7], [[7, 7, 6, 6], 26, 6.5], [[5, 5, 4, 4], 18, 5.5], [[0, 0, 0, 0], 0, 1]];
  for (const [counts, raw, band] of cases) {
    const g = M.gradeSubmission(m, 'listening', { answers: listeningAnswers(REAL_PAPER, counts), durationSec: 1700 });
    assert.ok(g.graded, g.error);
    assert.strictEqual(g.graded.raw, raw);
    assert.strictEqual(g.graded.total, 40);
    assert.strictEqual(g.graded.raw40, raw);
    assert.strictEqual(g.graded.band, band, `raw ${raw}`);
    assert.deepStrictEqual(g.graded.parts.map((p) => p.raw), counts);
  }
});

test('阅读：3 篇共 39 题，折算到 40 题后查阅读换算表', () => {
  const m = runningMock(null, 'reading');
  // [每篇答对数, 原始分, 折算 40 题, band]
  const cases = [[[13, 13, 13], 39, 40, 9], [[10, 10, 10], 30, 31, 7], [[9, 9, 8], 26, 27, 6.5], [[8, 7, 7], 22, 23, 6], [[0, 0, 0], 0, 0, 1]];
  for (const [counts, raw, s40, band] of cases) {
    const g = M.gradeSubmission(m, 'reading', { answers: readingAnswers(REAL_PAPER, counts), durationSec: 3500 });
    assert.ok(g.graded, g.error);
    assert.strictEqual(g.graded.total, 39);
    assert.strictEqual(g.graded.raw, raw);
    assert.strictEqual(g.graded.scaled40, s40);
    assert.strictEqual(g.graded.band, band, `raw ${raw}`);
  }
});

test('写作加权：(Task 1 + 2 × Task 2) / 3 向下取整到 0.5', () => {
  assert.strictEqual(M.writingBand(6, 7), 6.5); // 6.67
  assert.strictEqual(M.writingBand(7, 5.5), 6); // 6.0
  assert.strictEqual(M.writingBand(5.5, 6), 5.5); // 5.83
  assert.strictEqual(M.writingBand(6.5, 6.5), 6.5);
  assert.strictEqual(M.writingBand(8, 6.5), 7); // 7.0
  assert.strictEqual(M.writingBand(0, 6), 4); // Task 1 空篇
  // 和等权平均的区别：Task 2 更差时被拉得更低
  assert.strictEqual(M.writingBand(7.5, 5.5), 6); // 等权平均是 6.5
});

test('写作提交：每篇四维向下取整，再加权；空篇记 0 分', () => {
  const m = runningMock(null, 'writing');
  const t1 = SCORES4(6, 6.5, 6, 6, M.WRITING_SCORE_KEYS[1]); // 6.125 → 6
  const t2 = SCORES4(7, 7, 7, 6.5, M.WRITING_SCORE_KEYS[2]); // 6.875 → 6.5
  const g = M.gradeSubmission(m, 'writing', {
    durationSec: 3600,
    task1: { text: 'The chart shows data.', selfScores: t1, durationSec: 1100 },
    task2: { text: 'Some people think so.', selfScores: t2, durationSec: 2500 },
  });
  assert.ok(g.graded, g.error);
  assert.strictEqual(g.graded.tasks.task1.band, 6);
  assert.strictEqual(g.graded.tasks.task2.band, 6.5);
  assert.strictEqual(g.graded.band, 6); // (6 + 13) / 3 = 6.33 → 6
  assert.strictEqual(g.graded.tasks.task1.wordCount, 4);
  const empty = M.gradeSubmission(m, 'writing', { durationSec: 3600, task1: { text: '  ' }, task2: { text: 'Essay.', selfScores: t2 } });
  assert.strictEqual(empty.graded.tasks.task1.band, 0);
  assert.strictEqual(empty.graded.band, 4); // 13 / 3 = 4.33 → 4
  assert.deepStrictEqual([empty.graded.tasks.task1.durationSec, empty.graded.tasks.task2.durationSec], [1200, 2400]); // 缺省按 1 : 2 拆
});

test('口语：四维平均向下取整到 0.5（沿用口语模块）', () => {
  const m = runningMock(null, 'speaking');
  const k = M.SPEAKING_SCORE_KEYS;
  const cases = [[[6, 6, 5.5, 6.5], 6], [[6.5, 6.5, 6, 6], 6], [[6.5, 7, 6.5, 7], 6.5], [[7, 7, 7, 6.5], 6.5], [[5, 5, 5, 5], 5]];
  for (const [vals, band] of cases) {
    const g = M.gradeSubmission(m, 'speaking', { selfScores: SCORES4(...vals, k), durationSec: 600 });
    assert.strictEqual(g.graded.band, band, vals.join(','));
  }
  const g = M.gradeSubmission(m, 'speaking', { selfScores: SCORES4(6, 6, 6, 6, k), notes: ' 卡壳 ' });
  assert.ok(g.graded.recordNotes.startsWith('[模考] Part 1：'));
  assert.ok(g.graded.recordNotes.endsWith('\n卡壳'));
});

test('总分：四项平均后按官方规则取整（.25 → .5，.75 → 整数）', () => {
  assert.strictEqual(M.overallBand([6.5, 6.5, 6, 6]), 6.5); // 6.25
  assert.strictEqual(M.overallBand([7, 7, 6.5, 7]), 7); // 6.875
  assert.strictEqual(M.overallBand([6, 6, 6, 6.5]), 6); // 6.125
  assert.strictEqual(M.overallBand([6.5, 7, 7, 6.5]), 7); // 6.75
  assert.strictEqual(M.overallBand([6.5, 6, 6, 6]), 6); // 6.125
  assert.strictEqual(M.overallBand([6.5, 6.5, 6.5, 6]), 6.5); // 6.375
  assert.strictEqual(M.overallBand([9, 9, 9, 9]), 9);
  assert.strictEqual(M.overallBand([6, null, 6, 6]), null);
});

test('出分：有部分被放弃时不出总分', () => {
  const m = M.createMock({ id: 'mz', paper: REAL_PAPER, examType: 'A', now: 1 });
  Object.assign(m.sections.listening, { state: 'done', band: 7 });
  Object.assign(m.sections.reading, { state: 'skipped' });
  Object.assign(m.sections.writing, { state: 'done', band: 6 });
  Object.assign(m.sections.speaking, { state: 'done', band: 6 });
  assert.deepStrictEqual(M.computeResult(m), { listening: 7, reading: null, writing: 6, speaking: 6, complete: false, overall: null });
  m.sections.reading = { state: 'done', band: 6.5 };
  assert.deepStrictEqual(M.computeResult(m), { listening: 7, reading: 6.5, writing: 6, speaking: 6, complete: true, overall: 6.5 });
});

// ---------------- 状态机与中断续做 ----------------
test('状态机：按顺序进行，未开始不能提交，已完成不能再操作', () => {
  const m = M.createMock({ id: 'm2', paper: REAL_PAPER, examType: 'A', now: 1 });
  assert.strictEqual(M.currentSection(m), 'listening');
  assert.match(M.beginSection(m, 'reading', 2).error, /请先完成听力/);
  assert.match(M.submitError(m, 'listening'), /还没开始/);
  assert.ok(M.beginSection(m, 'listening', 3).ok);
  assert.strictEqual(M.submitError(m, 'listening'), null);
  const g = M.gradeSubmission(m, 'listening', { answers: {}, durationSec: 10 });
  M.applySubmit(m, 'listening', g.graded, { all: [], writing: {} }, 4);
  assert.strictEqual(M.currentSection(m), 'reading');
  assert.match(M.beginSection(m, 'listening', 5).error, /已保存/);
  assert.match(M.finishMock(m, 6).error, /阅读、写作、口语/);
});

test('中断续做：计时中的部分可以重新开始（restarts + 1、开始时间重置）或放弃', () => {
  const m = M.createMock({ id: 'm3', paper: REAL_PAPER, examType: 'A', now: 1 });
  M.abandonSection(m, 'listening', 2);
  assert.strictEqual(m.sections.listening.state, 'skipped');
  M.beginSection(m, 'reading', 100);
  // 中断后回来：服务端仍是 running，前端据此只给「重新开始 / 放弃」
  assert.strictEqual(m.sections.reading.state, 'running');
  assert.strictEqual(M.currentSection(m), 'reading');
  const again = M.beginSection(m, 'reading', 500);
  assert.deepStrictEqual(again, { ok: true, restarted: true });
  assert.strictEqual(m.sections.reading.restarts, 1);
  assert.strictEqual(m.sections.reading.startedAt, 500);
  assert.ok(M.abandonSection(m, 'reading', 600).ok);
  assert.strictEqual(M.currentSection(m), 'writing');
  M.abandonSection(m, 'writing', 700);
  M.abandonSection(m, 'speaking', 800);
  const f = M.finishMock(m, 900);
  assert.deepStrictEqual(f, { ok: true, anyDone: false });
  assert.strictEqual(m.status, 'finished');
  assert.strictEqual(m.result.overall, null);
  assert.match(M.beginSection(m, 'speaking', 1000).error, /已出分/);
  assert.match(M.abandonMock(m, 1000).error, /已出分/);
});

test('请求体校验：section / action / 多余字段 / 作答格式', () => {
  assert.match(M.parseSectionRequest(null).error, /JSON 对象/);
  assert.match(M.parseSectionRequest({ section: 'math', action: 'begin' }).error, /section/);
  assert.match(M.parseSectionRequest({ section: 'reading', action: 'go' }).error, /action/);
  assert.match(M.parseSectionRequest({ section: 'reading', action: 'begin', answers: {} }).error, /不支持的字段/);
  assert.match(M.parseSectionRequest({ section: 'reading', action: 'submit', text: 'x' }).error, /不支持的字段/);
  assert.deepStrictEqual(M.parseSectionRequest({ section: 'reading', action: 'submit', answers: {}, durationSec: 1 }), { section: 'reading', action: 'submit' });

  const L = runningMock(null, 'listening');
  assert.match(M.gradeSubmission(L, 'listening', { answers: [] }).error, /answers/);
  assert.match(M.gradeSubmission(L, 'listening', { answers: { 'l9-zzz': {} } }).error, /不属于本套/);
  assert.match(M.gradeSubmission(L, 'listening', { answers: { [REAL_PAPER.listening[0]]: { 99: 'x' } } }).error, /不存在的题号/);
  assert.match(M.gradeSubmission(L, 'listening', { answers: { [REAL_PAPER.listening[0]]: { 1: 'x'.repeat(101) } } }).error, /100/);
  assert.match(M.gradeSubmission(L, 'listening', { answers: {}, durationSec: -1 }).error, /durationSec/);
  assert.match(M.gradeSubmission(L, 'listening', { answers: {}, durationSec: 1.5 }).error, /durationSec/);

  const R = runningMock(null, 'reading');
  assert.match(M.gradeSubmission(R, 'reading', { answers: { [REAL_PAPER.reading[0]]: { q99: 'x' } } }).error, /不存在的题号/);
  assert.match(M.gradeSubmission(R, 'reading', { answers: { [REAL_PAPER.reading[0]]: { q1: 3 } } }).error, /字符串/);
  assert.match(M.gradeSubmission(R, 'reading', { answers: { [REAL_PAPER.reading[0]]: { q1: 'x'.repeat(201) } } }).error, /200/);
  assert.ok(M.gradeSubmission(R, 'reading', { answers: {} }).graded, '阅读允许全空交卷');

  const W = runningMock(null, 'writing');
  const ok1 = SCORES4(6, 6, 6, 6, M.WRITING_SCORE_KEYS[1]);
  const ok2 = SCORES4(6, 6, 6, 6, M.WRITING_SCORE_KEYS[2]);
  assert.match(M.gradeSubmission(W, 'writing', { task1: { text: 'x', selfScores: ok1 } }).error, /task2/);
  assert.match(M.gradeSubmission(W, 'writing', { task1: { text: 'x' }, task2: { text: 'y', selfScores: ok2 } }).error, /task1\.selfScores/);
  assert.match(M.gradeSubmission(W, 'writing', { task1: { text: '', selfScores: ok1 }, task2: { text: 'y', selfScores: ok2 } }).error, /空篇/);
  assert.match(M.gradeSubmission(W, 'writing', { task1: { text: 'x', selfScores: ok2 }, task2: { text: 'y', selfScores: ok2 } }).error, /TR/);
  assert.match(M.gradeSubmission(W, 'writing', { task1: { text: 'x', selfScores: { ...ok1, TA: 6.3 } }, task2: { text: 'y', selfScores: ok2 } }).error, /步长/);
  assert.match(M.gradeSubmission(W, 'writing', { task1: { text: 'x', selfScores: ok1, extra: 1 }, task2: { text: 'y', selfScores: ok2 } }).error, /不支持/);
  assert.match(M.gradeSubmission(W, 'writing', { task1: { text: 'x'.repeat(20001), selfScores: ok1 }, task2: { text: 'y', selfScores: ok2 } }).error, /20000/);

  const S = runningMock(null, 'speaking');
  assert.match(M.gradeSubmission(S, 'speaking', {}).error, /selfScores/);
  assert.match(M.gradeSubmission(S, 'speaking', { selfScores: SCORES4(6, 6, 6, 6, M.SPEAKING_SCORE_KEYS), notes: 5 }).error, /notes/);
  assert.match(M.gradeSubmission(S, 'speaking', { selfScores: SCORES4(6, 6, 6, 6, M.SPEAKING_SCORE_KEYS), durationSec: 3601 }).error, /durationSec/);
});

test('记录清洗：丢弃结构不合法的模考，最多保留 50 条', () => {
  const good = (i) => M.createMock({ id: `m-${i}`, paper: REAL_PAPER, examType: 'A', now: 1000 + i });
  const bads = [
    null, { ...good(0), id: 'bad id' }, { ...good(0), status: 'paused' }, { ...good(0), paper: { ...REAL_PAPER, reading: ['a'] } },
    { ...good(0), sections: { ...good(0).sections, reading: { state: 'done', restarts: 0, startedAt: 1, submittedAt: 2 } } },
    { ...good(0), status: 'finished', finishedAt: 5, result: null },
  ];
  assert.deepStrictEqual(M.sanitizeMocks([...bads, good(1)]).map((m) => m.id), ['m-1']);
  const many = Array.from({ length: 60 }, (_, i) => good(i));
  const kept = M.sanitizeMocks(many);
  assert.strictEqual(kept.length, 50);
  assert.strictEqual(kept[0].id, 'm-10');
  assert.strictEqual(M.activeMock(kept).id, 'm-59');
});

test('对比：与上一次出分的模考逐项求差，缺分的项为 null', () => {
  const mk = (id, at, result) => ({ ...M.createMock({ id, paper: REAL_PAPER, examType: 'A', now: at }), status: 'finished', finishedAt: at, result });
  const a = mk('a', 100, { listening: 6, reading: 6, writing: 5.5, speaking: 6, overall: 6, complete: true });
  const b = mk('b', 200, { listening: 6.5, reading: null, writing: 6, speaking: 6, overall: null, complete: false });
  const c = mk('c', 300, { listening: 7, reading: 6.5, writing: 6, speaking: 5.5, overall: 6.5, complete: true });
  assert.strictEqual(M.previousFinished([a, b, c], c).id, 'b');
  assert.strictEqual(M.previousFinished([a, b, c], a), null);
  assert.deepStrictEqual(M.compareResults(c, b).deltas, { listening: 0.5, reading: null, writing: 0, speaking: -0.5, overall: null });
  assert.deepStrictEqual(M.compareResults(c, a).deltas, { listening: 1, reading: 0.5, writing: 0.5, speaking: -0.5, overall: 0.5 });
});

test('摘要填空的错题题干：取占位符所在句子', () => {
  const t = 'Bees visit flowers. They collect {q8} from plants and store it in {q9}. Then they rest.';
  assert.strictEqual(M.summarySnippet(t, 'q8'), 'They collect _____ from plants and store it in ___.');
  assert.strictEqual(M.summarySnippet(t, 'q7'), '');
});

// ---------------- 听力新题型：判分去重与复盘 ----------------
// 夹具：lx-wetland-tour（Part 2：多选 11–12 答案 B、D；地图 16–20）、lx-river-project（Part 3：三选 21–23；二选 24–25；流程图 26–30）
const NEW_TYPES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ielts-listening', 'new-types.json'), 'utf8'));
const NEW_BY_ID = new Map(NEW_TYPES.map((s) => [s.id, s]));
const NEW_GETTERS = { getSection: (id) => NEW_BY_ID.get(id) || listening.getSection(id) };
const NEW_PAPER = { ...REAL_PAPER, listening: [REAL_PAPER.listening[0], 'lx-wetland-tour', 'lx-river-project', REAL_PAPER.listening[3]] };

test('模考听力：多选组内去重计分，复盘的多选题干取组 prompt、正确答案给全部选项文字', () => {
  const m = runningMock(NEW_PAPER, 'listening');
  const answers = {
    'lx-wetland-tour': { 11: 'B', 12: 'b', 16: 'B', 17: 'B', 18: 'c' }, // 12 与 11 重复只算 1 分；17 选错
    'lx-river-project': { 21: 'E', 22: 'a', 23: 'C', 24: 'A', 25: 'D', 26: 'sieved', 27: 'the oven' }, // 25 选错；27 超字数
  };
  const g = M.gradeSubmission(m, 'listening', { answers, durationSec: 1800 }, NEW_GETTERS);
  assert.ok(g.graded, g.error);
  assert.deepStrictEqual(g.graded.parts.map((p) => p.raw), [0, 3, 5, 0]);
  assert.strictEqual(g.graded.raw, 8);
  M.applySubmit(m, 'listening', g.graded, { all: [], writing: {} }, 3000);
  for (const k of ['reading', 'writing', 'speaking']) m.sections[k].state = 'skipped';
  Object.assign(m, { status: 'finished', finishedAt: 4000 });

  const review = M.mockView(m, { getters: NEW_GETTERS, now: 5000 }).review.listening;
  assert.deepStrictEqual(review.map((p) => p.sectionId), NEW_PAPER.listening);
  const wrongOf = (sid, no) => review.find((p) => p.sectionId === sid).wrong.find((w) => w.no === no);

  const multi = wrongOf('lx-wetland-tour', 12);
  assert.deepStrictEqual(multi, {
    no: 12, type: 'mcq-multi', prompt: 'Which TWO things are visitors NOT allowed to do at the reserve?',
    yours: 'b', yoursText: 'feed the birds', answer: ['B', 'D'], answerText: 'feed the birds / bring dogs',
    overLimit: false, explanation: NEW_BY_ID.get('lx-wetland-tour').groups[0].questions[1].explanation,
  });
  assert.strictEqual(wrongOf('lx-wetland-tour', 11), undefined, '第 11 题填 B 算对');
  const three = wrongOf('lx-river-project', 25);
  assert.strictEqual(three.prompt, 'Which TWO problems did the students have during the fieldwork?');
  assert.strictEqual(three.answerText, 'bad weather / broken equipment');
  assert.strictEqual(three.yoursText, 'getting lost');

  const map = wrongOf('lx-wetland-tour', 17);
  assert.strictEqual(map.type, 'map-labelling');
  assert.strictEqual(map.prompt, 'willow tunnel');
  assert.deepStrictEqual(map.answer, ['A']);
  assert.strictEqual(map.answerText, '', '地图题选项没有文字');
  assert.strictEqual(map.yoursText, '');

  const flow = wrongOf('lx-river-project', 27);
  assert.strictEqual(flow.type, 'flowchart-completion');
  assert.strictEqual(flow.prompt, 'Mud dried in an ___ overnight');
  assert.strictEqual(flow.overLimit, true);
  assert.strictEqual(flow.answerText, '');
  const blank = wrongOf('lx-river-project', 28);
  assert.strictEqual(blank.yours, '');
});

// ---------------- 接口集成（临时档案）----------------
async function integration() {
  const express = require('express');
  const profile = require('../lib/profile');
  const ielts = require('../lib/ielts');
  const original = profile.currentId();
  const created = profile.create(`mock-test-${Date.now().toString(36)}`);
  assert.ok(created.ok, created.error);
  const tempId = created.id;
  let server = null;
  const cleanup = () => {
    try {
      if (profile.currentId() !== original) profile.switchTo(original);
      profile.remove(tempId);
      const trash = path.join(__dirname, '..', 'data', 'profiles', '.trash');
      if (fs.existsSync(trash)) {
        for (const d of fs.readdirSync(trash)) if (d.startsWith(`${tempId}-`)) fs.rmSync(path.join(trash, d), { recursive: true, force: true });
        if (!fs.readdirSync(trash).length) fs.rmdirSync(trash);
      }
    } catch (e) {
      console.error(`清理临时档案失败（${tempId}），请手动切回档案 ${original}：${e.message}`);
    }
  };
  const onSig = () => {
    cleanup();
    process.exit(130);
  };
  process.once('SIGINT', onSig);
  process.once('SIGTERM', onSig);
  try {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api', require('../routes/ielts-mock'));
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (method, url, body) => {
      const r = await fetch(base + url, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    };
    await runIntegration(call, ielts);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    cleanup();
    process.removeListener('SIGINT', onSig);
    process.removeListener('SIGTERM', onSig);
  }
}

async function runIntegration(call, ielts) {
  const S4 = (keys, v) => Object.fromEntries(keys.map((k) => [k, v]));
  let first = null;

  await testAsync('接口：空档案的历史列表', async () => {
    const r = await call('GET', '/ielts/mocks');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data, { total: 0, activeId: null, items: [] });
    assert.strictEqual((await call('GET', '/ielts/mocks?limit=0')).status, 400);
    assert.strictEqual((await call('GET', '/ielts/mocks?limit=abc')).status, 400);
  });

  await testAsync('接口：组卷、409 冲突、400 / 404', async () => {
    assert.strictEqual((await call('POST', '/ielts/mock/start', { replaceActive: 'yes' })).status, 400);
    assert.strictEqual((await call('POST', '/ielts/mock/start', { foo: 1 })).status, 400);
    assert.strictEqual((await call('POST', '/ielts/mock/start', '[1]')).status, 400);
    const r = await call('POST', '/ielts/mock/start', {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    first = r.data.mock;
    assert.strictEqual(first.status, 'in-progress');
    assert.strictEqual(first.current, 'listening');
    assert.strictEqual(first.paper.listening.length, 4);
    assert.strictEqual(first.paper.reading.length, 3);
    assert.strictEqual(first.result, undefined);
    const again = await call('POST', '/ielts/mock/start', {});
    assert.strictEqual(again.status, 409);
    assert.strictEqual(again.data.activeId, first.id);
    assert.strictEqual((await call('GET', '/ielts/mock/bad!id')).status, 400);
    assert.strictEqual((await call('GET', '/ielts/mock/no-such-mock')).status, 404);
    assert.strictEqual((await call('POST', '/ielts/mock/no-such-mock/section', { section: 'listening', action: 'begin' })).status, 404);
    assert.strictEqual((await call('POST', '/ielts/mock/no-such-mock/finish', {})).status, 404);
  });

  await testAsync('接口：顺序与状态校验', async () => {
    const id = first.id;
    const rb = await call('POST', `/ielts/mock/${id}/section`, { section: 'reading', action: 'begin' });
    assert.strictEqual(rb.status, 400);
    assert.match(rb.data.error, /请先完成听力/);
    const early = await call('POST', `/ielts/mock/${id}/section`, { section: 'listening', action: 'submit', answers: {} });
    assert.strictEqual(early.status, 400);
    assert.match(early.data.error, /还没开始/);
    assert.strictEqual((await call('POST', `/ielts/mock/${id}/section`, { section: 'listening', action: 'pause' })).status, 400);
    assert.strictEqual((await call('POST', `/ielts/mock/${id}/finish`, {})).status, 400);
    assert.strictEqual((await call('POST', `/ielts/mock/${id}/finish`, { abandon: 'yes' })).status, 400);
  });

  await testAsync('接口：听力开始 → 中断后重新开始 → 全对提交，写入 listenings', async () => {
    const id = first.id;
    const b1 = await call('POST', `/ielts/mock/${id}/section`, { section: 'listening', action: 'begin' });
    assert.strictEqual(b1.status, 200);
    assert.strictEqual(b1.data.mock.sections.listening.state, 'running');
    // 中断：页面会话丢失，回来 GET 仍是 running → 只能重新开始或放弃
    const g = await call('GET', `/ielts/mock/${id}`);
    assert.strictEqual(g.data.sections.listening.state, 'running');
    assert.strictEqual(g.data.current, 'listening');
    const b2 = await call('POST', `/ielts/mock/${id}/section`, { section: 'listening', action: 'begin' });
    assert.strictEqual(b2.data.restarted, true);
    assert.strictEqual(b2.data.mock.sections.listening.restarts, 1);
    const bad = await call('POST', `/ielts/mock/${id}/section`, { section: 'listening', action: 'submit', answers: { 'not-in-paper': {} } });
    assert.strictEqual(bad.status, 400);
    const s = await call('POST', `/ielts/mock/${id}/section`, {
      section: 'listening', action: 'submit', durationSec: 1600, answers: listeningAnswers(first.paper, [10, 10, 10, 10]),
    });
    assert.strictEqual(s.status, 200, JSON.stringify(s.data));
    assert.strictEqual(s.data.mock.current, 'reading');
    assert.strictEqual(s.data.mock.sections.listening.state, 'done');
    assert.strictEqual(s.data.mock.result, undefined, '进行中不透露分数');
    const user = ielts.loadUser();
    const recs = user.listenings.filter((r) => r.mockId === id);
    assert.strictEqual(recs.length, 4);
    assert.ok(recs.every((r) => r.mode === 'exam' && r.raw === r.total && r.durationSec === 400));
    const again = await call('POST', `/ielts/mock/${id}/section`, { section: 'listening', action: 'begin' });
    assert.strictEqual(again.status, 400);
  });

  await testAsync('接口：阅读、写作、口语提交并出分，写入各模块记录和学习活动', async () => {
    const id = first.id;
    await call('POST', `/ielts/mock/${id}/section`, { section: 'reading', action: 'begin' });
    const rs = await call('POST', `/ielts/mock/${id}/section`, {
      section: 'reading', action: 'submit', durationSec: 3500, answers: readingAnswers(first.paper, [10, 10, 10]),
    });
    assert.strictEqual(rs.status, 200, JSON.stringify(rs.data));
    await call('POST', `/ielts/mock/${id}/section`, { section: 'writing', action: 'begin' });
    const ws = await call('POST', `/ielts/mock/${id}/section`, {
      section: 'writing', action: 'submit', durationSec: 3550,
      task1: { text: 'The chart compares three countries.', selfScores: S4(M.WRITING_SCORE_KEYS[1], 6), durationSec: 1150 },
      task2: { text: 'It is often argued that cities grow.', selfScores: S4(M.WRITING_SCORE_KEYS[2], 7), durationSec: 2400 },
    });
    assert.strictEqual(ws.status, 200, JSON.stringify(ws.data));
    const early = await call('POST', `/ielts/mock/${id}/finish`, {});
    assert.strictEqual(early.status, 400);
    await call('POST', `/ielts/mock/${id}/section`, { section: 'speaking', action: 'begin' });
    const ss = await call('POST', `/ielts/mock/${id}/section`, {
      section: 'speaking', action: 'submit', durationSec: 780, selfScores: { FC: 6, LR: 6, GRA: 5.5, P: 6.5 }, notes: '第一次模考',
    });
    assert.strictEqual(ss.status, 200, JSON.stringify(ss.data));
    assert.strictEqual(ss.data.mock.current, null);

    const f = await call('POST', `/ielts/mock/${id}/finish`, {});
    assert.strictEqual(f.status, 200, JSON.stringify(f.data));
    const v = f.data.mock;
    assert.strictEqual(v.status, 'finished');
    // 听力 40/40 → 9；阅读 30/39 → 31 → 7；写作 (6 + 2 × 7) / 3 = 6.67 → 6.5；口语 6.0 → 6；总分 (9 + 7 + 6.5 + 6) / 4 = 7.125 → 7
    assert.deepStrictEqual(v.result, { listening: 9, reading: 7, writing: 6.5, speaking: 6, complete: true, overall: 7 });
    assert.deepStrictEqual(v.scores.reading, { raw: 30, total: 39, scaled40: 31 });
    assert.strictEqual(v.compare, null);
    assert.strictEqual(v.review.listening.length, 4);
    assert.ok(v.review.listening.every((p) => p.wrong.length === 0));
    assert.strictEqual(v.review.reading.length, 3);
    assert.deepStrictEqual(v.review.reading.map((p) => p.offset), [0, 13, 26]);
    assert.deepStrictEqual(v.review.reading.map((p) => p.wrong.length), [3, 3, 3]);
    const w0 = v.review.reading[1].wrong[0];
    assert.strictEqual(w0.displayNo, 13 + w0.number);
    assert.ok(w0.explanation && w0.answer.length && w0.prompt !== undefined);
    assert.strictEqual(v.review.writing.task2.band, 7);

    const user = ielts.loadUser();
    assert.strictEqual(user.readings.filter((r) => r.mockId === id).length, 3);
    const wr = user.writings.filter((r) => r.mockId === id);
    assert.deepStrictEqual(wr.map((r) => [r.task, r.band, r.durationSec]), [[1, 6, 1150], [2, 7, 2400]]);
    const sp = user.speakings.filter((r) => r.mockId === id);
    assert.strictEqual(sp.length, 1);
    assert.strictEqual(sp[0].itemId, first.paper.speaking.part2);
    assert.ok(sp[0].notes.startsWith('[模考] Part 1：') && sp[0].notes.endsWith('第一次模考'));
    const log = require('../lib/activity').load().log.filter((e) => e.source === 'ielts-mock');
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].correct, true);
    assert.strictEqual((await call('POST', `/ielts/mock/${id}/finish`, {})).status, 400);
    assert.strictEqual((await call('POST', `/ielts/mock/${id}/section`, { section: 'speaking', action: 'begin' })).status, 400);
  });

  await testAsync('接口：第二套避开第一套的内容；放弃部分后不出总分，与上一次对比', async () => {
    const r = await call('POST', '/ielts/mock/start', {});
    assert.strictEqual(r.status, 200);
    const second = r.data.mock;
    // 真实题库每个 Part、每个难度都有 2 个，第二套应全部换新
    for (const sid of second.paper.listening) assert.ok(!first.paper.listening.includes(sid), sid);
    for (const pid of second.paper.reading) assert.ok(!first.paper.reading.includes(pid), pid);
    assert.notStrictEqual(second.paper.writing.task1, first.paper.writing.task1);
    assert.notStrictEqual(second.paper.speaking.part2, first.paper.speaking.part2);

    const id = second.id;
    const ab = await call('POST', `/ielts/mock/${id}/section`, { section: 'listening', action: 'abandon' });
    assert.strictEqual(ab.data.mock.sections.listening.state, 'skipped');
    await call('POST', `/ielts/mock/${id}/section`, { section: 'reading', action: 'begin' });
    await call('POST', `/ielts/mock/${id}/section`, {
      section: 'reading', action: 'submit', durationSec: 3600, answers: readingAnswers(second.paper, [9, 9, 8]),
    });
    await call('POST', `/ielts/mock/${id}/section`, { section: 'writing', action: 'begin' });
    await call('POST', `/ielts/mock/${id}/section`, {
      section: 'writing', action: 'submit', durationSec: 3600,
      task1: { text: '' }, task2: { text: 'An essay.', selfScores: S4(M.WRITING_SCORE_KEYS[2], 6) },
    });
    await call('POST', `/ielts/mock/${id}/section`, { section: 'speaking', action: 'abandon' });
    const f = await call('POST', `/ielts/mock/${id}/finish`, {});
    assert.strictEqual(f.status, 200);
    const v = f.data.mock;
    assert.deepStrictEqual(v.result, { listening: null, reading: 6.5, writing: 4, speaking: null, complete: false, overall: null });
    assert.strictEqual(v.compare.previous.id, first.id);
    assert.deepStrictEqual(v.compare.deltas, { listening: null, reading: -0.5, writing: -2.5, speaking: null, overall: null });
    const user = ielts.loadUser();
    assert.strictEqual(user.writings.filter((w) => w.mockId === id).length, 1, '空篇不写进写作记录');
    const log = require('../lib/activity').load().log.filter((e) => e.source === 'ielts-mock');
    assert.deepStrictEqual(log.map((e) => e.correct), [true, false]);
  });

  await testAsync('接口：放弃整套、replaceActive、历史列表与坏数据过滤', async () => {
    const a = (await call('POST', '/ielts/mock/start', {})).data.mock;
    const b = await call('POST', '/ielts/mock/start', { replaceActive: true });
    assert.strictEqual(b.status, 200);
    assert.strictEqual((await call('GET', `/ielts/mock/${a.id}`)).data.status, 'abandoned');
    const ab = await call('POST', `/ielts/mock/${b.data.mock.id}/finish`, { abandon: true });
    assert.strictEqual(ab.status, 200);
    assert.strictEqual(ab.data.mock.status, 'abandoned');
    assert.strictEqual((await call('POST', `/ielts/mock/${b.data.mock.id}/section`, { section: 'listening', action: 'begin' })).status, 400);

    // 手工塞一条坏记录：读取时被过滤，不影响列表
    const user = ielts.loadUser();
    user.mocks.push({ id: 'broken', status: 'weird' });
    ielts.saveUser(user);
    const list = await call('GET', '/ielts/mocks');
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.data.total, 4);
    assert.strictEqual(list.data.activeId, null);
    assert.deepStrictEqual(list.data.items.map((x) => x.status), ['abandoned', 'abandoned', 'finished', 'finished']);
    assert.strictEqual(list.data.items[3].id, first.id);
    assert.strictEqual(list.data.items[3].result.overall, 7);
    assert.strictEqual((await call('GET', '/ielts/mocks?limit=2')).data.items.length, 2);
  });
}

(async () => {
  try {
    await integration();
  } catch (e) {
    failed++;
    console.error(`FAIL: 接口集成测试没能运行：${e.stack || e.message}`);
  }
  console.log(`\n雅思模考测试：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
