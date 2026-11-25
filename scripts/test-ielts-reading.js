'use strict';
// 雅思阅读测试：判分规则（大小写、空格、可接受写法、字数超限、T/F/NG 缩写）、band 换算、
// 内容校验（真实数据必须通过，构造的坏数据必须报错）、作答记录清洗、对外视图不泄露答案。
// 用法：node scripts/test-ielts-reading.js（只读 data/ielts/reading/，不读写任何档案学习数据）

const assert = require('assert');
const R = require('../lib/ielts-reading');

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
const realPassages = () => R.getContent().passages;
const realById = (id) => {
  const p = realPassages().find((x) => x.id === id);
  assert.ok(p, `真实数据里缺少 ${id}`);
  return p;
};
// 断言校验结果里有一条错误包含给定片段
function assertError(result, fragment) {
  assert.ok(
    result.errors.some((e) => e.includes(fragment)),
    `期望错误包含「${fragment}」，实际：\n    ${result.errors.join('\n    ') || '（无错误）'}`
  );
}

// ---------------- 判分：归一化与填空 ----------------
const two = { type: 'sentence-completion', wordLimit: { words: 2 } };
const threeNum = { type: 'short-answer', wordLimit: { words: 3, number: true } };
const q = (answer) => ({ id: 'q1', number: 1, answer });

test('不区分大小写、去首尾空格、合并多余空格', () => {
  const qq = q(['carbon dioxide']);
  for (const r of ['carbon dioxide', 'Carbon Dioxide', '  CARBON   dioxide ', 'carbon\tdioxide', 'carbon dioxide']) {
    assert.strictEqual(R.gradeQuestion(qq, two, r).correct, true, r);
  }
  assert.strictEqual(R.normalizeAnswer('  It’s  OK '), "it's ok");
});

test('拼写必须正确，可接受写法逐个列出', () => {
  const qq = q(['waterproof membrane', 'membrane']);
  assert.strictEqual(R.gradeQuestion(qq, two, 'membrane').correct, true);
  assert.strictEqual(R.gradeQuestion(qq, two, 'Waterproof Membrane').correct, true);
  assert.strictEqual(R.gradeQuestion(qq, two, 'waterproof membrain').correct, false);
  assert.strictEqual(R.gradeQuestion(qq, two, 'membranes').correct, false);
  assert.strictEqual(R.gradeQuestion(qq, two, 'waterproof').correct, false);
});

test('填空超出字数限制直接判错，并标记 overLimit', () => {
  const qq = q(['carbon dioxide']);
  const r = R.gradeQuestion(qq, two, 'the carbon dioxide');
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.overLimit, true);
  // 没超字数的错答不标 overLimit
  assert.strictEqual(R.gradeQuestion(qq, two, 'oxygen').overLimit, false);
  // 即使「可接受写法」本身写多了，超限也判错（校验会拦下这种数据）
  assert.strictEqual(R.gradeQuestion(q(['the carbon dioxide']), two, 'the carbon dioxide').correct, false);
});

test('AND/OR A NUMBER：一个数字不计入词数，连字符词算一个词', () => {
  const qq = q(['1858', 'in 1858']);
  assert.strictEqual(R.gradeQuestion(qq, threeNum, 'in 1858').correct, true);
  assert.strictEqual(R.gradeQuestion(qq, threeNum, '1858').correct, true);
  assert.deepStrictEqual(R.checkWordLimit('in the year 1858', threeNum.wordLimit), { ok: true, words: 3, numbers: 1 });
  assert.strictEqual(R.checkWordLimit('in the early year 1858', threeNum.wordLimit).ok, false);
  assert.strictEqual(R.checkWordLimit('1,200 and 1858', { words: 1, number: true }).ok, false); // 第二个数字按词计
  assert.strictEqual(R.checkWordLimit('1858 ad', { words: 1 }).ok, false); // 不允许数字时数字也算词
  assert.strictEqual(R.checkWordLimit('well-known', { words: 1 }).ok, true);
  assert.strictEqual(R.wordLimitLabel({ words: 2 }), 'NO MORE THAN TWO WORDS');
  assert.strictEqual(R.wordLimitLabel({ words: 3, number: true }), 'NO MORE THAN THREE WORDS AND/OR A NUMBER');
  assert.strictEqual(R.wordLimitLabel({ words: 1 }), 'ONE WORD ONLY');
  assert.strictEqual(R.wordLimitLabel({ words: 1, number: true }), 'ONE WORD AND/OR A NUMBER');
});

test('空答案判错并标记 blank', () => {
  const r = R.gradeQuestion(q(['grants']), two, '   ');
  assert.deepStrictEqual(r, { correct: false, overLimit: false, blank: true });
});

// ---------------- 判分：TFNG / YNNG ----------------
test('TFNG 接受完整词和 T/F/NG 缩写，不区分大小写', () => {
  const g = { type: 'tfng' };
  const ok = { TRUE: ['TRUE', 'true', ' True ', 'T', 't'], FALSE: ['FALSE', 'false', 'F', 'f'], 'NOT GIVEN': ['NOT GIVEN', 'not given', 'Not  Given', 'NG', 'ng'] };
  for (const [want, inputs] of Object.entries(ok)) {
    for (const r of inputs) assert.strictEqual(R.gradeQuestion(q([want]), g, r).correct, true, `${want} <- ${r}`);
  }
});

test('TFNG 拒绝 YES/NO、残缺词和其它缩写', () => {
  const g = { type: 'tfng' };
  for (const r of ['YES', 'Y', 'N', 'NO', 'tru', 'notgiven', 'not', 'NG.', 'T F', 'false']) {
    assert.strictEqual(R.gradeQuestion(q(['TRUE']), g, r).correct, false, r);
  }
  assert.strictEqual(R.gradeQuestion(q(['NOT GIVEN']), g, 'N').correct, false);
});

test('YNNG 接受 Y/N/NG 缩写，拒绝 TRUE/FALSE', () => {
  const g = { type: 'ynng' };
  assert.strictEqual(R.gradeQuestion(q(['YES']), g, 'y').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['NO']), g, 'N').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['NO']), g, 'no').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['NOT GIVEN']), g, 'ng').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['YES']), g, 'TRUE').correct, false);
  assert.strictEqual(R.gradeQuestion(q(['NO']), g, 'F').correct, false);
});

// ---------------- 判分：选项类 ----------------
test('单选 / 配对 / 词库摘要按 key 判分，不区分大小写；词库摘要也接受选项原词', () => {
  assert.strictEqual(R.gradeQuestion(q(['B']), { type: 'mcq' }, 'b').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['B']), { type: 'mcq' }, 'C').correct, false);
  assert.strictEqual(R.gradeQuestion(q(['iv']), { type: 'matching-headings' }, 'IV').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['iv']), { type: 'matching-headings' }, 'vi').correct, false);
  assert.strictEqual(R.gradeQuestion(q(['C']), { type: 'matching-information' }, ' c ').correct, true);
  const bank = { type: 'summary-completion', wordBank: [{ key: 'A', text: 'nonsense' }, { key: 'B', text: 'immediately' }] };
  assert.strictEqual(R.gradeQuestion(q(['A']), bank, 'a').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['A']), bank, 'Nonsense').correct, true);
  assert.strictEqual(R.gradeQuestion(q(['A']), bank, 'immediately').correct, false);
  assert.strictEqual(R.gradeQuestion(q(['A']), bank, 'B').correct, false);
});

// ---------------- 整篇判分 ----------------
test('整篇判分：真实文章全对得满分，全空得 0，未知字段被忽略', () => {
  for (const p of realPassages()) {
    const answers = {};
    for (const g of p.groups) for (const qq of g.questions) answers[qq.id] = qq.answer[0];
    const full = R.gradePassage(p, answers);
    assert.strictEqual(full.total, 13, p.id);
    assert.strictEqual(full.raw, 13, `${p.id} 用标准答案作答应全对`);
    for (const r of full.results) {
      assert.ok(r.explanation && r.evidence && r.evidence.quote, `${p.id} ${r.id} 结果缺少解析或证据`);
      assert.ok(Array.isArray(r.answer) && r.answer.length, `${p.id} ${r.id} 结果缺少 answer`);
    }
    const empty = R.gradePassage(p, { __proto__: null, toString: 'x' });
    assert.strictEqual(empty.raw, 0);
    assert.ok(empty.results.every((r) => r.blank));
  }
});

test('整篇判分：缩写与大小写在真实题目上生效', () => {
  const p = realById('rd-green-roofs');
  const r = R.gradePassage(p, { q1: 'f', q2: 'T', q4: 'ng', q6: 'b', q11: ' Maintenance ', q12: 'the waterproof membrane' });
  const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
  assert.strictEqual(by.q1.correct, true);
  assert.strictEqual(by.q2.correct, true);
  assert.strictEqual(by.q4.correct, true);
  assert.strictEqual(by.q6.correct, true);
  assert.strictEqual(by.q11.correct, true);
  assert.strictEqual(by.q12.correct, false);
  assert.strictEqual(by.q12.overLimit, true);
  assert.deepStrictEqual(by.q1.answer, ['FALSE']);
  assert.strictEqual(by.q6.answerText, 'plants release water and the soil provides insulation.');
  assert.strictEqual(r.raw, 5);
});

// ---------------- band 换算 ----------------
test('40 题换算表的边界', () => {
  const cases = [[40, 9], [39, 9], [38, 8.5], [37, 8.5], [36, 8], [35, 8], [34, 7.5], [33, 7.5], [32, 7], [30, 7], [29, 6.5], [27, 6.5], [26, 6], [23, 6], [22, 5.5], [19, 5.5], [18, 5], [15, 5], [14, 4.5], [13, 4.5], [12, 4], [10, 4], [9, 3.5], [8, 3.5], [7, 3], [6, 3], [5, 2.5], [4, 2.5], [3, 2], [1, 2], [0, 1]];
  for (const [score, band] of cases) assert.strictEqual(R.bandFrom40(score), band, `${score}/40`);
});

test('13 题按比例折算到 40 题（四舍五入）再查表', () => {
  const expected = { 0: [0, 1], 1: [3, 2], 2: [6, 3], 3: [9, 3.5], 4: [12, 4], 5: [15, 5], 6: [18, 5], 7: [22, 5.5], 8: [25, 6], 9: [28, 6.5], 10: [31, 7], 11: [34, 7.5], 12: [37, 8.5], 13: [40, 9] };
  for (const [raw, [scaled, band]] of Object.entries(expected)) {
    const r = R.estimateBand(Number(raw), 13);
    assert.strictEqual(r.scaled40, scaled, `raw=${raw} scaled40`);
    assert.strictEqual(r.band, band, `raw=${raw} band`);
  }
  assert.deepStrictEqual(R.estimateBand(30, 40), { raw: 30, total: 40, scaled40: 30, band: 7 });
});

test('band 换算拒绝非法参数', () => {
  assert.throws(() => R.estimateBand(14, 13), RangeError);
  assert.throws(() => R.estimateBand(-1, 13), RangeError);
  assert.throws(() => R.estimateBand(1.5, 13), RangeError);
  assert.throws(() => R.estimateBand(0, 0), RangeError);
});

// ---------------- 内容校验：真实数据 ----------------
test('真实阅读内容校验无错误、无警告', () => {
  const c = R.getContent();
  assert.deepStrictEqual(c.issues, []);
  const v = R.validateReadingContent(c.passages);
  assert.deepStrictEqual(v.errors, []);
  assert.deepStrictEqual(v.warnings, []);
});

test('真实内容规模：至少 6 篇、易中难各至少 2 篇，话题与题型覆盖齐全', () => {
  const ps = realPassages();
  // 内容会分批扩充，不写死篇数
  assert.ok(ps.length >= 6, `共 ${ps.length} 篇`);
  const byDiff = {};
  for (const p of ps) byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
  for (const d of ['easy', 'medium', 'hard']) assert.ok((byDiff[d] || 0) >= 2, `${d} 只有 ${byDiff[d] || 0} 篇`);
  assert.deepStrictEqual(new Set(ps.map((p) => p.topic)), new Set(Object.keys(R.TOPICS)));
  const types = new Set();
  for (const p of ps) {
    const s = R.passageSummary(p);
    assert.strictEqual(s.questionCount, 13, p.id);
    assert.ok(s.types.length >= 3, `${p.id} 题型少于 3 种`);
    assert.ok(s.wordCount >= 650 && s.wordCount <= 900, `${p.id} 词数 ${s.wordCount}`);
    assert.deepStrictEqual(p.paragraphs.map((x) => x.label), ['A', 'B', 'C', 'D', 'E', 'F', 'G'], p.id);
    s.types.forEach((t) => types.add(t));
  }
  assert.deepStrictEqual(types, new Set(R.QUESTION_TYPES));
});

// ---------------- 内容校验：坏数据 ----------------
function groupOf(p, type) {
  const g = p.groups.find((x) => x.type === type);
  assert.ok(g, `${p.id} 没有 ${type} 题组`);
  return g;
}

test('坏数据：非数组、非对象条目', () => {
  assertError(R.validateReadingContent(null), '必须是数组');
  assertError(R.validateReadingContent([1]), '条目必须是对象');
});

test('坏数据：id 重复与 id 非法', () => {
  const p = realById('rd-pencil');
  assertError(R.validateReadingContent([clone(p), clone(p)]), 'id 重复');
  const bad = clone(p);
  bad.id = 'Bad ID';
  assertError(R.validateReadingContent([bad]), 'id 必须是小写字母');
});

test('坏数据：枚举、段落标签与题号', () => {
  const p = clone(realById('rd-pencil'));
  p.difficulty = 'expert';
  p.topic = 'sport';
  p.paragraphs[2].label = 'X';
  p.groups[1].questions[0].number = 9;
  const v = R.validateReadingContent([p]);
  assertError(v, 'difficulty 必须是');
  assertError(v, 'topic 必须是');
  assertError(v, 'label 应为 C');
  assertError(v, 'number 应为 5');
});

test('坏数据：evidence.quote 不在原文、段落不存在、缺解析', () => {
  const p = clone(realById('rd-green-roofs'));
  p.groups[0].questions[0].evidence.quote = 'People in Scandinavia have covered their houses with turf for decades';
  p.groups[0].questions[1].evidence.para = 'H';
  p.groups[0].questions[2].explanation = '';
  const v = R.validateReadingContent([p]);
  assertError(v, 'evidence.quote 未在 A 段原文中逐字找到');
  assertError(v, 'evidence.para「H」不是本篇的段落');
  assertError(v, '缺少 explanation');
});

test('坏数据：TFNG / YNNG 答案必须是完整大写标准词', () => {
  const p = clone(realById('rd-green-roofs'));
  p.groups[0].questions[0].answer = ['F'];
  assertError(R.validateReadingContent([p]), 'answer 必须恰好是 TRUE / FALSE / NOT GIVEN');
  const p2 = clone(realById('rd-four-day-week'));
  p2.groups[0].questions[0].answer = ['FALSE'];
  assertError(R.validateReadingContent([p2]), 'answer 必须恰好是 YES / NO / NOT GIVEN');
});

test('坏数据：matching-headings 选项数量、答案、段落', () => {
  const p = clone(realById('rd-spacing-effect'));
  const g = groupOf(p, 'matching-headings');
  g.options = g.options.filter((o) => o.key !== 'v'); // 只剩 7 个标题配 6 段
  assertError(R.validateReadingContent([p]), '应比要配对的段落（6 个）多 2–3 个');

  const p2 = clone(realById('rd-spacing-effect'));
  const g2 = groupOf(p2, 'matching-headings');
  g2.options.push({ key: 'ix', text: 'x' }, { key: 'x', text: 'y' }); // 10 个标题配 6 段，多了 4 个
  assertError(R.validateReadingContent([p2]), '多 2–3 个');

  const p3 = clone(realById('rd-spacing-effect'));
  const g3 = groupOf(p3, 'matching-headings');
  g3.questions[0].answer = ['xi'];
  g3.questions[2].answer = ['vi']; // 与第 2 题重复使用同一标题
  g3.questions[3].para = 'C'; // 段落重复
  const v3 = R.validateReadingContent([p3]);
  assertError(v3, 'answer 必须是 1 个已有的标题选项 key');
  assertError(v3, '标题 vi 在本组中被多个段落使用');
  assertError(v3, '段落 C 在本组中重复');
  assertError(v3, 'evidence.para 应与配对段落 C 一致');
});

test('坏数据：matching-information 答案须是段落且与证据段一致', () => {
  const p = clone(realById('rd-pencil'));
  const g = groupOf(p, 'matching-information');
  g.questions[0].answer = ['H'];
  g.questions[1].answer = ['D']; // 证据在 C 段
  const v = R.validateReadingContent([p]);
  assertError(v, 'answer 必须是 1 个段落字母');
  assertError(v, 'evidence.para 应与答案段落 D 一致');
});

test('坏数据：单选题选项与答案', () => {
  const p = clone(realById('rd-green-roofs'));
  const g = groupOf(p, 'mcq');
  g.questions[0].answer = ['E'];
  g.questions[1].options = g.questions[1].options.slice(0, 2);
  const v = R.validateReadingContent([p]);
  assertError(v, 'answer 必须是 1 个已有的选项字母');
  assertError(v, '单选题选项应为 3–5 个');
});

test('坏数据：填空答案超字数、首选答案不在原文、instruction 与字数限制不一致、缺 {blank}', () => {
  const p = clone(realById('rd-green-roofs'));
  const g = groupOf(p, 'sentence-completion');
  g.questions[1].answer = ['occasional maintenance', 'paying for occasional maintenance'];
  g.questions[2].answer = ['protective membrane'];
  g.questions[3].prompt = 'Some city governments provide grants.';
  const v = R.validateReadingContent([p]);
  assertError(v, '可接受答案「paying for occasional maintenance」超出字数限制（NO MORE THAN TWO WORDS）');
  assertError(v, '首选答案「protective membrane」没有在 evidence.quote 中以完整词出现');
  assertError(v, 'prompt 必须恰好含 1 个 {blank}');

  const p2 = clone(realById('rd-green-roofs'));
  groupOf(p2, 'sentence-completion').wordLimit = { words: 3 };
  assertError(R.validateReadingContent([p2]), 'instruction 与 wordLimit 不一致，应包含「NO MORE THAN THREE WORDS」');

  const p3 = clone(realById('rd-pencil'));
  delete groupOf(p3, 'short-answer').wordLimit;
  assertError(R.validateReadingContent([p3]), '填空类必须有 wordLimit');
});

test('坏数据：摘要占位符与词库', () => {
  const p = clone(realById('rd-spacing-effect'));
  const g = groupOf(p, 'summary-completion');
  g.summary.text = g.summary.text.replace('{q8}', '___').replace('{q9}', '{q9} {q99}');
  g.questions[3].answer = ['Z'];
  g.wordBank = g.wordBank.slice(0, 5);
  const v = R.validateReadingContent([p]);
  assertError(v, '{q8} 应恰好出现 1 次（实际 0 次）');
  assertError(v, '含未知占位符 {q99}');
  assertError(v, '词库型摘要的 answer 必须是 1 个 wordBank 字母');
  assertError(v, 'wordBank 只有 5 项');

  const p2 = clone(realById('rd-machine-translation'));
  groupOf(p2, 'summary-completion').questions[0].answer = ['text that has been translated'];
  assertError(R.validateReadingContent([p2]), '超出字数限制');
});

test('坏数据：未知题型、题数与题型数不足给出警告', () => {
  const p = clone(realById('rd-pencil'));
  p.groups[0].type = 'drag-and-drop';
  assertError(R.validateReadingContent([p]), 'type 必须是');

  const p2 = clone(realById('rd-pencil'));
  p2.groups = [p2.groups[1]];
  p2.groups[0].questions.forEach((qq, i) => { qq.number = i + 1; });
  const v2 = R.validateReadingContent([p2]);
  assert.deepStrictEqual(v2.errors, []);
  assert.ok(v2.warnings.some((w) => w.includes('共 5 题')), v2.warnings.join('\n'));
  assert.ok(v2.warnings.some((w) => w.includes('只有 1 种题型')), v2.warnings.join('\n'));
});

// ---------------- 作答记录 ----------------
const goodRecord = (over) => ({ id: 'r1', passageId: 'rd-pencil', mode: 'exam', raw: 9, total: 13, band: 6.5, durationSec: 1100, wrong: ['q1'], ts: 1700000000000, ...over });

test('作答记录清洗：过滤坏数据，最多保留 300 条', () => {
  const bad = [
    null,
    'x',
    goodRecord({ mode: 'quiz' }),
    goodRecord({ raw: 14 }),
    goodRecord({ band: 6.3 }),
    goodRecord({ passageId: '../etc' }),
    goodRecord({ ts: 'yesterday' }),
    goodRecord({ durationSec: -5 }),
    goodRecord({ wrong: 'q1' }),
  ];
  assert.deepStrictEqual(R.sanitizeReadings([...bad, goodRecord()]), [goodRecord()]);
  assert.deepStrictEqual(R.sanitizeReadings(undefined), []);
  const many = Array.from({ length: 350 }, (_, i) => goodRecord({ id: `r${i}`, ts: 1700000000000 + i }));
  const kept = R.sanitizeReadings(many);
  assert.strictEqual(kept.length, R.MAX_READINGS);
  assert.strictEqual(kept[0].id, 'r50');
  assert.strictEqual(kept[kept.length - 1].id, 'r349');
});

test('每篇统计：作答次数与最好成绩', () => {
  const recs = [
    goodRecord({ id: 'a', raw: 8, band: 6, ts: 1 }),
    goodRecord({ id: 'b', raw: 11, band: 7.5, mode: 'practice', ts: 2 }),
    goodRecord({ id: 'c', raw: 10, band: 7, ts: 3 }),
    goodRecord({ id: 'd', passageId: 'rd-green-roofs', raw: 5, band: 5, ts: 4 }),
  ];
  const s = R.readingStats(recs);
  assert.strictEqual(s.get('rd-pencil').attempts, 3);
  assert.deepStrictEqual(s.get('rd-pencil').best, { raw: 11, total: 13, band: 7.5, mode: 'practice', ts: 2 });
  assert.strictEqual(s.get('rd-pencil').lastTs, 3);
  assert.strictEqual(s.get('rd-green-roofs').attempts, 1);
});

// ---------------- 对外视图 ----------------
test('对外视图不含 answer / explanation / evidence', () => {
  const leaks = [];
  const walk = (v, at) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (['answer', 'answers', 'explanation', 'evidence'].includes(k)) leaks.push(`${at}.${k}`);
        walk(x, `${at}.${k}`);
      }
    }
  };
  for (const p of realPassages()) {
    const pub = R.publicPassage(p);
    walk(pub, p.id);
    assert.strictEqual(pub.paragraphs.length, 7);
    assert.strictEqual(pub.questionCount, 13);
  }
  assert.deepStrictEqual(leaks, []);
  const sentence = groupOf(R.publicPassage(realById('rd-green-roofs')), 'sentence-completion');
  assert.strictEqual(sentence.wordLimitLabel, 'NO MORE THAN TWO WORDS');
});

console.log(`\n雅思阅读测试：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
