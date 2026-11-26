'use strict';
// 雅思弱项统计测试：错误原因各分支与优先级、编辑距离与单复数判定、考试 / 练习计数口径、时间窗口、
// 跳过对不上题库的记录、enough 阈值、最弱项排序与上限、knowledgeId 映射（含文章不存在时为 null），
// 以及接口集成（GET /ielts/weakness 的统计结果与 days 的 400）。设计见 docs/design/ielts-weakness-20261126.md §6。
// 用法：npm run test:ielts-weakness
//
// 【隔离】纯函数测试用自造的题目与记录（通过 lookup 注入），不读写档案。接口集成测试在进程内起只挂 routes/ielts-weakness.js
// 的 Express，用 lib/profile.js 新建临时档案（create 会自动切过去），结束时切回原档案、删除临时档案并清掉
// data/profiles/.trash/ 里的对应目录。被 kill -9 硬杀时当前档案会停在临时档案上，需要手动切回；运行期间不要同时操作同一数据目录的服务。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ielts = require('../lib/ielts');
const W = require('../lib/ielts-weakness');
const listening = require('../lib/ielts-listening');
const reading = require('../lib/ielts-reading');
const knowledge = require('../lib/ielts-knowledge');

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
// 本地时间（不带 Z）：窗口按记录 ts 的本地日期判断
const tsAt = (date, time) => new Date(`${date}T${time || '12:00'}:00`).getTime();
const WL = 'NO MORE THAN TWO WORDS AND/OR A NUMBER';

// ---------------- 自造题目与记录 ----------------
// 听力 section：groups = [[type, answers[], wordLimit?]]，题号从 (part-1)*10+1 起连续
function lsection(id, part, groups) {
  let no = (part - 1) * 10 + 1;
  return {
    id,
    part,
    groups: groups.map(([type, answers, wordLimit]) => ({
      type,
      wordLimit: listening.CHOICE_TYPES.includes(type) ? undefined : wordLimit || WL,
      questions: answers.map((a) => ({ no: no++, answer: Array.isArray(a) ? a : [a], explanation: '解析', segment: 0 })),
    })),
  };
}
function allNos(section) {
  const out = [];
  for (const g of section.groups) for (const q of g.questions) out.push(q.no);
  return out;
}
// 全对的作答；override 里给出的题号改成指定作答（'' 表示未作答，不写进 answers）
function answersFor(section, override) {
  const out = {};
  for (const g of section.groups) for (const q of g.questions) out[String(q.no)] = q.answer[0];
  for (const [no, v] of Object.entries(override || {})) {
    if (v === '') delete out[String(no)];
    else out[String(no)] = v;
  }
  return out;
}
let recSeq = 0;
function lrec(section, mode, answers, ts, extra) {
  const g = listening.gradeSection(section, answers);
  return { id: `l${++recSeq}`, sectionId: section.id, part: section.part, mode, raw: g.raw, total: g.total, band: g.band, durationSec: 60, answers, ts, ...extra };
}
// 阅读文章：groups = [[type, count]]，题目 id 为 q1、q2…
function rpassage(id, difficulty, groups) {
  let n = 1;
  return {
    id,
    difficulty,
    groups: groups.map(([type, count]) => ({
      type,
      questions: Array.from({ length: count }, () => {
        const k = n++;
        return { id: `q${k}`, number: k, answer: ['A'], explanation: '解析' };
      }),
    })),
  };
}
function idsOfType(p, type) {
  return p.groups.filter((g) => g.type === type).flatMap((g) => g.questions.map((q) => q.id));
}
function rrec(p, mode, wrong, ts, extra) {
  const total = p.groups.reduce((s, g) => s + g.questions.length, 0);
  return { id: `r${++recSeq}`, passageId: p.id, mode, raw: total - wrong.length, total, band: 5, durationSec: 60, wrong, ts, ...extra };
}
function lookupOf(sections, passages, missingArticles) {
  const sm = new Map(sections.map((s) => [s.id, s]));
  const pm = new Map(passages.map((p) => [p.id, p]));
  const missing = new Set(missingArticles || []);
  return {
    getSection: (id) => sm.get(id) || null,
    getPassage: (id) => pm.get(id) || null,
    hasArticle: (id) => !missing.has(id),
  };
}
function run(user, opts) {
  return W.analyzeWeakness(user, { today: TODAY, days: 60, ...opts });
}
const find = (list, key) => list.find((x) => x.key === key);
const cause = (type, yours, answers, overLimit) => W.classifyCause({ type, yours, overLimit: !!overLimit, answers });

// ---------------- 编辑距离与单复数 ----------------
test('editDistance：插入 / 删除 / 替换各算 1，对称', () => {
  assert.strictEqual(W.editDistance('abc', 'abc'), 0);
  assert.strictEqual(W.editDistance('', 'abc'), 3);
  assert.strictEqual(W.editDistance('abc', ''), 3);
  assert.strictEqual(W.editDistance('kitten', 'sitting'), 3);
  assert.strictEqual(W.editDistance('sitting', 'kitten'), 3);
  assert.strictEqual(W.editDistance('recieve', 'receive'), 2, '相邻字母互换按 Levenshtein 计 2');
  assert.strictEqual(W.editDistance('acommodation', 'accommodation'), 1);
});

test('differsByPlural：只差结尾的 s / es', () => {
  assert.strictEqual(W.differsByPlural('bedroom', 'bedrooms'), true);
  assert.strictEqual(W.differsByPlural('bedrooms', 'bedroom'), true, '两个方向都算');
  assert.strictEqual(W.differsByPlural('box', 'boxes'), true);
  assert.strictEqual(W.differsByPlural('two bedroom', 'two bedrooms'), true, '多词答案看整体结尾');
  assert.strictEqual(W.differsByPlural('city', 'cities'), false, 'ies 不在规则内');
  assert.strictEqual(W.differsByPlural('cat', 'cast'), false);
  assert.strictEqual(W.differsByPlural('cat', 'cat'), false);
  assert.strictEqual(W.differsByPlural('', 's'), false);
  assert.strictEqual(W.differsByPlural('box', 'boxess'), false);
});

// ---------------- 错误原因 ----------------
test('classifyCause：各分支', () => {
  assert.strictEqual(cause('form-completion', '', ['water']), 'blank');
  assert.strictEqual(cause('form-completion', '   ', ['water']), 'blank', '只有空白也是未作答');
  assert.strictEqual(cause('note-completion', 'the big red house', ['house'], true), 'over-limit');
  assert.strictEqual(cause('mcq', 'C', ['B']), 'choice');
  assert.strictEqual(cause('matching', 'A', ['D']), 'choice');
  assert.strictEqual(cause('form-completion', 'bedroom', ['bedrooms']), 'plural');
  assert.strictEqual(cause('form-completion', 'Boxes.', ['box']), 'plural', '先按 normalizeAnswer 归一化（大小写、首尾标点）');
  assert.strictEqual(cause('form-completion', '15', ['50', 'fifty']), 'number');
  assert.strictEqual(cause('form-completion', '£15.50', ['£50.15']), 'number');
  assert.strictEqual(cause('form-completion', 'Wenesday', ['Wednesday']), 'spelling');
  assert.strictEqual(cause('form-completion', 'library', ['museum']), 'other');
  assert.strictEqual(cause('form-completion', 'fifteen', ['50']), 'other', '只有答案含数字、作答不含时不算数字错');
  assert.strictEqual(cause('form-completion', '...', ['a']), 'other', '归一化后为空：没有可比的内容');
});

test('classifyCause：拼写容错按答案长度（≤5 字符容 1 处，更长容 2 处）', () => {
  assert.strictEqual(cause('form-completion', 'car', ['cat']), 'spelling', '3 字符差 1');
  assert.strictEqual(cause('form-completion', 'hoses', ['house']), 'other', '5 字符差 2：超出容错');
  assert.strictEqual(cause('form-completion', 'hous', ['house']), 'spelling', '5 字符差 1');
  assert.strictEqual(cause('form-completion', 'gadren', ['garden']), 'spelling', '6 字符差 2');
  assert.strictEqual(cause('form-completion', 'gdrnn', ['garden']), 'other', '6 字符差 3');
  assert.strictEqual(cause('form-completion', 'gardin', ['allotment', 'garden']), 'spelling', '任一可接受答案满足即可');
});

test('classifyCause：优先级（按顺序取第一个命中的）', () => {
  assert.strictEqual(cause('mcq', '', ['B']), 'blank', '未作答优先于选项选错');
  assert.strictEqual(cause('form-completion', 'two bedrooms extra', ['bedroom'], true), 'over-limit', '超出字数优先于单复数');
  assert.strictEqual(cause('form-completion', '2 bedroom', ['2 bedrooms']), 'plural', '单复数优先于数字');
  assert.strictEqual(cause('form-completion', '16', ['15']), 'number', '数字优先于拼写（16 与 15 编辑距离 1）');
  assert.strictEqual(cause('form-completion', 'cats', ['cat']), 'plural', '单复数优先于拼写（cats 与 cat 编辑距离 1）');
});

test('CAUSES：标签与知识库映射符合设计表', () => {
  assert.deepStrictEqual(W.CAUSES.map((c) => c.key), ['blank', 'over-limit', 'choice', 'plural', 'number', 'spelling', 'other']);
  const kid = Object.fromEntries(W.CAUSES.map((c) => [c.key, c.knowledgeId]));
  for (const k of ['spelling', 'plural', 'number', 'over-limit']) assert.strictEqual(kid[k], 'st-listening-spelling-format', k);
  assert.strictEqual(kid.choice, 'st-listening-mcq');
  assert.strictEqual(kid.blank, 'st-listening-prediction');
  assert.strictEqual(kid.other, 'st-listening-prediction');
  const label = Object.fromEntries(W.CAUSES.map((c) => [c.key, c.label]));
  assert.strictEqual(label.spelling, '拼写');
  assert.strictEqual(label.blank, '未作答');
  assert.strictEqual(label.number, '数字 / 日期听错');
});

// ---------------- 计数口径 ----------------
// 10 题：4 道表格填空（第 1–4 题）+ 6 道单选（第 5–10 题）
const S1 = lsection('sec-a', 1, [
  ['form-completion', ['water', 'bedrooms', '15', 'Wednesday']],
  ['mcq', ['A', 'B', 'C', 'A', 'B', 'C']],
]);

test('考试模式每题都算，未作答记为错并归为「未作答」', () => {
  const answers = answersFor(S1, { 1: '', 2: 'bedroom', 3: '50', 5: '', 6: 'C' });
  const r = run({ listenings: [lrec(S1, 'exam', answers, tsAt('2026-11-25'))] }, { lookup: lookupOf([S1], []) });
  const L = r.listening;
  assert.strictEqual(L.records, 1);
  assert.strictEqual(L.skipped, 0);
  assert.strictEqual(L.questions, 10);
  assert.deepStrictEqual(find(L.byType, 'form-completion'), { key: 'form-completion', label: '表格填空', total: 4, correct: 1, accuracy: 0.25, enough: false });
  assert.deepStrictEqual(find(L.byType, 'mcq'), { key: 'mcq', label: '单选', total: 6, correct: 4, accuracy: 0.67, enough: false });
  assert.deepStrictEqual(L.byPart, [{ key: 1, label: 'Part 1', total: 10, correct: 5, accuracy: 0.5, enough: true }]);
  assert.deepStrictEqual(L.causes, [
    { key: 'blank', label: '未作答', count: 2 },
    { key: 'choice', label: '选项选错', count: 1 },
    { key: 'plural', label: '单复数', count: 1 },
    { key: 'number', label: '数字 / 日期听错', count: 1 },
  ], '按次数降序，同次数按固定顺序');
  assert.strictEqual(L.topCause, null, '最多的原因只出现 2 次（< 3），不给 topCause');
});

test('练习模式只算作答了的题，空着的不计入（也就不会出现「未作答」）', () => {
  const answers = answersFor(S1, { 1: '', 2: 'bedroom', 5: '', 6: '', 7: '', 8: 'B' });
  const r = run({ listenings: [lrec(S1, 'practice', answers, tsAt('2026-11-25'))] }, { lookup: lookupOf([S1], []) });
  const L = r.listening;
  assert.strictEqual(L.records, 1);
  assert.strictEqual(L.questions, 6, '10 题里空了 4 题');
  assert.deepStrictEqual(find(L.byType, 'form-completion'), { key: 'form-completion', label: '表格填空', total: 3, correct: 2, accuracy: 0.67, enough: false });
  assert.deepStrictEqual(find(L.byType, 'mcq'), { key: 'mcq', label: '单选', total: 3, correct: 2, accuracy: 0.67, enough: false });
  assert.ok(!L.causes.some((c) => c.key === 'blank'), '练习模式没有「未作答」');
  assert.deepStrictEqual(L.causes.map((c) => c.key), ['choice', 'plural']);
});

test('模考写入的听力记录（mode=exam、带 mockId）按考试模式计数', () => {
  const answers = answersFor(S1, { 1: '' });
  const r = run({ listenings: [lrec(S1, 'exam', answers, tsAt('2026-11-25'), { mockId: 'mock-1' })] }, { lookup: lookupOf([S1], []) });
  assert.strictEqual(r.listening.questions, 10);
  assert.deepStrictEqual(r.listening.causes, [{ key: 'blank', label: '未作答', count: 1 }]);
});

test('topCause：次数最多的原因 ≥ 3 次才给，附 knowledgeId；文章不存在时为 null', () => {
  const recs = [1, 2, 3].map((d) => lrec(S1, 'exam', answersFor(S1, { 1: 'wter' }), tsAt(`2026-11-2${d}`)));
  const r = run({ listenings: recs }, { lookup: lookupOf([S1], []) });
  assert.deepStrictEqual(r.listening.topCause, { key: 'spelling', label: '拼写', count: 3, knowledgeId: 'st-listening-spelling-format' });
  const r2 = run({ listenings: recs }, { lookup: lookupOf([S1], [], ['st-listening-spelling-format']) });
  assert.deepStrictEqual(r2.listening.topCause, { key: 'spelling', label: '拼写', count: 3, knowledgeId: null });
  const r3 = run({ listenings: recs.slice(0, 2) }, { lookup: lookupOf([S1], []) });
  assert.strictEqual(r3.listening.topCause, null, '2 次不给');
});

// ---------------- 时间窗口 ----------------
test('时间窗口：含今天在内的最近 days 天，按 ts 的本地日期判断', () => {
  assert.deepStrictEqual(W.windowRange(TODAY, 60), { from: '2026-09-28', to: TODAY }, '与设计文档 §4 示例一致');
  assert.deepStrictEqual(W.windowRange(TODAY, 7), { from: '2026-11-20', to: TODAY });
  const a = answersFor(S1);
  const recs = [
    lrec(S1, 'exam', a, tsAt('2026-11-20', '00:30')), // 窗口第一天：算
    lrec(S1, 'exam', a, tsAt('2026-11-19', '23:30')), // 前一天：不算
    lrec(S1, 'exam', a, tsAt(TODAY, '23:59')), // 今天：算
    lrec(S1, 'exam', a, tsAt('2026-11-27', '00:01')), // 明天（时钟异常）：不算
  ];
  const r = run({ listenings: recs }, { days: 7, lookup: lookupOf([S1], []) });
  assert.strictEqual(r.days, 7);
  assert.strictEqual(r.from, '2026-11-20');
  assert.strictEqual(r.to, TODAY);
  assert.strictEqual(r.listening.records, 2);
  assert.strictEqual(r.listening.skipped, 0, '窗口外的记录不计入 skipped');
  assert.strictEqual(run({ listenings: recs }, { days: 8, lookup: lookupOf([S1], []) }).listening.records, 3);
});

test('analyzeWeakness：days 缺省 60；非 7–365 整数或 today 非法时抛 RangeError', () => {
  const r = W.analyzeWeakness({}, { today: TODAY, lookup: lookupOf([], []) });
  assert.strictEqual(r.days, 60);
  assert.deepStrictEqual(r.weakest, []);
  for (const days of [6, 366, 7.5, '60', NaN, 0]) {
    assert.throws(() => W.analyzeWeakness({}, { days, today: TODAY, lookup: lookupOf([], []) }), RangeError, String(days));
  }
  assert.throws(() => W.analyzeWeakness({}, { days: 60, today: '2026-02-30' }), RangeError);
  assert.strictEqual(W.isValidDays(7), true);
  assert.strictEqual(W.isValidDays(365), true);
});

// ---------------- 跳过对不上题库的记录 ----------------
test('听力：题目不在题库、缺作答、重判的 raw / total 与记录不一致时跳过并计入 skipped', () => {
  const a = answersFor(S1, { 1: 'x' });
  const ok = lrec(S1, 'exam', a, tsAt('2026-11-25'));
  const recs = [
    ok,
    { ...ok, id: 'gone', sectionId: 'no-such-section' },
    { ...ok, id: 'noans', answers: undefined },
    { ...ok, id: 'raw', raw: ok.raw - 1 },
    { ...ok, id: 'total', total: 20, raw: ok.raw },
  ];
  const r = run({ listenings: recs }, { lookup: lookupOf([S1], []) });
  assert.strictEqual(r.listening.records, 1);
  assert.strictEqual(r.listening.skipped, 4);
  assert.strictEqual(r.listening.questions, 10, '只统计能还原的那一条');
  const bad = run({ listenings: [{ sectionId: 'sec-a', mode: 'exam' }, null, 'x'] }, { lookup: lookupOf([S1], []) });
  assert.strictEqual(bad.listening.records + bad.listening.skipped, 0, '畸形记录在清洗时就丢掉，不算 skipped');
});

const P_EASY = rpassage('rd-easy', 'easy', [['tfng', 5], ['mcq', 4], ['short-answer', 4]]);
const P_HARD = rpassage('rd-hard', 'hard', [['matching-headings', 6], ['ynng', 4]]);

test('阅读：只算考试模式（含模考），按题型 / 难度统计，固定顺序', () => {
  const recs = [
    rrec(P_EASY, 'exam', idsOfType(P_EASY, 'tfng').slice(0, 3), tsAt('2026-11-25')),
    rrec(P_HARD, 'exam', ['q1', 'q7'], tsAt('2026-11-24'), { mockId: 'mock-1' }),
    rrec(P_EASY, 'practice', idsOfType(P_EASY, 'mcq'), tsAt('2026-11-25')),
  ];
  const R = run({ readings: recs }, { lookup: lookupOf([], [P_EASY, P_HARD]) }).reading;
  assert.strictEqual(R.records, 2, '练习模式不计入');
  assert.strictEqual(R.skipped, 0, '练习模式也不算 skipped');
  assert.strictEqual(R.questions, 23);
  assert.deepStrictEqual(R.byType.map((x) => x.key), ['tfng', 'ynng', 'matching-headings', 'mcq', 'short-answer'], 'QUESTION_TYPES 顺序、只列有数据的');
  assert.deepStrictEqual(find(R.byType, 'tfng'), { key: 'tfng', label: '判断 T/F/NG', total: 5, correct: 2, accuracy: 0.4, enough: false });
  assert.deepStrictEqual(find(R.byType, 'ynng'), { key: 'ynng', label: '观点 Y/N/NG', total: 4, correct: 3, accuracy: 0.75, enough: false });
  assert.deepStrictEqual(find(R.byType, 'mcq'), { key: 'mcq', label: '单选', total: 4, correct: 4, accuracy: 1, enough: false });
  assert.deepStrictEqual(R.byDifficulty, [
    { key: 'easy', label: '易', total: 13, correct: 10, accuracy: 0.77, enough: true },
    { key: 'hard', label: '难', total: 10, correct: 8, accuracy: 0.8, enough: true },
  ]);
});

test('阅读：文章不在题库、题数变了、缺 wrong、错题数对不上或 wrong 里有不存在的题 id 时跳过', () => {
  const ok = rrec(P_EASY, 'exam', ['q1'], tsAt('2026-11-25'));
  const recs = [
    ok,
    { ...ok, id: 'gone', passageId: 'rd-gone' },
    { ...ok, id: 'total', total: 14, raw: 13 },
    { ...ok, id: 'nowrong', wrong: undefined },
    { ...ok, id: 'count', raw: 13, wrong: ['q1'] },
    { ...ok, id: 'unknown', wrong: ['q99'] },
  ];
  const R = run({ readings: recs }, { lookup: lookupOf([], [P_EASY]) }).reading;
  assert.strictEqual(R.records, 1);
  assert.strictEqual(R.skipped, 5);
  assert.strictEqual(R.questions, 13);
});

// ---------------- enough 与正确率 ----------------
test('accuracy 保留两位小数，total = 0 为 null；enough 阈值为 8 题', () => {
  assert.strictEqual(W.accuracyOf(2, 3), 0.67);
  assert.strictEqual(W.accuracyOf(7, 15), 0.47);
  assert.strictEqual(W.accuracyOf(0, 0), null);
  assert.strictEqual(W.MIN_SAMPLE, 8);
  // 7 道表格填空 vs 8 道表格填空
  const s7 = lsection('sec-seven', 1, [['form-completion', ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']]]);
  const s8 = lsection('sec-eight', 1, [['form-completion', ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']]]);
  const all = (s) => Object.fromEntries(allNos(s).map((n) => [String(n), 'zzzz']));
  const r7 = run({ listenings: [lrec(s7, 'exam', all(s7), tsAt('2026-11-25'))] }, { lookup: lookupOf([s7], []) });
  const r8 = run({ listenings: [lrec(s8, 'exam', all(s8), tsAt('2026-11-25'))] }, { lookup: lookupOf([s8], []) });
  assert.strictEqual(r7.listening.byType[0].enough, false);
  assert.deepStrictEqual(r7.weakest, [], '7 题全错也不排名');
  assert.strictEqual(r8.listening.byType[0].enough, true);
  assert.strictEqual(r8.weakest.length, 1);
  assert.strictEqual(r8.weakest[0].accuracy, 0);
});

// ---------------- 最弱项 ----------------
const item = (key, total, correct) => ({ key, label: key, total, correct, accuracy: W.accuracyOf(correct, total), enough: total >= 8 });
const yes = () => true;

test('最弱项：只取 enough 且正确率 < 70% 的，按正确率升序、同正确率题数多的在前，最多 3 项', () => {
  const lt = [item('form-completion', 10, 5), item('mcq', 20, 10), item('matching', 7, 0), item('note-completion', 10, 7)];
  const rt = [item('tfng', 10, 2), item('ynng', 20, 14), item('mcq', 30, 20), item('short-answer', 100, 69)];
  const w = W.pickWeakest(lt, rt, yes);
  assert.deepStrictEqual(w.map((x) => `${x.skill}:${x.key}:${x.accuracy}`), ['reading:tfng:0.2', 'listening:mcq:0.5', 'listening:form-completion:0.5']);
  assert.strictEqual(W.MAX_WEAKEST, 3);
  const w2 = W.pickWeakest(lt, rt.filter((x) => x.key !== 'tfng'), yes);
  assert.deepStrictEqual(w2.map((x) => `${x.skill}:${x.key}`), ['listening:mcq', 'listening:form-completion', 'reading:mcq'],
    '正确率 0.7（7/10、14/20）不算弱项；0.67（20/30）算；0.69（69/100）也算但排第 4 被截掉');
  assert.strictEqual(W.pickWeakest(lt, rt, yes).length, 3);
  const w3 = W.pickWeakest([], [item('short-answer', 100, 69)], yes);
  assert.strictEqual(w3[0].accuracy, 0.69);
});

test('最弱项：正确率与题数都相同时听力在前；每项附 tip、knowledgeId、practice', () => {
  const w = W.pickWeakest([item('note-completion', 10, 4)], [item('tfng', 10, 4)], yes);
  assert.deepStrictEqual(w.map((x) => x.skill), ['listening', 'reading']);
  assert.deepStrictEqual(Object.keys(w[1]).sort(), ['accuracy', 'correct', 'key', 'knowledgeId', 'label', 'practice', 'skill', 'tip', 'total'].sort());
  assert.strictEqual(w[0].practice, 'listening');
  assert.strictEqual(w[0].knowledgeId, 'st-listening-form-completion');
  assert.strictEqual(w[1].practice, 'reading');
  assert.strictEqual(w[1].knowledgeId, 'st-reading-tfng');
  assert.ok(typeof w[1].tip === 'string' && w[1].tip.length > 5);
});

test('knowledgeId：题型映射符合设计表；文章不存在时为 null', () => {
  assert.deepStrictEqual(W.TYPE_KNOWLEDGE.listening, {
    'form-completion': 'st-listening-form-completion',
    'note-completion': 'st-listening-form-completion',
    'sentence-completion': 'st-listening-form-completion',
    'summary-completion': 'st-listening-form-completion',
    mcq: 'st-listening-mcq',
    matching: 'st-listening-matching-maps',
  });
  assert.deepStrictEqual(W.TYPE_KNOWLEDGE.reading, {
    tfng: 'st-reading-tfng',
    ynng: 'st-reading-tfng',
    'matching-headings': 'st-reading-matching-headings',
    'matching-information': 'st-reading-matching-information',
    'sentence-completion': 'st-reading-completion',
    'summary-completion': 'st-reading-completion',
    'short-answer': 'st-reading-completion',
    mcq: 'st-reading-mcq-paraphrase',
  });
  const hasArticle = (id) => id !== 'st-listening-mcq'; // 模拟听力单选的讲解文章被删
  const w = W.pickWeakest([item('mcq', 10, 1)], [item('ynng', 10, 2)], hasArticle);
  assert.deepStrictEqual(w.map((x) => [x.key, x.knowledgeId]), [['mcq', null], ['ynng', 'st-reading-tfng']]);
});

test('每个题型都有标签与建议；标签与前端 TYPE_LABEL 一致', () => {
  for (const t of listening.GROUP_TYPES) {
    assert.ok(W.LISTENING_TYPE_LABEL[t], `听力 ${t} 缺标签`);
    assert.ok(W.TIPS.listening[t], `听力 ${t} 缺建议`);
    assert.ok(W.TYPE_KNOWLEDGE.listening[t], `听力 ${t} 缺讲解映射`);
  }
  for (const t of reading.QUESTION_TYPES) {
    assert.ok(W.READING_TYPE_LABEL[t], `阅读 ${t} 缺标签`);
    assert.ok(W.TIPS.reading[t], `阅读 ${t} 缺建议`);
    assert.ok(W.TYPE_KNOWLEDGE.reading[t], `阅读 ${t} 缺讲解映射`);
  }
  // 前端两个子页里的 TYPE_LABEL 原样对照（防止两边改了一边）
  const pub = path.join(__dirname, '..', 'public', 'js');
  const labelsIn = (file) => {
    const src = fs.readFileSync(path.join(pub, file), 'utf8');
    const block = src.match(/const TYPE_LABEL = \{([\s\S]*?)\};/);
    assert.ok(block, `${file} 里没找到 TYPE_LABEL`);
    return Object.fromEntries([...block[1].matchAll(/'?([a-z-]+)'?:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  };
  assert.deepStrictEqual(labelsIn('ielts-listening-ui.js'), W.LISTENING_TYPE_LABEL);
  assert.deepStrictEqual(labelsIn('ielts-reading-ui.js'), W.READING_TYPE_LABEL);
});

test('真实知识库里存在映射到的全部讲解文章（被删或改名时这里会失败提醒）', () => {
  const ids = new Set([...Object.values(W.TYPE_KNOWLEDGE.listening), ...Object.values(W.TYPE_KNOWLEDGE.reading), ...W.CAUSES.map((c) => c.knowledgeId)]);
  for (const id of ids) assert.ok(knowledge.getArticle(id), `知识库缺文章 ${id}`);
});

test('端到端：听力 + 阅读一起排最弱项', () => {
  const sx = lsection('sec-x', 4, [['note-completion', ['a1', 'a2', 'a3', 'a4', 'a5']], ['summary-completion', ['b1', 'b2', 'b3', 'b4', 'b5']]]);
  const wrongNotes = (n) => answersFor(sx, Object.fromEntries(allNos(sx).slice(0, n).map((no) => [no, 'zzzz'])));
  const listenings = [lrec(sx, 'exam', wrongNotes(3), tsAt('2026-11-24')), lrec(sx, 'exam', wrongNotes(2), tsAt('2026-11-25'))];
  const tf = idsOfType(P_EASY, 'tfng');
  const readings = [rrec(P_EASY, 'exam', tf, tsAt('2026-11-24')), rrec(P_EASY, 'exam', tf.slice(0, 4), tsAt('2026-11-25'))];
  const r = run({ listenings, readings }, { lookup: lookupOf([sx], [P_EASY]) });
  assert.deepStrictEqual(find(r.listening.byType, 'note-completion'), { key: 'note-completion', label: '笔记填空', total: 10, correct: 5, accuracy: 0.5, enough: true });
  assert.deepStrictEqual(r.listening.byPart.map((x) => x.key), [4]);
  assert.deepStrictEqual(r.listening.topCause, { key: 'other', label: '其他（没听到 / 听错词）', count: 5, knowledgeId: 'st-listening-prediction' });
  assert.deepStrictEqual(r.weakest.map((x) => `${x.skill}:${x.key}:${x.correct}/${x.total}`), ['reading:tfng:1/10', 'listening:note-completion:5/10']);
  assert.deepStrictEqual(Object.keys(r), ['days', 'from', 'to', 'listening', 'reading', 'weakest']);
  assert.deepStrictEqual(Object.keys(r.listening), ['records', 'skipped', 'questions', 'byType', 'byPart', 'causes', 'topCause']);
  assert.deepStrictEqual(Object.keys(r.reading), ['records', 'skipped', 'questions', 'byType', 'byDifficulty']);
});

// ---------------- 接口集成（临时档案）----------------
async function integration() {
  const express = require('express');
  const profile = require('../lib/profile');
  const original = profile.currentId();
  const created = profile.create(`wk-test-${Date.now().toString(36)}`);
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
    app.use('/api', require('../routes/ielts-weakness'));
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (url) => {
      const r = await fetch(base + url);
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
  const DAY = 86400000;
  const now = Date.now();

  await testAsync('接口：空档案返回空统计', async () => {
    const r = await call('/ielts/weakness');
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.strictEqual(r.data.days, 60);
    assert.strictEqual(r.data.to, today);
    assert.strictEqual(r.data.from, ielts.addDays(today, -59));
    assert.deepStrictEqual(r.data.listening, { records: 0, skipped: 0, questions: 0, byType: [], byPart: [], causes: [], topCause: null });
    assert.deepStrictEqual(r.data.reading, { records: 0, skipped: 0, questions: 0, byType: [], byDifficulty: [] });
    assert.deepStrictEqual(r.data.weakest, []);
  });

  await testAsync('接口：days 非 7–365 的整数返回 400 JSON', async () => {
    for (const q of ['6', '366', 'abc', '7.5', '-10', '60&days=30', '1e2']) {
      const r = await call(`/ielts/weakness?days=${q}`);
      assert.strictEqual(r.status, 400, q);
      assert.ok(typeof r.data.error === 'string' && r.data.error.includes('7–365'), `错误返回 JSON { error }：${q}`);
    }
    for (const q of ['7', '30', '90', '365']) {
      const r = await call(`/ielts/weakness?days=${q}`);
      assert.strictEqual(r.status, 200, q);
      assert.strictEqual(r.data.days, Number(q));
    }
  });

  await testAsync('接口：按真实题库重判，统计、跳过与最弱项正确', async () => {
    // 真实题库：选一组含表格填空的 Part 1 听力、一篇含 TFNG 的阅读
    const section = listening.getSections().find((s) => s.part === 1 && s.groups.some((g) => g.type === 'form-completion'));
    const passage = reading.getPassages().find((p) => p.groups.some((g) => g.type === 'tfng'));
    assert.ok(section && passage, '题库里需要有 Part 1 表格填空听力和含 TFNG 的阅读');
    const formNos = section.groups.filter((g) => g.type === 'form-completion').flatMap((g) => g.questions.map((q) => q.no));
    const nQ = allNos(section).length;
    assert.ok(formNos.length >= 4, '表格填空至少 4 题');
    // 考试记录 A：表格填空第 1 题空着、第 2 题超字数、其余写成 zzzz；其余题型全对
    const wrongA = { [formNos[0]]: '', [formNos[1]]: 'aa bb cc dd' };
    for (const no of formNos.slice(2)) wrongA[no] = 'zzzz';
    // 练习记录 C：只做了表格填空前两题且都错
    const practiceAnswers = { [String(formNos[0])]: 'zzzz', [String(formNos[1])]: 'zzzz' };
    const user = ielts.loadUser();
    user.listenings = [
      lrec(section, 'exam', answersFor(section, wrongA), now - DAY),
      lrec(section, 'exam', answersFor(section), now - 2 * DAY),
      lrec(section, 'practice', practiceAnswers, now - 3 * DAY),
      { ...lrec(section, 'exam', answersFor(section), now), sectionId: 'no-such-section' },
      lrec(section, 'exam', answersFor(section), now - 100 * DAY),
    ];
    const tf = passage.groups.filter((g) => g.type === 'tfng').flatMap((g) => g.questions.map((q) => q.id));
    const pTotal = reading.gradePassage(passage, {}).total;
    user.readings = [
      rrec(passage, 'exam', tf, now - DAY),
      rrec(passage, 'exam', tf, now - 2 * DAY, { mockId: 'mock-x' }),
      rrec(passage, 'practice', tf, now),
      rrec(passage, 'exam', ['q99'], now - DAY),
    ];
    ielts.saveUser(user);

    const r = await call('/ielts/weakness?days=60');
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const L = r.data.listening;
    assert.strictEqual(L.records, 3);
    assert.strictEqual(L.skipped, 1);
    assert.strictEqual(L.questions, nQ * 2 + 2);
    const nf = formNos.length;
    assert.deepStrictEqual(find(L.byType, 'form-completion'), {
      key: 'form-completion', label: '表格填空', total: nf * 2 + 2, correct: nf, accuracy: W.accuracyOf(nf, nf * 2 + 2), enough: true,
    });
    assert.deepStrictEqual(L.causes, [
      { key: 'other', label: '其他（没听到 / 听错词）', count: nf - 2 + 2 },
      { key: 'blank', label: '未作答', count: 1 },
      { key: 'over-limit', label: '超出字数', count: 1 },
    ]);
    assert.deepStrictEqual(L.topCause, { key: 'other', label: '其他（没听到 / 听错词）', count: nf, knowledgeId: 'st-listening-prediction' });

    const R = r.data.reading;
    assert.strictEqual(R.records, 2, '练习模式不计入，模考写入的计入');
    assert.strictEqual(R.skipped, 1);
    assert.strictEqual(R.questions, pTotal * 2);
    assert.deepStrictEqual(find(R.byType, 'tfng'), { key: 'tfng', label: '判断 T/F/NG', total: tf.length * 2, correct: 0, accuracy: 0, enough: tf.length * 2 >= 8 });
    assert.deepStrictEqual(R.byDifficulty.map((x) => x.key), [passage.difficulty]);

    const w = r.data.weakest;
    assert.ok(w.length >= 1 && w.length <= 3);
    assert.deepStrictEqual(w[0], {
      skill: 'reading', key: 'tfng', label: '判断 T/F/NG', total: tf.length * 2, correct: 0, accuracy: 0,
      tip: W.TIPS.reading.tfng, knowledgeId: 'st-reading-tfng', practice: 'reading',
    });
    const lw = w.find((x) => x.skill === 'listening');
    assert.ok(lw && lw.key === 'form-completion' && lw.knowledgeId === 'st-listening-form-completion' && lw.practice === 'listening', JSON.stringify(w));

    const wide = (await call('/ielts/weakness?days=365')).data;
    assert.strictEqual(wide.listening.records, 4, '365 天窗口包含 100 天前那条');
    const narrow = (await call('/ielts/weakness?days=7')).data;
    assert.strictEqual(narrow.listening.records, 3);
  });
}

(async () => {
  try {
    await integration();
  } catch (e) {
    failed++;
    console.error(`FAIL: 接口集成测试没能运行：${e.stack || e.message}`);
  }
  console.log(`\n雅思弱项统计测试：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
