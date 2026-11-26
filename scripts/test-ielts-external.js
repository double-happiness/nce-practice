'use strict';
// 剑雅成绩录入与整套优先估分测试：请求体校验、原始分换算、记录清洗与视图、整套成绩点提取、四种估分口径、
// 以及接口集成（增删查、400 / 404、tickPlan 打勾、/ielts/summary 按整套优先计算）。
// 用法：node scripts/test-ielts-external.js
//
// 【隔离】纯函数测试不读写档案。接口集成测试在进程内起只挂 routes/ielts.js 与 routes/ielts-external.js 的 Express，
// 用 lib/profile.js 新建临时档案（create 会自动切过去），结束时切回原档案、删除临时档案并清掉 data/profiles/.trash/ 里的对应目录。
// 与其他接口测试一样，被 kill -9 硬杀时当前档案会停在临时档案上，需要手动切回；运行期间不要同时操作同一数据目录的服务。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ielts = require('../lib/ielts');
const E = require('../lib/ielts-external');
const S = require('../lib/ielts-estimate');
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

const TODAY = '2026-11-26';
const CTX_A = { examType: 'A', today: TODAY };
const CTX_G = { examType: 'G', today: TODAY };
const DAY = 86400000;
const tsOf = (date, hour) => new Date(`${date}T${String(hour == null ? 12 : hour).padStart(2, '0')}:00:00`).getTime();

function parsed(body, ctx) {
  const r = E.parseInput(body, ctx || CTX_A);
  assert.ok(!r.error, `不应报错：${r.error}`);
  return r;
}
function errOf(body, ctx) {
  const r = E.parseInput(body, ctx || CTX_A);
  assert.ok(r.error, `应报错：${JSON.stringify(body)}`);
  return r.error;
}
function extRecord(id, date, skills, ts) {
  const input = parsed({ date, ...skills }).input;
  return E.buildRecord(input, id, ts || tsOf(date));
}

// 构造一套结构合法的模考记录：bands 里给出的部分置为 done，其余保持 pending
const PAPER = {
  listening: ['l1-a', 'l2-a', 'l3-a', 'l4-a'],
  reading: ['rd-a', 'rd-b', 'rd-c'],
  writing: { task1: 'w1', task2: 'w2' },
  speaking: { part1: 's1', part2: 's2' },
};
function mockWith(id, ts, bands) {
  const m = M.createMock({ id, paper: JSON.parse(JSON.stringify(PAPER)), examType: 'A', now: ts });
  for (const [k, band] of Object.entries(bands)) {
    const s = { state: 'done', startedAt: ts, submittedAt: ts + 1000, restarts: 0, durationSec: 60, band };
    if (k === 'listening' || k === 'reading') Object.assign(s, { raw: 30, total: 40 });
    if (k === 'writing') s.tasks = {};
    if (k === 'speaking') s.selfScores = {};
    m.sections[k] = s;
  }
  assert.ok(M.isValidMock(m), '构造的模考记录应通过 isValidMock');
  return m;
}

// ---------------- 请求体校验与换算 ----------------
test('parseInput：完整录入，听力 / 学术类阅读按原始分查表', () => {
  const r = parsed({ date: TODAY, book: 18, test: 2, listening: { raw: 31 }, reading: { raw: 27 }, writing: { band: 6 }, tickPlan: true });
  assert.strictEqual(r.tickPlan, true);
  const x = r.input;
  assert.deepStrictEqual(x.listening, { raw: 31, band: listening.bandFrom40(31), bandFrom: 'table' });
  assert.deepStrictEqual(x.reading, { raw: 27, band: reading.bandFrom40(27), bandFrom: 'table' });
  assert.strictEqual(x.listening.band, 7, '听力 31/40 → 7.0');
  assert.strictEqual(x.reading.band, 6.5, '学术类阅读 27/40 → 6.5');
  assert.deepStrictEqual(x.writing, { band: 6 });
  assert.strictEqual(x.speaking, null);
  assert.strictEqual(x.examType, 'A');
  assert.strictEqual(x.title, '');
  assert.strictEqual(x.notes, '');
});

test('parseInput：填了 band 以 band 为准；只填 band 时 raw 为 null', () => {
  const x = parsed({ date: TODAY, listening: { raw: 31, band: 7.5 }, reading: { band: 6 } }).input;
  assert.deepStrictEqual(x.listening, { raw: 31, band: 7.5, bandFrom: 'manual' });
  assert.deepStrictEqual(x.reading, { raw: null, band: 6, bandFrom: 'manual' });
  assert.strictEqual(parsed({ date: TODAY, listening: { raw: 20 } }).tickPlan, false, 'tickPlan 缺省为 false');
});

test('parseInput：G 类阅读没有内置表，只给原始分时报错；听力 G 类照常换算', () => {
  assert.ok(errOf({ date: TODAY, reading: { raw: 30 } }, CTX_G).includes('G 类阅读'));
  const x = parsed({ date: TODAY, listening: { raw: 30 }, reading: { raw: 30, band: 6 } }, CTX_G).input;
  assert.strictEqual(x.examType, 'G');
  assert.strictEqual(x.listening.bandFrom, 'table');
  assert.deepStrictEqual(x.reading, { raw: 30, band: 6, bandFrom: 'manual' });
});

test('parseInput：日期、范围、字段的各种非法输入都报错', () => {
  assert.ok(errOf({ date: '2026-11-27', listening: { raw: 1 } }).includes('未来'));
  assert.ok(errOf({ date: ielts.addDays(TODAY, -(E.MAX_PAST_DAYS + 1)), listening: { raw: 1 } }).includes('补录'));
  parsed({ date: ielts.addDays(TODAY, -E.MAX_PAST_DAYS), listening: { raw: 1 } });
  errOf({ date: '2026-02-30', listening: { raw: 1 } });
  errOf({ listening: { raw: 1 } });
  assert.ok(errOf({ date: TODAY }).includes('至少填一项'));
  assert.ok(errOf({ date: TODAY, listening: null, reading: null }).includes('至少填一项'));
  errOf({ date: TODAY, listening: { raw: 41 } });
  errOf({ date: TODAY, listening: { raw: -1 } });
  errOf({ date: TODAY, listening: { raw: 30.5 } });
  errOf({ date: TODAY, listening: { raw: '30' } });
  errOf({ date: TODAY, listening: {} });
  errOf({ date: TODAY, listening: { raw: 30, extra: 1 } });
  errOf({ date: TODAY, listening: 30 });
  errOf({ date: TODAY, writing: { band: 6.25 } });
  errOf({ date: TODAY, writing: { band: 9.5 } });
  errOf({ date: TODAY, writing: {} });
  errOf({ date: TODAY, writing: { raw: 30 } });
  errOf({ date: TODAY, speaking: { band: 6 }, book: 0 });
  errOf({ date: TODAY, speaking: { band: 6 }, book: 31 });
  errOf({ date: TODAY, speaking: { band: 6 }, test: 5 });
  errOf({ date: TODAY, speaking: { band: 6 }, title: 'x'.repeat(E.MAX_TITLE + 1) });
  errOf({ date: TODAY, speaking: { band: 6 }, notes: 'x'.repeat(E.MAX_NOTES + 1) });
  errOf({ date: TODAY, speaking: { band: 6 }, tickPlan: 'yes' });
  assert.ok(errOf({ date: TODAY, speaking: { band: 6 }, foo: 1 }).includes('foo'));
  errOf(null);
  errOf([1]);
  const t = parsed({ date: TODAY, speaking: { band: 6 }, title: '  剑雅 18 T2  ', book: null, test: null }).input;
  assert.strictEqual(t.title, '剑雅 18 T2', 'title 去掉首尾空白');
});

// ---------------- 记录清洗与视图 ----------------
test('sanitizeExternalTests：丢弃畸形记录，按日期再按录入时间升序，最多保留 MAX_EXTERNAL 条', () => {
  const a = extRecord('a', '2026-11-20', { listening: { raw: 30 } }, tsOf('2026-11-25'));
  const b = extRecord('b', '2026-11-18', { listening: { raw: 25 } }, tsOf('2026-11-26'));
  const c = extRecord('c', '2026-11-20', { reading: { raw: 25 } }, tsOf('2026-11-21'));
  const bad = [
    { ...a, id: 'bad id' },
    { ...a, date: '2026-13-01' },
    { ...a, listening: { raw: 50, band: 7, bandFrom: 'table' } },
    { ...a, listening: { raw: 30, band: 7, bandFrom: 'guess' } },
    { ...a, writing: { band: 6.3 } },
    { ...a, listening: null },
    { ...a, examType: 'X' },
    'x',
    null,
  ];
  assert.deepStrictEqual(E.sanitizeExternalTests([a, ...bad, b, c]).map((r) => r.id), ['b', 'c', 'a']);
  assert.deepStrictEqual(E.sanitizeExternalTests('oops'), []);
  const many = Array.from({ length: E.MAX_EXTERNAL + 5 }, (_, i) => ({ ...a, id: `r${i}`, ts: a.ts + i }));
  const kept = E.sanitizeExternalTests(many);
  assert.strictEqual(kept.length, E.MAX_EXTERNAL);
  assert.strictEqual(kept[kept.length - 1].id, `r${E.MAX_EXTERNAL + 4}`, '保留最新的');
});

test('视图：显示标题与四项齐全时的总分', () => {
  assert.strictEqual(E.displayTitle({ title: '自拟', book: 18, test: 2 }), '自拟');
  assert.strictEqual(E.displayTitle({ title: '', book: 18, test: 2 }), '剑雅 18 Test 2');
  assert.strictEqual(E.displayTitle({ title: '', book: 18, test: null }), '剑雅 18');
  assert.strictEqual(E.displayTitle({ title: '', book: null, test: 3 }), '外部模考 Test 3');
  assert.strictEqual(E.displayTitle({ title: '', book: null, test: null }), '外部模考');
  const full = extRecord('f', TODAY, { listening: { raw: 31 }, reading: { raw: 27 }, writing: { band: 6 }, speaking: { band: 6 } });
  const v = E.externalView(full);
  assert.strictEqual(v.overall, 6.5, '(7 + 6.5 + 6 + 6) / 4 = 6.375 → 6.5');
  assert.strictEqual(v.displayTitle, '外部模考');
  assert.strictEqual(E.externalView(extRecord('p', TODAY, { listening: { raw: 31 } })).overall, null, '缺项不出总分');
  v.listening.band = 1;
  assert.strictEqual(full.listening.band, 7, '视图是拷贝，不影响原记录');
});

// ---------------- 整套成绩点与估分口径 ----------------
test('fullTestPoints：模考做完的部分 + 剑雅每一项，按时间升序；未做完的部分不算', () => {
  const t0 = tsOf('2026-11-10');
  const user = {
    mocks: [mockWith('m1', t0, { listening: 6.5, reading: 6, writing: 5.5 })],
    externalTests: [
      extRecord('e1', '2026-11-05', { listening: { raw: 31 }, speaking: { band: 6 } }),
      extRecord('e2', '2026-11-20', { reading: { raw: 27 } }),
    ],
  };
  user.mocks[0].sections.speaking.state = 'skipped';
  const p = S.fullTestPoints(user);
  assert.deepStrictEqual(p.listening.map((x) => [x.source, x.band]), [['external', 7], ['mock', 6.5]]);
  assert.deepStrictEqual(p.reading.map((x) => [x.source, x.band]), [['mock', 6], ['external', 6.5]]);
  assert.deepStrictEqual(p.writing.map((x) => x.band), [5.5]);
  assert.deepStrictEqual(p.speaking.map((x) => x.source), ['external'], '模考口语被放弃，不算');
  assert.strictEqual(p.listening[1].date, '2026-11-10');
  const empty = S.fullTestPoints({});
  assert.ok(S.SKILLS.every((k) => Array.isArray(empty[k]) && !empty[k].length));
});

test('chooseBasis：近 6 周整套 → 单项 → 更早的整套 → 无', () => {
  const pt = (date, band, source) => ({ date, ts: tsOf(date), band, source: source || 'external' });
  const single = { avg: 5, n: 3, count: 3 };
  const none = { avg: null, n: 0, count: 0 };
  const edge = ielts.addDays(TODAY, -S.FULL_WINDOW_DAYS);
  const old = ielts.addDays(TODAY, -(S.FULL_WINDOW_DAYS + 1));

  let c = S.chooseBasis([pt(old, 4), pt('2026-11-01', 6), pt('2026-11-10', 6.5, 'mock'), pt('2026-11-20', 7)], single, TODAY);
  assert.strictEqual(c.basis, 'full');
  assert.strictEqual(c.stale, false);
  assert.strictEqual(c.last3Avg, 6.5, '只取近 6 周内最近 3 个：(6 + 6.5 + 7) / 3');

  c = S.chooseBasis([pt(old, 4), pt(edge, 8)], single, TODAY);
  assert.strictEqual(c.last3Avg, 8, '恰好 42 天前仍算近 6 周，43 天前不算');

  c = S.chooseBasis([pt(old, 4)], single, TODAY);
  assert.deepStrictEqual([c.basis, c.last3Avg, c.stale], ['single', 5, false], '近 6 周没有整套时用单项');

  c = S.chooseBasis([pt('2026-01-01', 5.5), pt(old, 6)], none, TODAY);
  assert.deepStrictEqual([c.basis, c.last3Avg, c.stale], ['full', 5.75, true], '单项也没有时用更早的整套并标注过时');

  c = S.chooseBasis([], none, TODAY);
  assert.deepStrictEqual([c.basis, c.last3Avg, c.stale], [null, null, false]);
});

test('skillSummaries：模考拆写的记录不进单项均分；label 文案', () => {
  const oldTs = tsOf(ielts.addDays(TODAY, -60));
  const recentTs = tsOf(ielts.addDays(TODAY, -3));
  const lr = (i, band, extra) => ({ id: `l${i}`, sectionId: 'l1-a', part: 1, mode: 'exam', raw: 5, total: 10, band, durationSec: 60, answers: {}, ts: recentTs + i, ...extra });
  const user = {
    // 60 天前的一套模考：听力 5.5；之后又单独做了 2 次听力考试模式，模考拆出的 Part 记录分数很高，不应进单项均分
    mocks: [mockWith('m-old', oldTs, { listening: 5.5 })],
    listenings: [lr(1, 6), lr(2, 7), lr(3, 9, { mockId: 'm-old' }), lr(4, 9, { mockId: 'm-old' }), lr(5, 8, { mode: 'practice' })],
    readings: [],
    writings: [
      { id: 'w1', band: 6, ts: recentTs, text: 'x' },
      { id: 'w2', band: 8, ts: recentTs + 1, text: 'x', mockId: 'm-old' },
    ],
    speakings: [],
    externalTests: [extRecord('e1', ielts.addDays(TODAY, -2), { reading: { raw: 27 } })],
  };
  const s = S.skillSummaries(user, TODAY);
  assert.strictEqual(s.listening.basis, 'single');
  assert.strictEqual(s.listening.last3Avg, 6.5, '(6 + 7) / 2，排除 mockId 记录');
  assert.strictEqual(s.listening.count, 4, 'count 仍为全部考试模式记录');
  assert.strictEqual(s.listening.practiceCount, 1);
  assert.strictEqual(s.listening.fullCount, 1);
  assert.strictEqual(s.listening.label, '近 2 次单项考试均分 · 考试模式 4 次 · 练习 1 次');

  assert.strictEqual(s.reading.basis, 'full');
  assert.strictEqual(s.reading.last3Avg, 6.5);
  assert.strictEqual(s.reading.label, '近 1 次整套成绩均分（剑雅 1 次）');
  assert.strictEqual(s.reading.practiceCount, 0);

  assert.strictEqual(s.writing.basis, 'single');
  assert.strictEqual(s.writing.last3Avg, 6, '写作单项同样排除模考写入的记录');
  assert.strictEqual(s.writing.count, 2);
  assert.ok(!('practiceCount' in s.writing), '写作口语没有 practiceCount');
  assert.strictEqual(s.writing.label, '近 1 次自评均分 · 共 2 篇');

  assert.deepStrictEqual([s.speaking.basis, s.speaking.last3Avg, s.speaking.label], [null, null, '还没有口语记录']);

  // 去掉单项听力后，只剩 60 天前的模考：用过时的整套
  const s2 = S.skillSummaries({ ...user, listenings: [] }, TODAY);
  assert.deepStrictEqual([s2.listening.basis, s2.listening.stale, s2.listening.last3Avg], ['full', true, 5.5]);
  assert.ok(s2.listening.label.includes('站内模考 1 次') && s2.listening.label.includes('已超过 6 周'), s2.listening.label);

  assert.strictEqual(S.basisNote(s), '阅读按近 6 周的整套成绩（站内模考、剑雅）计算；');
  assert.strictEqual(S.basisNote(s2), '阅读按近 6 周的整套成绩（站内模考、剑雅）计算；听力只有 6 周以前的整套成绩，可能已过时；');
  assert.strictEqual(S.basisNote(S.skillSummaries({}, TODAY)), '');
});

// ---------------- 接口集成（临时档案）----------------
async function integration() {
  const express = require('express');
  const profile = require('../lib/profile');
  const original = profile.currentId();
  const created = profile.create(`ext-test-${Date.now().toString(36)}`);
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
    app.use(express.json({ limit: '1mb' }));
    app.use('/api', require('../routes/ielts'));
    app.use('/api', require('../routes/ielts-external'));
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
    await runIntegration(call);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    cleanup();
    process.removeListener('SIGINT', onSig);
    process.removeListener('SIGTERM', onSig);
  }
}

async function runIntegration(call) {
  const today = ielts.todayKey();
  let firstId = null;

  await testAsync('接口：空档案列表为空', async () => {
    const r = await call('GET', '/ielts/external-tests');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data, { total: 0, items: [] });
  });

  await testAsync('接口：录入、列表（按做题日期倒序）、400', async () => {
    const a = await call('POST', '/ielts/external-tests', { date: ielts.addDays(today, -1), book: 18, test: 2, listening: { raw: 31 }, reading: { raw: 27 } });
    assert.strictEqual(a.status, 200, JSON.stringify(a.data));
    assert.strictEqual(a.data.ok, true);
    assert.deepStrictEqual(a.data.ticked, []);
    assert.strictEqual(a.data.item.displayTitle, '剑雅 18 Test 2');
    assert.strictEqual(a.data.item.listening.band, 7);
    assert.ok(/^ext-/.test(a.data.item.id));
    firstId = a.data.item.id;
    const b = await call('POST', '/ielts/external-tests', { date: ielts.addDays(today, -5), writing: { band: 6 }, title: '老师批改' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.data));
    const list = await call('GET', '/ielts/external-tests');
    assert.strictEqual(list.data.total, 2);
    assert.deepStrictEqual(list.data.items.map((x) => x.id), [firstId, b.data.item.id], '新的（做题日期晚的）在前');

    for (const body of [{}, { date: today }, { date: today, listening: { raw: 99 } }, { date: today, x: 1, listening: { raw: 1 } }, '[1]']) {
      const r = await call('POST', '/ielts/external-tests', body);
      assert.strictEqual(r.status, 400, JSON.stringify(body));
      assert.ok(typeof r.data.error === 'string' && r.data.error, '错误返回 JSON { error }');
    }
    assert.strictEqual((await call('GET', '/ielts/external-tests')).data.total, 2, '400 不落盘');
  });

  await testAsync('接口：删除（400 / 404 / 成功）', async () => {
    assert.strictEqual((await call('DELETE', '/ielts/external-tests/bad%20id')).status, 400);
    assert.strictEqual((await call('DELETE', '/ielts/external-tests/ext-nope')).status, 404);
    const list = await call('GET', '/ielts/external-tests');
    const victim = list.data.items.find((x) => x.id !== firstId).id;
    const r = await call('DELETE', `/ielts/external-tests/${victim}`);
    assert.deepStrictEqual(r.data, { ok: true, id: victim });
    assert.deepStrictEqual((await call('GET', '/ielts/external-tests')).data.items.map((x) => x.id), [firstId]);
  });

  await testAsync('接口：tickPlan 在剑雅任务周给当天打勾；备考未开启或日期早于开始日时不打勾', async () => {
    const off = await call('POST', '/ielts/external-tests', { date: today, speaking: { band: 6 }, tickPlan: true });
    assert.deepStrictEqual(off.data.ticked, [], '备考未开启时不打勾');
    // 把开始日拨到 70 天前（第 11 周，专项期有 cam-lr），考试日设在开始日后 26 周
    const user = ielts.loadUser();
    const start = ielts.addDays(today, -70);
    user.profile = { ...user.profile, active: true, startDate: start, examDate: ielts.addDays(start, 26 * 7) };
    ielts.saveUser(user);
    const on = await call('POST', '/ielts/external-tests', { date: today, listening: { raw: 25 }, tickPlan: true });
    assert.strictEqual(on.status, 200, JSON.stringify(on.data));
    assert.deepStrictEqual(on.data.ticked, ['cam-lr']);
    assert.ok(ielts.loadUser().manualDone[today].includes('cam-lr'), 'manualDone 当天含 cam-lr');
    const noTick = await call('POST', '/ielts/external-tests', { date: ielts.addDays(today, -1), listening: { raw: 25 } });
    assert.deepStrictEqual(noTick.data.ticked, [], '没带 tickPlan 不打勾');
    assert.ok(!ielts.loadUser().manualDone[ielts.addDays(today, -1)], '前一天没有被打勾');
    const early = await call('POST', '/ielts/external-tests', { date: ielts.addDays(start, -1), listening: { raw: 25 }, tickPlan: true });
    assert.deepStrictEqual(early.data.ticked, [], '早于开始备考日不打勾');
    const plan = await call('GET', '/ielts/plan');
    assert.strictEqual(plan.status, 200);
  });

  await testAsync('接口：/ielts/summary 按整套优先；模考做完的部分算整套成绩点', async () => {
    // 清掉前面用例的成绩，重新布置：近 6 周 2 次剑雅听力 + 1 套模考听力，另有更高分的单项听力考试记录（不应被采用）
    const user = ielts.loadUser();
    const now = Date.now();
    user.externalTests = [];
    user.mocks = [mockWith('m-recent', now - 10 * DAY, { listening: 6, writing: 6 })];
    user.listenings = [
      { id: 'lx1', sectionId: 'l1-a', part: 1, mode: 'exam', raw: 10, total: 10, band: 9, durationSec: 60, answers: {}, ts: now - DAY },
    ];
    ielts.saveUser(user);
    for (const [d, raw] of [[ielts.addDays(today, -20), 31], [ielts.addDays(today, -3), 27]]) {
      assert.strictEqual((await call('POST', '/ielts/external-tests', { date: d, listening: { raw } })).status, 200);
    }
    const s = (await call('GET', '/ielts/summary')).data;
    const lb27 = listening.bandFrom40(27);
    assert.strictEqual(s.listening.basis, 'full');
    assert.strictEqual(s.listening.fullCount, 3);
    assert.strictEqual(s.listening.last3Avg, Math.round(((7 + 6 + lb27) / 3) * 100) / 100);
    assert.strictEqual(s.listening.label, '近 3 次整套成绩均分（站内模考 1 次、剑雅 2 次）');
    assert.strictEqual(s.listening.count, 1, 'count 仍是考试模式记录数');
    assert.strictEqual(s.writing.basis, 'full');
    assert.strictEqual(s.writing.last3Avg, 6);
    assert.strictEqual(s.reading.basis, null);
    assert.strictEqual(s.estimate.bySkill.listening, s.listening.last3Avg);
    assert.ok(s.estimate.note.includes('听力、写作按近 6 周的整套成绩'), s.estimate.note);
    assert.ok(s.estimate.note.includes('缺阅读、口语'), s.estimate.note);
  });
}

(async () => {
  try {
    await integration();
  } catch (e) {
    failed++;
    console.error(`FAIL: 接口集成测试没能运行：${e.stack || e.message}`);
  }
  console.log(`\n剑雅成绩与整套估分测试：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
