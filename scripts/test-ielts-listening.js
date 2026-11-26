'use strict';
// 雅思听力测试：判分（拼写、大小写、数字写法、字数超限）、band 换算、内容校验（真实数据 + 人为构造的坏数据）、记录清洗，
// 以及多选（组内去重）、地图标注、流程图填空三种题组（夹具 scripts/fixtures/ielts-listening/new-types.json）。
// 用法：node scripts/test-ielts-listening.js（只读 data/ielts/listening/、夹具与临时目录，不读写任何档案学习数据）

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
// 全对作答：mcq-multi 每题的 answer 是完整正确集合，按题在组内的位置各填一个字母（都填 answer[0] 会被组内去重判错）
function correctAnswers(s) {
  const out = {};
  for (const g of s.groups) {
    g.questions.forEach((q, i) => {
      out[String(q.no)] = g.type === 'mcq-multi' ? q.answer[i] : q.answer[0];
    });
  }
  return out;
}

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
    const r = L.gradeSection(s, correctAnswers(s));
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
  // 每部分至少有原有题型，且不超出约定（新题型的内容分批加入，这里不写死）
  const expect = {
    1: [['form-completion', 'note-completion'], []],
    2: [['matching', 'mcq'], ['map-labelling', 'mcq-multi']],
    3: [['matching', 'mcq', 'sentence-completion'], ['flowchart-completion', 'mcq-multi']],
    4: [['note-completion', 'summary-completion'], ['flowchart-completion']],
  };
  for (const [p, [must, extra]] of Object.entries(expect)) {
    const got = types(Number(p));
    for (const t of must) assert.ok(got.has(t), `Part ${p} 缺 ${t}`);
    for (const t of got) assert.ok(must.includes(t) || extra.includes(t), `Part ${p} 出现约定外的 ${t}`);
  }
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

// ---------------- 新题型：多选 / 地图标注 / 流程图填空 ----------------
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ielts-listening', 'new-types.json'), 'utf8'));
const fx = (id) => clone(FIXTURE.find((s) => s.id === id));
const wetland = () => fx('lx-wetland-tour'); // Part 2：mcq-multi 11–12（B、D）+ mcq 13–15 + map-labelling 16–20
const river = () => fx('lx-river-project'); // Part 3：mcq-multi 21–23（A、C、E）+ mcq-multi 24–25（A、C）+ flowchart 26–30
const groupOf = (s, type, nth = 0) => s.groups.filter((g) => g.type === type)[nth];
const rawOf = (s, answers) => L.gradeSection(s, answers).raw;
const resultOf = (s, answers, no) => L.gradeSection(s, answers).results.find((x) => x.no === no);

test('题型常量：顺序为填空类（原 4 种 + 流程图）在前、选择类在后', () => {
  assert.deepStrictEqual(L.COMPLETION_TYPES, ['form-completion', 'note-completion', 'sentence-completion', 'summary-completion', 'flowchart-completion']);
  assert.deepStrictEqual(L.CHOICE_TYPES, ['mcq', 'matching', 'map-labelling', 'mcq-multi']);
  assert.deepStrictEqual(L.GROUP_TYPES, [...L.COMPLETION_TYPES, ...L.CHOICE_TYPES]);
});

test('夹具：三种新题组合法，0 错误 0 警告；首选写法全对', () => {
  for (const s of FIXTURE) {
    assert.deepStrictEqual(L.validateSection(s), { errors: [], warnings: [] }, s.id);
    assert.strictEqual(rawOf(s, correctAnswers(s)), 10, s.id);
  }
});

test('optionsOf / promptOf：按题型取选项与题干', () => {
  const s = wetland();
  const multi = groupOf(s, 'mcq-multi');
  const mcq = groupOf(s, 'mcq');
  const map = groupOf(s, 'map-labelling');
  assert.strictEqual(L.optionsOf(multi, multi.questions[0]), multi.options);
  assert.strictEqual(L.optionsOf(mcq, mcq.questions[1]), mcq.questions[1].options);
  assert.strictEqual(L.optionsOf(map, map.questions[0]), map.options);
  const castle = clone(section('l2-castle-tour'));
  const matching = groupOf(castle, 'matching');
  assert.strictEqual(L.optionsOf(matching, matching.questions[0]), matching.options);
  const flow = groupOf(river(), 'flowchart-completion');
  assert.strictEqual(L.optionsOf(flow, flow.questions[0]), null);
  const form = section('l1-sports-centre').groups[0];
  assert.strictEqual(L.optionsOf(form, form.questions[0]), null);
  assert.strictEqual(L.optionsOf(null, null), null);
  assert.strictEqual(L.optionsOf({ type: 'mcq' }, {}), null, '选项不是数组时为 null');
  assert.strictEqual(L.promptOf(multi, multi.questions[0]), multi.prompt);
  assert.strictEqual(L.promptOf(mcq, mcq.questions[0]), mcq.questions[0].prompt);
  assert.strictEqual(L.promptOf(map, map.questions[2]), 'bird hide');
  assert.strictEqual(L.promptOf(flow, {}), '');
});

test('多选判分：组内去重，顺序不限、大小写不敏感', () => {
  const s = wetland();
  const base = correctAnswers(s); // 其余 8 题全对，只改 11、12
  const with12 = (a11, a12) => {
    const a = { ...base, 11: a11, 12: a12 };
    if (a11 === undefined) delete a[11];
    if (a12 === undefined) delete a[12];
    return a;
  };
  const multiRaw = (a11, a12) => rawOf(s, with12(a11, a12)) - 8;
  assert.strictEqual(multiRaw('B', 'D'), 2);
  assert.strictEqual(multiRaw('D', 'B'), 2, '顺序不限');
  assert.strictEqual(multiRaw('B', 'B'), 1, '两题都填 B 只得 1 分');
  assert.strictEqual(multiRaw('B', ''), 1);
  assert.strictEqual(multiRaw('B', undefined), 1);
  assert.strictEqual(multiRaw('b', 'd'), 2, '小写也算');
  assert.strictEqual(multiRaw(' d ', 'D'), 1, '去重不分大小写、忽略首尾空白');
  assert.strictEqual(multiRaw('A', 'C'), 0);
  assert.strictEqual(multiRaw('A', 'B'), 1);
  // 去重按题号顺序：先出现的题得分
  const r = L.gradeSection(s, with12('B', 'B'));
  assert.deepStrictEqual(r.results.filter((x) => x.no <= 12).map((x) => [x.no, x.correct, x.yours]), [[11, true, 'B'], [12, false, 'B']]);
  // 结果形状不变，answer 是完整正确集合
  const x = resultOf(s, with12('d', 'B'), 11);
  assert.deepStrictEqual(Object.keys(x).sort(), ['answer', 'correct', 'evidence', 'explanation', 'no', 'overLimit', 'segment', 'yours']);
  assert.deepStrictEqual(x.answer, ['B', 'D']);
  assert.strictEqual(x.yours, 'd');
  assert.strictEqual(x.overLimit, false);
  // 题目数组没按题号排列时仍按题号去重（不依赖数组顺序）
  const swapped = wetland();
  groupOf(swapped, 'mcq-multi').questions.reverse();
  const got = L.gradeSection(swapped, with12('B', 'B')).results.filter((y) => y.no <= 12).map((y) => [y.no, y.correct]);
  assert.deepStrictEqual(got.sort((a, b) => a[0] - b[0]), [[11, true], [12, false]]);
});

test('多选判分：三选一组，去重只在本组内', () => {
  const s = river();
  assert.strictEqual(rawOf(s, { 21: 'E', 22: 'A', 23: 'C' }), 3);
  assert.strictEqual(rawOf(s, { 21: 'A', 22: 'A', 23: 'C' }), 2);
  assert.strictEqual(rawOf(s, { 21: 'A', 22: 'A', 23: 'a' }), 1);
  assert.strictEqual(rawOf(s, { 21: 'B', 22: 'D', 23: 'F' }), 0);
  // 第 21 题和第 24 题都填 A：分属两组，各自算对
  assert.strictEqual(rawOf(s, { 21: 'A', 24: 'A' }), 2);
  assert.strictEqual(rawOf(s, { 24: 'C', 25: 'c' }), 1);
});

test('多选 gradeQuestion：单题只判「是否在正确集合里」', () => {
  const s = wetland();
  const g = groupOf(s, 'mcq-multi');
  const [q11, q12] = g.questions;
  assert.strictEqual(L.gradeQuestion(q12, g, 'B').correct, true, '第 12 题填 B 也在集合里');
  assert.strictEqual(L.gradeQuestion(q11, g, 'd').correct, true);
  assert.strictEqual(L.gradeQuestion(q11, g, 'C').correct, false);
  assert.strictEqual(L.gradeQuestion(q11, g, 'feed the birds').correct, false, '只认字母');
  assert.deepStrictEqual(L.gradeQuestion(q11, g, ' '), { correct: false, overLimit: false, empty: true });
});

test('地图标注判分：一个字母、不分大小写，写地名不算', () => {
  const s = wetland();
  const g = groupOf(s, 'map-labelling');
  const q = g.questions.find((x) => x.no === 18); // C
  assert.strictEqual(L.gradeQuestion(q, g, 'C').correct, true);
  assert.strictEqual(L.gradeQuestion(q, g, ' c ').correct, true);
  assert.strictEqual(L.gradeQuestion(q, g, 'D').correct, false);
  assert.strictEqual(L.gradeQuestion(q, g, 'bird hide').correct, false);
  // 地图题不做组内去重：第 16、17 题都填 B，16 对（答案 B）、17 错（答案 A）
  const a = { ...correctAnswers(s), 16: 'B', 17: 'B' };
  assert.strictEqual(rawOf(s, a), 9);
  assert.strictEqual(resultOf(s, a, 16).correct, true);
  assert.strictEqual(resultOf(s, a, 17).correct, false);
});

test('流程图填空判分：与笔记填空相同（拼写、大小写、字数限制）', () => {
  const s = river();
  const g = groupOf(s, 'flowchart-completion');
  const q = g.questions.find((x) => x.no === 27); // oven，ONE WORD ONLY
  assert.strictEqual(L.gradeQuestion(q, g, 'Oven').correct, true);
  assert.strictEqual(L.gradeQuestion(q, g, ' OVEN. ').correct, true);
  assert.strictEqual(L.gradeQuestion(q, g, 'ovan').correct, false);
  assert.deepStrictEqual(L.gradeQuestion(q, g, 'an oven'), { correct: false, overLimit: true, empty: false });
  const r = resultOf(s, { 26: 'sieved', 27: 'the oven' }, 27);
  assert.strictEqual(r.overLimit, true);
  assert.strictEqual(r.correct, false);
  assert.strictEqual(resultOf(s, { 26: 'SIEVED' }, 26).correct, true);
});

test('Part 题型约定：新题型放在约定的 Part 不报 warning，放错只给 warning', () => {
  // 夹具本身（Part 2 多选 + 地图、Part 3 多选 + 流程图）0 警告已在上面验证；这里补 Part 4 的流程图
  const p4 = river();
  p4.part = 4;
  p4.speakers.pop();
  p4.segments.forEach((sg) => { sg.speaker = 'anna'; });
  const w4 = L.validateSection(p4);
  assert.deepStrictEqual(w4.errors, []);
  assert.ok(!w4.warnings.some((m) => /一般不用 flowchart-completion/.test(m)), w4.warnings.join('\n'));
  const cases = [
    [wetland(), 3, /Part 3 一般不用 map-labelling/],
    [river(), 2, /Part 2 一般不用 flowchart-completion/],
    [wetland(), 1, /Part 1 一般不用 mcq-multi/],
    [river(), 4, /Part 4 一般不用 mcq-multi/],
  ];
  for (const [s, part, re] of cases) {
    s.part = part;
    const r = L.validateSection(s);
    assert.deepStrictEqual(r.errors, []);
    assert.ok(r.warnings.some((m) => re.test(m)), `${re}：${r.warnings.join('\n')}`);
  }
});

// 对夹具做一处改动，期望出现某条错误
function expectError(make, mutate, re, label) {
  const s = make();
  mutate(s);
  const errs = errorsOf(s);
  assert.ok(errs.some((m) => re.test(m)), `${label || re} 期望 ${re}，实际：\n${errs.join('\n')}`);
}

test('坏数据：流程图 flow', () => {
  const flow = (s) => groupOf(s, 'flowchart-completion');
  const cases = [
    [(s) => { flow(s).flow = []; }, /flow: 必须是非空数组/],
    [(s) => { flow(s).flow = 'x'; }, /flow: 必须是非空数组/],
    [(s) => { flow(s).flow[0] = 'step'; }, /flow\[0\]: 必须是对象/],
    [(s) => { flow(s).flow[0].note = 'x'; }, /flow\[0\]: 未知字段 note/],
    [(s) => { flow(s).flow[0] = { text: 'x', no: 26 }; }, /flow\[0\]: 必须且只能有 text 或 no 之一/],
    [(s) => { flow(s).flow[0] = {}; }, /flow\[0\]: 必须且只能有 text 或 no 之一/],
    [(s) => { flow(s).flow[0].text = '  '; }, /flow\[0\]: text 必须是非空字符串/],
    [(s) => { flow(s).flow[0].text = 'Samples ___ from the river'; }, /flow\[0\]: text 是固定步骤，不能含 ___/],
    [(s) => { flow(s).flow[1].no = 25; }, /flow\[1\]: no 25 不是本组的题号/],
    [(s) => { flow(s).flow[1].no = '26'; }, /flow\[1\]: no 26 不是本组的题号/],
    [(s) => { flow(s).flow.splice(1, 1); }, /第 26 题必须在流程里恰好出现一次（实际 0 次）/],
    [(s) => { flow(s).flow.push({ no: 30 }); }, /第 30 题必须在流程里恰好出现一次（实际 2 次）/],
    [(s) => { flow(s).questions[0].prompt = 'Mud sieved to remove stones'; }, /恰好包含一个 ___/],
    [(s) => { delete flow(s).wordLimit; }, /填空题必须给出 wordLimit/],
    [(s) => { flow(s).questions[1].answer = ['microwave']; }, /都没有出现在 segment 9/],
    [(s) => { groupOf(s, 'mcq-multi').flow = [{ no: 21 }]; }, /只有 flowchart-completion 组可以有 flow/],
  ];
  cases.forEach(([mutate, re], i) => expectError(river, mutate, re, `case ${i}`));
  // 没有 flow 也合法（前端按题号顺序每题一个框）
  const s = river();
  delete flow(s).flow;
  assert.deepStrictEqual(L.validateSection(s), { errors: [], warnings: [] });
});

test('坏数据：地图标注 figure 与地物', () => {
  const map = (s) => groupOf(s, 'map-labelling');
  const feats = (s) => map(s).figure.maps[0].features;
  const cases = [
    [(s) => { delete map(s).figure; }, /figure: 地图题必须给出 figure/],
    [(s) => { map(s).figure = []; }, /figure: 地图题必须给出 figure/],
    [(s) => { map(s).figure.type = 'bar'; }, /figure: type 必须是 map/],
    [(s) => { map(s).figure.compass = 'yes'; }, /figure: compass 必须是 true \/ false/],
    [(s) => { map(s).figure.title = 3; }, /figure: title 必须是字符串/],
    [(s) => { map(s).figure.maps.push(clone(map(s).figure.maps[0])); }, /maps 必须恰好 1 张（实际 2）/],
    [(s) => { map(s).figure.maps = {}; }, /maps 必须恰好 1 张（实际 非数组）/],
    [(s) => { map(s).figure.maps[0] = 'x'; }, /maps\[0\]: 必须是对象/],
    [(s) => { map(s).figure.maps[0].features = []; }, /features 不能为空/],
    [(s) => { feats(s)[0] = null; }, /features\[0\]: 必须是对象/],
    [(s) => { feats(s)[0].kind = 'river'; }, /features\[0\]: kind 必须是 building \/ road \/ park \/ water \/ car-park \/ label/],
    [(s) => { feats(s)[0].x = 101; }, /features\[0\]: x 必须是 0–100 的数字/],
    [(s) => { feats(s)[0].y = -1; }, /features\[0\]: y 必须是 0–100 的数字/],
    [(s) => { feats(s)[0].w = '30'; }, /features\[0\]: w 必须是 0–100 的数字/],
    [(s) => { delete feats(s)[0].h; }, /features\[0\]: h 必须是 0–100 的数字/],
    [(s) => { feats(s)[0].x = 80; }, /features\[0\]: 超出地图范围/],
    [(s) => { feats(s)[0].h = 0; }, /features\[0\]: water 的 w、h 必须大于 0/],
    [(s) => { feats(s)[0].label = 5; }, /features\[0\]: label 必须是字符串/],
    [(s) => { feats(s)[6].label = ''; }, /features\[6\]: label 地物的 label 不能为空/],
    [(s) => { feats(s)[6].w = 120; }, /features\[6\]: w 必须是 0–100 的数字/],
    [(s) => { feats(s)[6].x = 99; feats(s)[6].w = 5; }, /features\[6\]: 超出地图范围/],
    [(s) => { groupOf(s, 'mcq').figure = clone(map(s).figure); }, /只有 map-labelling 组可以有 figure/],
  ];
  cases.forEach(([mutate, re], i) => expectError(wetland, mutate, re, `case ${i}`));
});

test('坏数据：地图标注选项与题目', () => {
  const map = (s) => groupOf(s, 'map-labelling');
  const feats = (s) => map(s).figure.maps[0].features;
  const cases = [
    [(s) => { map(s).options[0].key = 'a'; }, /options\[0\]: 选项必须是 \{ key: 单个大写字母, text: 非空字符串（可省） \}/],
    [(s) => { map(s).options[0].text = ''; }, /options\[0\]: 选项必须是/],
    [(s) => { map(s).options[1].key = 'A'; }, /options\[1\]: 选项字母重复 \(A\)/],
    [(s) => { map(s).options.push({ key: 'J' }); }, /选项 J 在图上找不到/],
    [(s) => { feats(s)[8].label = 'c'; }, /选项 C 在图上找不到/],
    [(s) => { Object.assign(feats(s)[8], { kind: 'building', w: 4, h: 4 }); }, /选项 C 在图上找不到/],
    [(s) => { map(s).options = map(s).options.slice(0, 6); }, /地图题选项至少要比题数多 2 个（本组 5 题，至少 7 个选项，实际 6）/],
    [(s) => { delete map(s).options; }, /至少需要 3 个选项/],
    [(s) => { map(s).questions[0].answer = ['J']; }, /answer J 不在选项里/],
    [(s) => { map(s).questions[0].answer = ['B', 'C']; }, /只能有一个字母/],
    [(s) => { delete map(s).questions[0].prompt; }, /no=16: 缺少 prompt/],
    [(s) => { delete map(s).questions[0].evidence; }, /no=16: 选择 \/ 匹配题必须给出 evidence/],
    [(s) => { map(s).questions[0].evidence = 'on your right'; }, /evidence「on your right」没有出现在 segment 7/],
    [(s) => { map(s).questions[0].options = [{ key: 'A', text: 'x' }]; }, /只有 mcq 题可以有 options/],
  ];
  cases.forEach(([mutate, re], i) => expectError(wetland, mutate, re, `case ${i}`));
  // figure 本身坏了时只报 figure 的错，不再逐个报「在图上找不到」
  const s = wetland();
  map(s).figure.maps.push({ title: '', features: [] });
  assert.ok(!errorsOf(s).some((m) => /在图上找不到/.test(m)), errorsOf(s).join('\n'));
  // 选项给了 text 也可以
  const t = wetland();
  map(t).options.forEach((o) => { o.text = `place ${o.key}`; });
  assert.deepStrictEqual(errorsOf(t), []);
});

test('坏数据：多选组', () => {
  const multi = (s) => groupOf(s, 'mcq-multi');
  const cases = [
    [(s) => { delete multi(s).prompt; }, /多选题组必须给出 prompt/],
    [(s) => { multi(s).prompt = ' '; }, /多选题组必须给出 prompt/],
    [(s) => { multi(s).options = multi(s).options.slice(0, 2); }, /至少需要 3 个选项/],
    [(s) => { for (const k of ['F', 'G', 'H']) multi(s).options.push({ key: k, text: k }); }, /最多 7 个选项（实际 8）/],
    [(s) => { delete multi(s).options[0].text; }, /options\[0\]: 选项必须是 \{ key: 单个大写字母, text: 非空字符串 \}/],
    [(s) => { multi(s).options[2].key = 'B'; }, /选项字母重复 \(B\)/],
    [(s) => { multi(s).questions.pop(); }, /多选题一组必须是 2 或 3 题（题数 = 要选的个数，实际 1）/],
    [(s) => { multi(s).questions[1].answer = ['D', 'B']; }, /组内每题的 answer 必须完全相同/],
    [(s) => { multi(s).questions[1].answer = ['B', 'E']; }, /组内每题的 answer 必须完全相同/],
    [(s) => { multi(s).questions.forEach((q) => { q.answer = ['B']; }); }, /个数等于本组题数 2（实际 1）/],
    [(s) => { multi(s).questions.forEach((q) => { q.answer = ['B', 'D', 'E']; }); }, /个数等于本组题数 2（实际 3）/],
    [(s) => { multi(s).questions.forEach((q) => { q.answer = ['B', 'B']; }); }, /多选题 answer 有重复字母/],
    [(s) => { multi(s).questions.forEach((q) => { q.answer = ['B', 'J']; }); }, /answer J 不在选项里/],
    [(s) => { multi(s).questions.forEach((q) => { q.answer = ['B', 'd']; }); }, /answer d 不在选项里/],
    [(s) => { multi(s).questions[0].prompt = ''; }, /no=11: prompt 必须是非空字符串（多选题可省/],
    [(s) => { delete multi(s).questions[1].evidence; }, /no=12: 选择 \/ 匹配题必须给出 evidence/],
    [(s) => { multi(s).questions[1].evidence = "please don't feed the birds"; }, /no=12: evidence「please don't feed the birds」没有出现在 segment 2/],
    [(s) => { multi(s).questions[1].segment = 4; }, /no=12: segment 4 不在本组音频范围 0–2 内/],
    [(s) => { delete multi(s).questions[0].explanation; }, /no=11: 缺少 explanation/],
    [(s) => { multi(s).questions[0].options = [{ key: 'A', text: 'x' }]; }, /只有 mcq 题可以有 options（matching \/ map-labelling \/ mcq-multi 的选项放在组上）/],
    [(s) => { groupOf(s, 'mcq').prompt = 'Which?'; }, /只有 mcq-multi 组可以有 prompt/],
    [(s) => { groupOf(s, 'mcq').options = clone(multi(s).options); }, /只有 matching \/ map-labelling \/ mcq-multi 组可以有 options/],
  ];
  cases.forEach(([mutate, re], i) => expectError(wetland, mutate, re, `case ${i}`));
  // 一组 4 题也不行（真考只有 Choose TWO / THREE）：把第二个多选组的第 24 题并进第一组
  expectError(river, (s) => {
    const [g1, g2] = s.groups;
    g1.questions.push(g2.questions.shift());
  }, /多选题一组必须是 2 或 3 题（题数 = 要选的个数，实际 4）/);
  // 题目上给 prompt 也合法
  const ok = wetland();
  multi(ok).questions[0].prompt = 'reason 1';
  assert.deepStrictEqual(errorsOf(ok), []);
});

test('publicSection：新题型下发组 prompt / flow / figure，不泄露答案', () => {
  const w = L.publicSection(wetland());
  const r = L.publicSection(river());
  for (const p of [w, r]) assert.ok(!/"answer"|"explanation"|"evidence"|"segment":/.test(JSON.stringify(p)));
  const multi = w.groups[0];
  assert.strictEqual(multi.type, 'mcq-multi');
  assert.strictEqual(multi.prompt, 'Which TWO things are visitors NOT allowed to do at the reserve?');
  assert.deepStrictEqual(multi.questions, [{ no: 11, prompt: '' }, { no: 12, prompt: '' }], '题目没有 prompt 时下发空串');
  assert.strictEqual(multi.options.length, 5);
  const map = w.groups[2];
  assert.deepStrictEqual(map.figure, wetland().groups[2].figure);
  assert.deepStrictEqual(map.options[0], { key: 'A', text: '' }, '地图题选项没有文字时下发空串');
  assert.ok(!('prompt' in map) && !('flow' in map));
  const flow = r.groups[2];
  assert.deepStrictEqual(flow.flow, river().groups[2].flow);
  assert.ok(!('figure' in flow) && !('prompt' in flow));
  // 下发的 figure 是副本，改它不影响内容
  const src = wetland();
  const pub = L.publicSection(src);
  pub.groups[2].figure.maps[0].features.length = 0;
  assert.ok(src.groups[2].figure.maps[0].features.length > 0);
  // 旧题型不多出字段
  const old = L.publicSection(section('l2-castle-tour'));
  for (const g of old.groups) assert.ok(!('prompt' in g) && !('flow' in g) && !('figure' in g));
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
