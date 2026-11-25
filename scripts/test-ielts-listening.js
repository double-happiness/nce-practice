'use strict';
// 雅思听力测试：判分（拼写、大小写、数字写法、字数超限）、band 换算、内容校验（真实数据 + 人为构造的坏数据）、记录清洗。
// 用法：node scripts/test-ielts-listening.js（只读 data/ielts/listening/ 与临时目录，不读写任何档案学习数据）

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const L = require('../lib/ielts-listening');

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

const clone = (v) => JSON.parse(JSON.stringify(v));
const realRaw = () => clone(L.getContent().raw);
const section = (id) => {
  const s = L.getSection(id);
  assert.ok(s, `真实数据里缺少 ${id}`);
  return s;
};
// 在 section 里按题号找题与所在组
function findQ(s, no) {
  for (const g of s.groups) for (const q of g.questions) if (q.no === no) return { g, q };
  throw new Error(`题号 ${no} 不存在`);
}
const errorsOf = (s) => L.validateSection(s).errors;
const hasError = (s, re) => errorsOf(s).some((m) => re.test(m));

// ---------------- 归一化与字数限制 ----------------
test('归一化：大小写、多余空白、首尾标点、全角、弯引号、千分位、货币空格', () => {
  assert.strictEqual(L.normalizeAnswer('  Kingsley  '), 'kingsley');
  assert.strictEqual(L.normalizeAnswer('driving   licence.'), 'driving licence');
  assert.strictEqual(L.normalizeAnswer('ＴＨＵＲＳＤＡＹ'), 'thursday');
  assert.strictEqual(L.normalizeAnswer('driver’s licence'), "driver's licence");
  assert.strictEqual(L.normalizeAnswer('3,000'), '3000');
  assert.strictEqual(L.normalizeAnswer('1,500,000'), '1500000');
  assert.strictEqual(L.normalizeAnswer('£ 32'), '£32');
  assert.strictEqual(L.normalizeAnswer('"app"'), 'app');
});

test('字数计数：连字符词算 1 个词，数字记号单独计', () => {
  assert.deepStrictEqual(L.countAnswerTokens('off-peak'), { words: 1, numbers: 0, total: 1 });
  assert.deepStrictEqual(L.countAnswerTokens('twenty-eight'), { words: 1, numbers: 0, total: 1 });
  assert.deepStrictEqual(L.countAnswerTokens('15 March'), { words: 1, numbers: 1, total: 2 });
  for (const n of ['15', '1,500', '7:45', '7.45', '£32', '15th', '25%', '3pm', '1/4']) {
    assert.deepStrictEqual(L.countAnswerTokens(n), { words: 0, numbers: 1, total: 1 }, n);
  }
  assert.deepStrictEqual(L.countAnswerTokens(''), { words: 0, numbers: 0, total: 0 });
});

test('字数限制：各档上限与「数字」额度', () => {
  const ok = (s, lim) => assert.strictEqual(L.fitsWordLimit(s, lim), true, `${s} 应符合 ${lim}`);
  const no = (s, lim) => assert.strictEqual(L.fitsWordLimit(s, lim), false, `${s} 应超出 ${lim}`);
  ok('library', 'ONE WORD ONLY');
  no('the library', 'ONE WORD ONLY');
  ok('15', 'ONE WORD ONLY'); // 「不带数字」的限制里数字按词计：1 个记号不超限
  no('15 March', 'ONE WORD ONLY');
  ok('15 March', 'ONE WORD AND/OR A NUMBER');
  no('15 16', 'ONE WORD AND/OR A NUMBER');
  no('the app', 'ONE WORD AND/OR A NUMBER');
  ok('transport committee', 'NO MORE THAN TWO WORDS');
  no('the transport committee', 'NO MORE THAN TWO WORDS');
  ok('15 March', 'NO MORE THAN TWO WORDS');
  ok('25 per cent', 'NO MORE THAN TWO WORDS AND/OR A NUMBER');
  no('about 25 per cent', 'NO MORE THAN TWO WORDS AND/OR A NUMBER');
  ok('a very big', 'NO MORE THAN THREE WORDS');
  no('a very big dog', 'NO MORE THAN THREE WORDS');
  no('anything', 'NOT A REAL LIMIT');
});

// ---------------- 判分 ----------------
test('判分：拼写必须正确，不做模糊匹配', () => {
  const s = section('l1-sports-centre');
  const { g, q } = findQ(s, 3); // Kingsley
  assert.strictEqual(L.gradeQuestion(q, g, 'Kingsley').correct, true);
  assert.strictEqual(L.gradeQuestion(q, g, 'Kingsly').correct, false);
  assert.strictEqual(L.gradeQuestion(q, g, 'Kingsleys').correct, false);
  const otter = findQ(section('l4-sea-otters'), 34); // stones，单数判错
  assert.strictEqual(L.gradeQuestion(otter.q, otter.g, 'stone').correct, false);
  assert.strictEqual(L.gradeQuestion(otter.q, otter.g, 'stones').correct, true);
});

test('判分：不区分大小写，忽略多余空白和首尾标点', () => {
  const s = section('l1-lost-property');
  const { g, q } = findQ(s, 8); // driving licence
  for (const v of ['DRIVING LICENCE', '  driving    licence ', 'Driving licence.', "driver's license"]) {
    assert.strictEqual(L.gradeQuestion(q, g, v).correct, true, v);
  }
  assert.strictEqual(L.gradeQuestion(q, g, 'drivinglicence').correct, false);
});

test('判分：数字的不同写法都在可接受写法表里', () => {
  const s = section('l1-sports-centre');
  const fee = findQ(s, 6);
  for (const v of ['32', '£32', '£ 32', 'thirty-two', 'Thirty-Two', '32.00']) {
    assert.strictEqual(L.gradeQuestion(fee.q, fee.g, v).correct, true, v);
  }
  assert.strictEqual(L.gradeQuestion(fee.q, fee.g, '36').correct, false);
  const hours = findQ(s, 9);
  assert.strictEqual(L.gradeQuestion(hours.q, hours.g, '3').correct, true);
  assert.strictEqual(L.gradeQuestion(hours.q, hours.g, 'three').correct, true);
  assert.strictEqual(L.gradeQuestion(hours.q, hours.g, 'two').correct, false);
  const words = findQ(section('l3-cycling-survey'), 30);
  for (const v of ['3000', '3,000', 'three thousand']) assert.strictEqual(L.gradeQuestion(words.q, words.g, v).correct, true, v);
  const date = findQ(section('l1-lost-property'), 2);
  for (const v of ['15', '15th', 'fifteenth']) assert.strictEqual(L.gradeQuestion(date.q, date.g, v).correct, true, v);
});

test('判分：超过字数限制判错并标 overLimit，即便包含正确答案', () => {
  const app = findQ(section('l1-sports-centre'), 10); // ONE WORD AND/OR A NUMBER
  assert.deepStrictEqual(L.gradeQuestion(app.q, app.g, 'the app'), { correct: false, overLimit: true, empty: false });
  const kelp = findQ(section('l4-sea-otters'), 38); // ONE WORD ONLY
  const r = L.gradeQuestion(kelp.q, kelp.g, 'kelp forests');
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.overLimit, true);
  const hours = findQ(section('l1-sports-centre'), 9);
  assert.strictEqual(L.gradeQuestion(hours.q, hours.g, '3 hours').overLimit, false); // 1 词 + 1 数字不超限，但不在写法表里
  assert.strictEqual(L.gradeQuestion(hours.q, hours.g, '3 hours').correct, false);
});

test('判分：空答案判错；选择题字母不区分大小写', () => {
  const app = findQ(section('l1-sports-centre'), 10);
  assert.deepStrictEqual(L.gradeQuestion(app.q, app.g, '   '), { correct: false, overLimit: false, empty: true });
  assert.strictEqual(L.gradeQuestion(app.q, app.g, undefined).empty, true);
  const mcq = findQ(section('l2-castle-tour'), 11); // C
  assert.strictEqual(L.gradeQuestion(mcq.q, mcq.g, 'c').correct, true);
  assert.strictEqual(L.gradeQuestion(mcq.q, mcq.g, 'A').correct, false);
  assert.strictEqual(L.gradeQuestion(mcq.q, mcq.g, 'to control a river crossing').correct, false);
  const match = findQ(section('l2-castle-tour'), 16); // F
  assert.strictEqual(L.gradeQuestion(match.q, match.g, ' f ').correct, true);
});

test('整组判分：首选写法全对 10/10；逐题结果带答案、解析、段落', () => {
  for (const s of L.getSections()) {
    const answers = {};
    for (const g of s.groups) for (const q of g.questions) answers[String(q.no)] = q.answer[0];
    const r = L.gradeSection(s, answers);
    assert.strictEqual(r.raw, r.total, `${s.id} 首选写法应全对`);
    assert.strictEqual(r.total, 10);
    assert.strictEqual(r.band, 9);
    for (const x of r.results) {
      assert.ok(Array.isArray(x.answer) && x.answer.length && x.explanation && Number.isInteger(x.segment), `${s.id} Q${x.no} 结果字段不全`);
    }
  }
  const empty = L.gradeSection(section('l1-sports-centre'), {});
  assert.strictEqual(empty.raw, 0);
  assert.strictEqual(empty.band, 1);
});

test('parseAnswers：只收本组题号、字符串或 null、长度上限', () => {
  const s = section('l1-sports-centre');
  assert.deepStrictEqual(L.parseAnswers(s, { 1: ' Brennan ', 2: null, 3: '  ' }), { answers: { 1: 'Brennan' } });
  assert.ok(L.parseAnswers(s, { 11: 'C' }).error);
  assert.ok(L.parseAnswers(s, JSON.parse('{"__proto__": "x"}')).error);
  assert.ok(L.parseAnswers(s, { 1: 5 }).error);
  assert.ok(L.parseAnswers(s, { 1: 'a'.repeat(L.MAX_ANSWER_LEN + 1) }).error);
  assert.ok(L.parseAnswers(s, ['a']).error);
  assert.ok(L.parseAnswers(s, null).error);
});

// ---------------- band 换算 ----------------
test('band：40 题换算表分界点', () => {
  const cases = [[40, 9], [39, 9], [38, 8.5], [37, 8.5], [36, 8], [35, 8], [34, 7.5], [32, 7.5], [31, 7], [30, 7], [29, 6.5], [26, 6.5],
    [25, 6], [23, 6], [22, 5.5], [18, 5.5], [17, 5], [16, 5], [15, 4.5], [13, 4.5], [12, 4], [10, 4], [9, 3.5], [8, 3.5],
    [7, 3], [6, 3], [5, 2.5], [4, 2.5], [3, 2], [2, 2], [1, 1], [0, 1]];
  for (const [raw40, band] of cases) assert.strictEqual(L.bandFrom40(raw40), band, `raw40=${raw40}`);
});

test('band：10 题按比例折算到 40 题', () => {
  const expected = [1, 2.5, 3.5, 4, 5, 5.5, 6, 6.5, 7.5, 8, 9];
  for (let raw = 0; raw <= 10; raw++) {
    assert.deepStrictEqual(L.estimateBand(raw, 10), { raw40: raw * 4, band: expected[raw] }, `raw=${raw}`);
  }
  assert.deepStrictEqual(L.estimateBand(30, 40), { raw40: 30, band: 7 });
  assert.deepStrictEqual(L.estimateBand(7, 13), { raw40: 22, band: 5.5 }); // 21.5 四舍五入
  assert.strictEqual(L.scaleTo40(12, 10), 40); // 越界夹回
  assert.strictEqual(L.scaleTo40(3, 0), 0);
});

// ---------------- 内容校验：真实数据 ----------------
test('真实数据：0 错误 0 警告，每部分至少 2 个 section、每个 10 题', () => {
  const r = L.validateAll();
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
  const items = L.getSections();
  // 内容会分批扩充，不写死总数
  assert.ok(items.length >= 8, `共 ${items.length} 个`);
  assert.strictEqual(L.getContent().rejected.length, 0);
  for (const p of L.PARTS) {
    const n = items.filter((s) => s.part === p).length;
    assert.ok(n >= 2, `Part ${p} 只有 ${n} 个`);
  }
  for (const s of items) assert.strictEqual(L.questionNumbers(s).length, 10, s.id);
});

test('真实数据：各部分题型与人数符合约定，Part 1 含拼写与数字', () => {
  const types = (p) => new Set(L.getSections().filter((s) => s.part === p).flatMap((s) => s.groups.map((g) => g.type)));
  assert.deepStrictEqual([...types(1)].sort(), ['form-completion', 'note-completion']);
  assert.deepStrictEqual([...types(2)].sort(), ['matching', 'mcq']);
  assert.deepStrictEqual([...types(3)].sort(), ['matching', 'mcq', 'sentence-completion']);
  assert.deepStrictEqual([...types(4)].sort(), ['note-completion', 'summary-completion']);
  for (const s of L.getSections().filter((x) => x.part === 1)) {
    const text = s.segments.map((x) => x.text).join(' ');
    assert.ok(/\b[A-Z], [A-Z], /.test(text), `${s.id} 应有逐字母拼写`);
    assert.ok(s.groups.some((g) => g.questions.some((q) => q.answer.some((a) => /\d/.test(a)))), `${s.id} 应有数字答案`);
  }
  for (const s of L.getSections().filter((x) => x.part === 3)) assert.ok(s.speakers.length >= 2 && s.speakers.length <= 3);
});

test('publicSection 不下发答案、解析、段落与依据', () => {
  for (const s of L.getSections()) {
    const t = JSON.stringify(L.publicSection(s));
    assert.ok(!/"answer"|"explanation"|"evidence"|"segment":/.test(t), s.id);
    assert.ok(/"segments"/.test(t) && /"speakers"/.test(t));
  }
});

// ---------------- 内容校验：人为构造的坏数据 ----------------
const base = () => clone(section('l1-sports-centre'));

test('坏数据：答案没有出现在对应 segment 里', () => {
  const s = base();
  findQ(s, 3).q.segment = 12; // Kingsley 实际在第 11 段
  assert.ok(hasError(s, /都没有出现在 segment 12/), errorsOf(s).join('\n'));
});

test('坏数据：segment 下标越界 / 不在本组音频范围', () => {
  const s = base();
  findQ(s, 1).q.segment = 999;
  assert.ok(hasError(s, /segment 必须是有效的段下标/));
  const s2 = base();
  findQ(s2, 7).q.segment = 5; // 第二组从 18 段开始
  assert.ok(hasError(s2, /不在本组音频范围/));
});

test('坏数据：答案超出字数限制', () => {
  const s = base();
  findQ(s, 10).q.answer.push('the app');
  assert.ok(hasError(s, /答案「the app」超出字数限制/));
});

test('坏数据：schema 缺字段、枚举非法、引用不存在', () => {
  const cases = [
    [(s) => delete s.title, /缺少 title/],
    [(s) => { s.part = 5; }, /part 必须是 1–4/],
    [(s) => { s.id = 'Bad ID'; }, /id 必须由小写字母/],
    [(s) => { s.speakers[0].gender = 'x'; }, /gender 必须是 female 或 male/],
    [(s) => { s.segments[0].speaker = 'nobody'; }, /speaker 不在 speakers 里/],
    [(s) => { s.segments[3].text = ''; }, /segments\[3\]: 缺少 text/],
    [(s) => { s.groups[0].type = 'essay'; }, /type 非法/],
    [(s) => { s.groups[0].wordLimit = 'TWO WORDS'; }, /必须给出 wordLimit/],
    [(s) => { s.groups[0].from = 1; }, /第一组的 from 必须是 0/],
    [(s) => { s.groups[1].from = 0; }, /from 必须严格递增/],
    [(s) => { findQ(s, 4).q.prompt = 'Occupation:'; }, /恰好包含一个 ___/],
    [(s) => { delete findQ(s, 5).q.explanation; }, /缺少 explanation/],
    [(s) => { findQ(s, 5).q.answer = []; }, /answer 必须是非空字符串数组/],
    [(s) => { findQ(s, 6).q.no = 8; }, /题号重复/],
    [(s) => { s.groups[0].questions.splice(2, 1); }, /题号必须按顺序连续/],
  ];
  cases.forEach(([mutate, re], i) => {
    const s = base();
    mutate(s);
    assert.ok(hasError(s, re), `case ${i} 期望 ${re}，实际：\n${errorsOf(s).join('\n')}`);
  });
});

test('坏数据：选择 / 匹配题的答案、选项与 evidence', () => {
  const mk = () => clone(section('l2-castle-tour'));
  let s = mk();
  findQ(s, 11).q.answer = ['D'];
  assert.ok(hasError(s, /answer D 不在选项里/));
  s = mk();
  findQ(s, 11).q.answer = ['A', 'C'];
  assert.ok(hasError(s, /只能有一个字母/));
  s = mk();
  delete findQ(s, 12).q.evidence;
  assert.ok(hasError(s, /必须给出 evidence/));
  s = mk();
  findQ(s, 13).q.evidence = 'go up after lunch';
  assert.ok(hasError(s, /evidence「go up after lunch」没有出现在 segment/));
  s = mk();
  findQ(s, 14).q.options = [{ key: 'A', text: 'x' }, { key: 'A', text: 'y' }, { key: 'b', text: 'z' }];
  assert.ok(hasError(s, /选项字母重复/) && hasError(s, /选项必须是/));
  s = mk();
  s.groups[1].options = s.groups[1].options.slice(0, 2);
  assert.ok(hasError(s, /至少需要 3 个选项/));
  s = mk();
  s.groups[1].questions[0].options = [{ key: 'A', text: 'x' }];
  assert.ok(hasError(s, /只有 mcq 题可以有 options/));
});

test('坏数据：只违反约定时给 warning 而不是 error', () => {
  const s = clone(section('l2-castle-tour'));
  s.speakers.push({ id: 'host', name: 'Host', gender: 'male' });
  s.segments.push({ speaker: 'host', text: 'Thank you, Rachel.' });
  s.groups[1].questions.pop(); // 只剩 9 题
  const r = L.validateSection(s);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.warnings.some((m) => /一般是独白/.test(m)), r.warnings.join('\n'));
  assert.ok(r.warnings.some((m) => /应有 10 题/.test(m)));
});

test('validateListeningContent：id 重复、非对象、非数组', () => {
  const items = realRaw();
  items.push(clone(items[0]));
  items.push('oops');
  const r = L.validateListeningContent(items);
  assert.ok(r.errors.some((m) => /id 重复/.test(m)), r.errors.join('\n'));
  assert.ok(r.errors.some((m) => /条目必须是对象/.test(m)));
  assert.ok(r.errors.every((m) => m.startsWith('ielts/')));
  assert.ok(L.validateListeningContent({}).errors.length);
});

test('加载：有 error 的 section 跳过不下发，坏 JSON 记为读取问题', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-listening-test-'));
  const prev = process.env.IELTS_DATA_DIR;
  const origError = console.error;
  try {
    fs.mkdirSync(path.join(dir, 'listening'));
    const good = clone(section('l1-sports-centre'));
    const bad = clone(section('l1-lost-property'));
    findQ(bad, 1).q.segment = 0;
    fs.writeFileSync(path.join(dir, 'listening', 'a.json'), JSON.stringify([good, bad]));
    fs.writeFileSync(path.join(dir, 'listening', 'b.json'), '{ not json');
    process.env.IELTS_DATA_DIR = dir;
    console.error = () => {}; // 预期会打一条「已跳过」日志
    L.reload();
    const c = L.getContent();
    assert.deepStrictEqual(c.items.map((s) => s.id), ['l1-sports-centre']);
    assert.strictEqual(c.rejected.length, 1);
    assert.strictEqual(L.getSection('l1-lost-property'), null);
    const all = L.validateAll();
    assert.ok(all.errors.some((m) => /b\.json: 读取或 JSON 解析失败/.test(m)), all.errors.join('\n'));
    assert.ok(all.errors.some((m) => /listening\/a\.json \[1\] id=l1-lost-property/.test(m)));
  } finally {
    console.error = origError;
    if (prev === undefined) delete process.env.IELTS_DATA_DIR;
    else process.env.IELTS_DATA_DIR = prev;
    L.reload();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------- 作答记录 ----------------
test('记录清洗：丢弃不合法记录，最多保留 300 条，最好成绩取正确率最高、同分取最近', () => {
  const rec = (over) => ({ id: 'x', sectionId: 'l1-sports-centre', part: 1, mode: 'exam', raw: 5, total: 10, band: 5.5, durationSec: 0, answers: {}, ts: 1, ...over });
  const raw = [rec(), rec({ mode: 'quiz' }), rec({ raw: 11 }), rec({ band: 5.3 }), rec({ sectionId: '../x' }), null, 'x', rec({ ts: 'now' })];
  assert.strictEqual(L.sanitizeListenings(raw).length, 1);
  assert.deepStrictEqual(L.sanitizeListenings({}), []);
  let list = [];
  for (let i = 0; i < L.MAX_LISTENINGS + 5; i++) list = L.appendRecord(list, rec({ ts: i }));
  assert.strictEqual(list.length, L.MAX_LISTENINGS);
  assert.strictEqual(list[0].ts, 5);
  const stats = L.statsBySection([
    rec({ raw: 7, ts: 10 }),
    rec({ raw: 8, band: 7.5, ts: 5, mode: 'practice' }),
    rec({ raw: 8, band: 7.5, ts: 20 }),
    rec({ raw: 3, band: 4, ts: 30 }),
  ]).get('l1-sports-centre');
  assert.strictEqual(stats.attempts, 4);
  assert.deepStrictEqual(stats.best, { raw: 8, total: 10, band: 7.5, mode: 'exam', ts: 20 });
  assert.strictEqual(stats.last.ts, 30);
});

console.log(`\n雅思听力测试：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
