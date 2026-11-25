'use strict';
// 雅思基础知识库测试：内容校验（样例与真实内容必须通过，构造的坏数据必须报错）、
// 小测判分归一化（并与前端 public/js/ielts-knowledge-ui.js 里复制的同一套规则逐例比对）、
// 学习进度清洗与请求体校验、3 个接口（注入内存版 loadUser / saveUser / activity，起临时 HTTP 服务）。
// 用法：node scripts/test-ielts-knowledge.js（不读写任何档案学习数据；有失败时退出码 1）

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');

const ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'ielts-knowledge');
const UI_FILE = path.join(ROOT, 'public', 'js', 'ielts-knowledge-ui.js');

const K = require('../lib/ielts-knowledge');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const clone = (v) => JSON.parse(JSON.stringify(v));

// 用指定目录加载内容（IELTS_KNOWLEDGE_DIR 覆盖）；dir 为 null 时用默认目录
function loadContent(dir) {
  if (dir) process.env.IELTS_KNOWLEDGE_DIR = dir;
  else delete process.env.IELTS_KNOWLEDGE_DIR;
  K.reload();
  return K.getContent();
}

const fixture = loadContent(FIXTURE_DIR);
const byId = (id) => {
  const a = fixture.items.find((x) => x.id === id);
  assert.ok(a, `样例里缺少 ${id}`);
  return a;
};
const GRAMMAR = 'gr-sample-past-simple';
const ADVANCED = 'gr-sample-relative-clauses';
const STRATEGY = 'st-sample-reading-tfng';

// 校验单篇（克隆后改坏），返回 { errors, warnings }
function validateOne(mutate, id) {
  const a = clone(byId(id || GRAMMAR));
  if (mutate) mutate(a);
  return K.validateKnowledgeContent([a]);
}
function assertError(result, fragment) {
  assert.ok(
    result.errors.some((e) => e.includes(fragment)),
    `期望错误包含「${fragment}」，实际：\n    ${result.errors.join('\n    ') || '（无错误）'}`
  );
}
function assertNoErrors(result, label) {
  assert.deepStrictEqual(result.errors, [], `${label || ''} 不应有错误`);
}

// ================= 内容加载与校验 =================
test('IELTS_KNOWLEDGE_DIR 覆盖目录：样例加载 3 篇、无分片问题', () => {
  assert.strictEqual(fixture.dir, FIXTURE_DIR);
  assert.strictEqual(fixture.items.length, 3);
  assert.deepStrictEqual(fixture.issues, []);
  assert.strictEqual(fixture.byId.size, 3);
});

test('样例内容校验：无错误、无警告', () => {
  const r = K.validateKnowledgeContent(fixture.items);
  assertNoErrors(r, '样例');
  assert.deepStrictEqual(r.warnings, []);
});

test('真实内容（data/ielts/knowledge/，有文件时）校验无错误', () => {
  const real = loadContent(null);
  try {
    assert.deepStrictEqual(real.issues, [], '分片读取问题');
    const r = K.validateKnowledgeContent(real.items);
    assertNoErrors(r, '真实内容');
    console.log(`  真实内容 ${real.items.length} 篇，警告 ${r.warnings.length} 条`);
  } finally {
    loadContent(FIXTURE_DIR);
  }
});

test('坏分片：JSON 解析失败、不是数组、条目不是对象都记入 issues', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ielts-knowledge-'));
  try {
    fs.writeFileSync(path.join(tmp, 'a-broken.json'), '{ not json');
    fs.writeFileSync(path.join(tmp, 'b-object.json'), '{"id":"gr-x"}');
    fs.writeFileSync(path.join(tmp, 'c-mixed.json'), JSON.stringify([1, byId(GRAMMAR)]));
    const c = loadContent(tmp);
    assert.strictEqual(c.items.length, 1);
    assert.ok(c.issues.some((m) => m.includes('a-broken.json') && m.includes('解析失败')), c.issues.join('\n'));
    assert.ok(c.issues.some((m) => m.includes('b-object.json') && m.includes('数组')), c.issues.join('\n'));
    assert.ok(c.issues.some((m) => m.includes('c-mixed.json[0]')), c.issues.join('\n'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    loadContent(FIXTURE_DIR);
  }
});

test('校验：非数组输入、条目不是对象', () => {
  assertError(K.validateKnowledgeContent(null), '必须是数组');
  assertError(K.validateKnowledgeContent(['x']), '条目必须是对象');
});

test('校验：id 格式、全局唯一、前缀与 domain 对应', () => {
  assertError(validateOne((a) => { a.id = 'Gr_Bad'; }), 'id 必须由小写字母');
  assertError(validateOne((a) => { a.id = 'gr--double'; }), 'id 必须由小写字母');
  assertError(validateOne((a) => { a.id = `gr-${'x'.repeat(70)}`; }), 'id 必须由小写字母');
  assertError(validateOne((a) => { a.id = 'st-past-simple'; }), '必须以 gr- 开头');
  assertError(validateOne((a) => { a.id = 'gr-tfng'; }, STRATEGY), '必须以 st- 开头');
  const dup = K.validateKnowledgeContent([clone(byId(GRAMMAR)), clone(byId(GRAMMAR))]);
  assertError(dup, 'id 重复');
});

test('校验：domain 与 track 组合', () => {
  assertError(validateOne((a) => { a.domain = 'vocab'; }), 'domain 必须是');
  assertError(validateOne((a) => { a.track = 'reading'; }), 'domain=grammar 的 track 必须是 core / advanced');
  assertError(validateOne((a) => { a.track = 'core'; }, STRATEGY), 'domain=strategy 的 track');
  // 合法组合：发音 / 构词各自的 track
  const pron = validateOne((a) => { a.id = 'pron-x'; a.domain = 'pronunciation'; a.track = 'connected'; });
  assertNoErrors(pron, 'pronunciation/connected');
  const wf = validateOne((a) => { a.id = 'wf-x'; a.domain = 'wordform'; a.track = 'collocation'; });
  assertNoErrors(wf, 'wordform/collocation');
  assertError(validateOne((a) => { a.id = 'pron-x'; a.domain = 'pronunciation'; a.track = 'affix'; }), 'track 必须是');
});

test('校验：schema 必填字段与取值范围', () => {
  assertError(validateOne((a) => { delete a.title; }), '缺少 title');
  assertError(validateOne((a) => { a.titleEn = ' '; }), '缺少 titleEn');
  assertError(validateOne((a) => { a.level = 'C2'; }), 'level 必须是');
  assertError(validateOne((a) => { a.skills = []; }), 'skills 必须是非空数组');
  assertError(validateOne((a) => { a.skills = ['grammar']; }), 'skills 必须是非空数组');
  assertError(validateOne((a) => { a.order = 1.5; }), 'order 必须是');
  assertError(validateOne((a) => { a.minutes = 3; }), 'minutes 必须是 5–40');
  assertError(validateOne((a) => { a.minutes = 41; }), 'minutes 必须是 5–40');
  assertError(validateOne((a) => { delete a.summary; }), '缺少 summary');
});

test('校验：sections 2–6 节，节内结构与表格列数', () => {
  assertError(validateOne((a) => { a.sections = a.sections.slice(0, 1); }), 'sections 必须是 2–6 节');
  assertError(validateOne((a) => { while (a.sections.length < 7) a.sections.push(clone(a.sections[0])); }), 'sections 必须是 2–6 节');
  assertError(validateOne((a) => { delete a.sections; }), 'sections 必须是 2–6 节');
  assertError(validateOne((a) => { a.sections[0].heading = ''; }), '缺少 heading');
  assertError(validateOne((a) => { a.sections[0].examples[0].cn = ''; }), '缺少 cn');
  assertError(validateOne((a) => { a.sections[1].table.rows[0].push('多一列'); }), '列数');
  assertError(validateOne((a) => { a.sections[1].table.head = []; }), 'head 必须是非空字符串数组');
  const html = validateOne((a) => { a.sections[0].body = '<b>加粗</b> 写法'; });
  assertNoErrors(html);
  assert.ok(html.warnings.some((w) => w.includes('HTML')), html.warnings.join('\n'));
});

test('校验：mcq 的 answer 必须在 options 里', () => {
  assertError(validateOne((a) => { a.exercises[0].answer = 'has'; a.exercises[0].options = ['had', 'have']; }), 'answer 必须与某个 option 完全一致');
  assertError(validateOne((a) => { a.exercises[0].answer = 'Had'; }), 'answer 必须与某个 option 完全一致');
  assertError(validateOne((a) => { a.exercises[0].options = ['had']; }), 'options 必须是 2–6 个');
  assertError(validateOne((a) => { a.exercises[0].options = ['had', 'Had ']; }), '重复的选项');
});

test('校验：fill / correct 的 answer 是非空数组，改错原句不能本身正确', () => {
  assertError(validateOne((a) => { a.exercises[1].answer = []; }), 'answer 必须是非空字符串数组');
  assertError(validateOne((a) => { a.exercises[1].answer = 'took'; }), 'answer 必须是非空字符串数组');
  assertError(validateOne((a) => { a.exercises[2].answer = ['ok', '']; }), 'answer 必须是非空字符串数组');
  assertError(validateOne((a) => { a.exercises[2].answer = ['did she called you last night']; }), '原句本身就是可接受答案');
  assertError(validateOne((a) => { a.exercises[1].type = 'essay'; }), 'type 必须是');
  assertError(validateOne((a) => { a.exercises[1].explain = ''; }), '缺少 explain');
  assertError(validateOne((a) => { a.exercises[1].id = a.exercises[0].id; }), '在本篇内重复');
});

test('校验：小测题数 3–8', () => {
  assertError(validateOne((a) => { a.exercises = a.exercises.slice(0, 2); }), 'exercises 必须是 3–8 题');
  assertError(validateOne((a) => {
    while (a.exercises.length < 9) a.exercises.push({ ...clone(a.exercises[1]), id: `${a.id}-extra${a.exercises.length}` });
  }), 'exercises 必须是 3–8 题');
  assertNoErrors(validateOne((a) => { a.exercises = a.exercises.slice(0, 3); }), '3 题');
});

test('校验：grammarTags 必须是题库已有标签，tabs 必须在白名单里', () => {
  assertError(validateOne((a) => { a.related.grammarTags = ['一般过去时', '不存在的标签']; }), '题库里没有这些语法标签：不存在的标签');
  // 注入标签集合：不依赖题库也能校验
  const injected = K.validateKnowledgeContent([clone(byId(GRAMMAR))], { grammarTags: new Set(['别的标签']), lessonKeys: new Set(['2-1']) });
  assertError(injected, '题库里没有这些语法标签：一般过去时');
  assertError(validateOne((a) => { a.related.tabs = ['ielts:knowledge']; }), '不支持的跳转目标 ielts:knowledge');
  assertError(validateOne((a) => { a.related.tabs = ['home']; }), '不支持的跳转目标 home');
  assertError(validateOne((a) => { a.related.nceLessons = [{ book: 5, lesson: 1 }]; }), 'book: 1–4');
  const missing = validateOne((a) => { a.related.nceLessons = [{ book: 4, lesson: 199 }]; });
  assertNoErrors(missing);
  assert.ok(missing.warnings.some((w) => w.includes('尚未收录')), missing.warnings.join('\n'));
  assertNoErrors(validateOne((a) => { delete a.related; }), '没有 related');
});

test('校验：任何字符串字段都不能有弯引号', () => {
  assertError(validateOne((a) => { a.sections[0].examples[0].en = 'I didn’t go.'; }), '含弯引号');
  assertError(validateOne((a) => { a.pitfalls[0].why = '注意“过去式”'; }), 'pitfalls[0].why');
  assertError(validateOne((a) => { a.exercises[1].answer = ['‘took’']; }), 'exercises[1].answer[0]');
});

test('校验：pitfalls 不足 3 条只给 warning，技巧类可为空；不是数组或条目残缺才报错', () => {
  const few = validateOne((a) => { a.pitfalls = a.pitfalls.slice(0, 1); });
  assertNoErrors(few, '语法 1 条易错点');
  assert.ok(few.warnings.some((w) => w.includes('pitfalls 只有 1 条')), few.warnings.join('\n'));
  const empty = validateOne((a) => { a.pitfalls = []; }, ADVANCED);
  assertNoErrors(empty);
  assert.strictEqual(empty.warnings.length, 1);
  const strategy = validateOne(null, STRATEGY);
  assertNoErrors(strategy);
  assert.deepStrictEqual(strategy.warnings, [], '技巧类空 pitfalls 不应有警告');
  assertError(validateOne((a) => { delete a.pitfalls; }), 'pitfalls 必须是数组');
  assertError(validateOne((a) => { a.pitfalls[0].right = ''; }), '缺少 right');
  assertError(validateOne((a) => { a.pitfalls[0].right = a.pitfalls[0].wrong; }), 'wrong 与 right 相同');
});

// ================= 判分归一化 =================
const fill = { id: 'x-q1', type: 'fill', answer: ["didn't visit", 'did not visit'] };
const correct = { id: 'x-q2', type: 'correct', answer: ['Did she call you last night?'] };
const mcq = { id: 'x-q3', type: 'mcq', options: ['have', 'had', 'has had'], answer: 'had' };
// 内容里只用直引号；可接受写法同时列出单、双引号两种
const quoted = { id: 'x-q4', type: 'correct', answer: ['She said "not yet", and I didn\'t argue.', "She said 'not yet', and I didn't argue."] };

// [题目, 作答, 期望 correct, 期望 blank]
const GRADE_CASES = [
  [fill, "didn't visit", true, false],
  [fill, "  Didn't   VISIT ", true, false],
  [fill, 'didn’t visit', true, false],
  [fill, 'did not visit.', true, false],
  [fill, 'didnt visit', false, false],
  [fill, 'not visit', false, false],
  [fill, '', false, true],
  [fill, '   ', false, true],
  [fill, '...', false, true],
  [correct, 'Did she call you last night?', true, false],
  [correct, 'did she call you last night', true, false],
  [correct, 'Did she call you last night!!', true, false],
  [correct, 'Did she call you last night。', true, false],
  [correct, 'Did  she\tcall you\nlast night ?', true, false],
  [correct, 'Did she call you, last night?', false, false],
  [correct, 'Did she called you last night?', false, false],
  // iPhone 等输入法把 ' 打成弯撇号 ’（U+2019）、把引号打成 ‘ ’ “ ”：先转成直引号再比较
  [fill, 'didn‘t visit', true, false],
  [fill, 'DIDN’T  visit!', true, false],
  [quoted, 'She said “Not yet”, and I didn’t argue.', true, false],
  [quoted, 'She said ‘Not yet’, and I didn‘t argue', true, false],
  [quoted, "she said 'not yet', and i didn't argue", true, false],
  [quoted, 'She said "Not yet", and I didn’t argue.', true, false],
  [quoted, 'She said Not yet, and I didn’t argue.', false, false],
  [mcq, 'had', true, false],
  [mcq, 'have', false, false],
  [mcq, 'has had', false, false],
  [mcq, '', false, true],
  [{ id: 'bad', type: 'fill', answer: 'not-an-array' }, 'not-an-array', false, false],
  [null, 'x', false, false],
];

test('判分：不区分大小写、合并空格、忽略句末标点、弯引号等同直引号', () => {
  for (const [ex, resp, ok, blank] of GRADE_CASES) {
    assert.deepStrictEqual(K.gradeExercise(ex, resp), { correct: ok, blank }, `${ex && ex.id} ← ${JSON.stringify(resp)}`);
  }
  assert.strictEqual(K.normalizeAnswer('  It’s  OK!? '), "it's ok");
  assert.strictEqual(K.normalizeAnswer('‘a’ “B” ʼc'), `'a' "b" 'c`);
  assert.strictEqual(K.normalizeAnswer(null), '');
  assert.strictEqual(K.normalizeAnswer('Mr. Smith'), 'mr. smith'); // 只去句末，句中标点保留
});

test('判分：前端复制的规则与后端逐例一致', () => {
  const src = fs.readFileSync(UI_FILE, 'utf8');
  const m = src.match(/\/\/ <knowledge-grade>[\s\S]*?\n([\s\S]*?)\/\/ <\/knowledge-grade>/);
  assert.ok(m, '前端缺少 // <knowledge-grade> … // </knowledge-grade> 判分代码段');
  const ui = vm.runInNewContext(`${m[1]}\n;({ normalizeAnswer, gradeExercise })`, {});
  for (const [ex, resp] of GRADE_CASES) {
    assert.deepStrictEqual(
      { ...ui.gradeExercise(ex, resp) },
      K.gradeExercise(ex, resp),
      `前后端判分不一致：${ex && ex.id} ← ${JSON.stringify(resp)}`
    );
  }
  for (const s of ['  It’s  OK!? ', 'A  b\nC…', 'Hello。', null, '“Quoted.”', 'x y?! ']) {
    assert.strictEqual(ui.normalizeAnswer(s), K.normalizeAnswer(s), `normalizeAnswer(${JSON.stringify(s)})`);
  }
});

test('朗读文本：多行例句逐行去掉 Q:/A:/Before:/After: 等标签，正文原样保留', () => {
  const src = fs.readFileSync(UI_FILE, 'utf8');
  const m = src.match(/\/\/ <knowledge-speech>[\s\S]*?\n([\s\S]*?)\/\/ <\/knowledge-speech>/);
  assert.ok(m, '前端缺少 // <knowledge-speech> … // </knowledge-speech> 代码段');
  const { speechText } = vm.runInNewContext(`${m[1]}\n;({ speechText })`, {});
  const cases = [
    ['Q: Did you go anywhere?\nA: Yes, I went to Bath.', 'Did you go anywhere?\nYes, I went to Bath.'],
    ['Before: They live here. They save time.\nAfter: People who live here save time.', 'They live here. They save time.\nPeople who live here save time.'],
    ['  examiner :  Tell me about it.\nCandidate:Well, I think so.', 'Tell me about it.\nWell, I think so.'],
    ['Notes: plan, examples, result', 'plan, examples, result'],
    ['Student: Hi.\nTeacher: Hello.', 'Hi.\nHello.'],
    ['I visited my grandparents last weekend.', 'I visited my grandparents last weekend.'],
    ['Answer: not a label', 'Answer: not a label'], // 只认白名单里的标签
    ['The ratio was 3:1 in 2020.', 'The ratio was 3:1 in 2020.'],
    ['A: Q: nested', 'Q: nested'], // 每行只去掉行首第一个标签
    ['', ''],
    [null, ''],
  ];
  for (const [input, want] of cases) assert.strictEqual(speechText(input), want, JSON.stringify(input));
  // 样例里的多行例句按 \n 原样下发给前端（显示时 white-space: pre-line 分行）
  const ex = K.publicArticle(byId(GRAMMAR)).sections[2].examples[2];
  assert.ok(ex.en.includes('\n') && ex.en.startsWith('Q: '), JSON.stringify(ex));
});

// ================= 学习进度：清洗、请求体校验、更新 =================
const article4 = { exercises: [{}, {}, {}, {}] };

test('进度清洗：过滤非法 id、坏字段、不一致的成绩', () => {
  const raw = {
    'gr-ok': { readAt: 1700000000000, best: 3, total: 4, attempts: 2 },
    'gr-read-only': { readAt: 1700000000000 },
    'gr-quiz-only': { best: 0, total: 3, attempts: 1 },
    'gr-bad-score': { readAt: 1700000000000, best: 5, total: 4, attempts: 1 },
    'gr-no-attempts': { best: 2, total: 4, attempts: 0 },
    'gr-junk': { readAt: 'yesterday', best: '3', total: 4, attempts: 1 },
    'gr-neg': { readAt: -5 },
    'Bad_ID': { readAt: 1700000000000 },
    'gr-array': [1, 2],
    'gr-null': null,
  };
  const out = K.sanitizeKnowledgeProgress(raw);
  assert.deepStrictEqual(Object.keys(out).sort(), ['gr-bad-score', 'gr-ok', 'gr-quiz-only', 'gr-read-only']);
  assert.deepStrictEqual(out['gr-ok'], { readAt: 1700000000000, best: 3, total: 4, attempts: 2 });
  assert.deepStrictEqual(out['gr-read-only'], { readAt: 1700000000000, best: null, total: null, attempts: 0 });
  assert.deepStrictEqual(out['gr-bad-score'], { readAt: 1700000000000, best: null, total: null, attempts: 0 });
  // JSON 里的 "__proto__" 是自有键，不能被当成文章 id，也不能污染原型
  const proto = K.sanitizeKnowledgeProgress(JSON.parse('{"__proto__":{"readAt":1},"gr-a":{"readAt":1}}'));
  assert.deepStrictEqual(Object.keys(proto), ['gr-a']);
  assert.strictEqual(Object.getPrototypeOf(proto), Object.prototype);
  assert.deepStrictEqual(K.sanitizeKnowledgeProgress('oops'), {});
  assert.deepStrictEqual(K.sanitizeKnowledgeProgress([{ readAt: 1 }]), {});
});

test('请求体校验：只接受 { read: true } 或 { score, total }', () => {
  const ok = (body) => K.parseProgressBody(body, article4);
  assert.deepStrictEqual(ok({ read: true }), { kind: 'read' });
  assert.deepStrictEqual(ok({ score: 3, total: 4 }), { kind: 'quiz', score: 3, total: 4 });
  assert.deepStrictEqual(ok({ score: 0, total: 4 }), { kind: 'quiz', score: 0, total: 4 });
  const bad = [
    null, [], 'read', 42, {},
    { read: false }, { read: 'true' }, { read: 1 },
    { read: true, score: 1, total: 4 },
    { score: 3 }, { total: 4 },
    { score: '3', total: 4 }, { score: 3, total: '4' },
    { score: 1.5, total: 4 }, { score: -1, total: 4 }, { score: 5, total: 4 },
    { score: 3, total: 5 }, { score: 0, total: 0 },
    { score: 3, total: 4, extra: 1 }, { readAt: 1 },
  ];
  for (const b of bad) {
    const r = ok(b);
    assert.ok(r.error && typeof r.error === 'string', `应拒绝 ${JSON.stringify(b)}，实际 ${JSON.stringify(r)}`);
  }
  assert.ok(K.parseProgressBody({ score: 0, total: 1 }, { exercises: [] }).error.includes('没有小测'));
});

test('进度更新：已读只记第一次；小测次数累加，最好成绩按正确率取高', () => {
  let p = K.applyProgress(undefined, { kind: 'read' }, 100);
  assert.deepStrictEqual(p, { readAt: 100, best: null, total: null, attempts: 0 });
  p = K.applyProgress(p, { kind: 'read' }, 200);
  assert.strictEqual(p.readAt, 100);
  p = K.applyProgress(p, { kind: 'quiz', score: 2, total: 4 }, 300);
  assert.deepStrictEqual(p, { readAt: 100, best: 2, total: 4, attempts: 1 });
  p = K.applyProgress(p, { kind: 'quiz', score: 1, total: 4 }, 400);
  assert.deepStrictEqual(p, { readAt: 100, best: 2, total: 4, attempts: 2 });
  p = K.applyProgress(p, { kind: 'quiz', score: 4, total: 4 }, 500);
  assert.deepStrictEqual(p, { readAt: 100, best: 4, total: 4, attempts: 3 });
  // 内容改版后题数变化：按正确率比较
  p = K.applyProgress(p, { kind: 'quiz', score: 4, total: 5 }, 600);
  assert.deepStrictEqual(p, { readAt: 100, best: 4, total: 4, attempts: 4 });
});

// ================= 接口（注入内存存储，起临时服务）=================
function makeHarness() {
  const h = {
    user: {
      profile: { active: true },
      writings: [],
      readings: [{ keep: 'me' }],
      knowledge: {
        [GRAMMAR]: { readAt: 'bad', best: 9, total: 4, attempts: 1 },
        'gr-gone': { readAt: 1600000000000 },
        'NOT VALID': { readAt: 1 },
      },
    },
    saves: [],
    activity: [],
    activityFails: false,
    logs: [],
    clock: 1800000000000,
  };
  const router = require('../routes/ielts-knowledge').createRouter({
    loadUser: () => clone(h.user),
    saveUser: (u) => {
      h.user = clone(u);
      h.saves.push(clone(u));
      return u;
    },
    recordActivity: (correct, source) => {
      if (h.activityFails) throw new Error('disk full');
      h.activity.push({ correct, source });
    },
    getContent: () => fixture,
    now: () => h.clock,
    logger: { error: (m) => h.logs.push(['error', m]), warn: (m) => h.logs.push(['warn', m]) },
  });
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return { h, app };
}

async function withServer(fn) {
  const { h, app } = makeHarness();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(base + url, opts);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* 非 JSON 交给断言 */ }
    return { status: res.status, body: json, text };
  };
  try {
    await fn({ h, get: (u) => call('GET', u), post: (u, b) => call('POST', u, b) });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const is400 = (r, label) => {
  assert.strictEqual(r.status, 400, `${label} 期望 400，实际 ${r.status} ${r.text.slice(0, 200)}`);
  assert.ok(r.body && typeof r.body.error === 'string' && r.body.error, `${label} 应返回 { error }`);
};

test('GET /ielts/knowledge：按 domain/track/order 排序，不含正文与小测，坏进度被过滤', () => withServer(async ({ get }) => {
  const r = await get('/ielts/knowledge');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.total, 3);
  assert.deepStrictEqual(r.body.items.map((x) => x.id), [GRAMMAR, ADVANCED, STRATEGY]);
  for (const it of r.body.items) {
    assert.ok(!('sections' in it) && !('exercises' in it), `${it.id} 不应带 sections / exercises`);
    assert.deepStrictEqual(Object.keys(it.progress).sort(), ['attempts', 'best', 'readAt', 'total']);
  }
  // 存储里该篇的进度全是坏字段 → 视为没有进度
  assert.deepStrictEqual(r.body.items[0].progress, { readAt: null, best: null, total: null, attempts: 0 });
  assert.strictEqual(r.body.items[0].exerciseCount, 4);
  assert.strictEqual(r.body.domains.grammar, '语法');
  assert.strictEqual(r.body.passRatio, 0.6);
}));

test('GET /ielts/knowledge/:id：完整文章；非法 id 400，未知 id 404', () => withServer(async ({ get }) => {
  const r = await get(`/ielts/knowledge/${GRAMMAR}`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.sections.length, 3);
  assert.strictEqual(r.body.exercises.length, 4);
  assert.deepStrictEqual(r.body.exercises[1].answer, ['took']);
  assert.deepStrictEqual(r.body.related.grammarTags, ['一般过去时']);
  assert.ok(r.body.progress);
  is400(await get('/ielts/knowledge/Bad_ID'), '大写下划线');
  is400(await get(`/ielts/knowledge/gr-${'x'.repeat(70)}`), '超长 id');
  is400(await get('/ielts/knowledge/gr-%3Cscript%3E'), '含尖括号');
  const nf = await get('/ielts/knowledge/gr-not-exist');
  assert.strictEqual(nf.status, 404);
  assert.ok(nf.body && nf.body.error.includes('gr-not-exist'));
}));

test('POST progress：标记已读、提交小测、记学习活动，保留其他字段', () => withServer(async ({ h, get, post }) => {
  const r1 = await post(`/ielts/knowledge/${GRAMMAR}/progress`, { read: true });
  assert.strictEqual(r1.status, 200, r1.text);
  assert.deepStrictEqual(r1.body.progress, { readAt: h.clock, best: null, total: null, attempts: 0 });
  assert.strictEqual(h.activity.length, 0, '标记已读不记学习活动');
  // 写回时坏条目被清掉，未知文章的合法进度保留，其他顶层字段原样保留
  assert.deepStrictEqual(Object.keys(h.user.knowledge).sort(), ['gr-gone', GRAMMAR].sort());
  assert.deepStrictEqual(h.user.readings, [{ keep: 'me' }]);
  assert.deepStrictEqual(h.user.profile, { active: true });

  const first = h.clock;
  h.clock += 1000;
  const again = await post(`/ielts/knowledge/${GRAMMAR}/progress`, { read: true });
  assert.strictEqual(again.body.progress.readAt, first, '重复标记已读保留第一次的时间');

  const q1 = await post(`/ielts/knowledge/${GRAMMAR}/progress`, { score: 3, total: 4 });
  assert.strictEqual(q1.status, 200, q1.text);
  assert.deepStrictEqual(q1.body.progress, { readAt: first, best: 3, total: 4, attempts: 1 });
  assert.deepStrictEqual(h.activity, [{ correct: true, source: 'ielts-knowledge' }]);

  const q2 = await post(`/ielts/knowledge/${GRAMMAR}/progress`, { score: 1, total: 4 });
  assert.deepStrictEqual(q2.body.progress, { readAt: first, best: 3, total: 4, attempts: 2 });
  assert.deepStrictEqual(h.activity[1], { correct: false, source: 'ielts-knowledge' });

  const list = await get('/ielts/knowledge');
  assert.deepStrictEqual(list.body.items[0].progress, { readAt: first, best: 3, total: 4, attempts: 2 });
  const detail = await get(`/ielts/knowledge/${GRAMMAR}`);
  assert.strictEqual(detail.body.progress.attempts, 2);
}));

test('POST progress：非法输入一律 400，未知 id 404，失败不落盘', () => withServer(async ({ h, post }) => {
  const url = `/ielts/knowledge/${STRATEGY}/progress`; // 3 题
  const bad = [
    [{}, '空对象'],
    [[], '数组'],
    [{ read: false }, 'read=false'],
    [{ read: 'yes' }, 'read 字符串'],
    [{ read: true, score: 3, total: 3 }, 'read 与成绩同时提交'],
    [{ score: 2 }, '缺 total'],
    [{ score: '2', total: 3 }, 'score 字符串'],
    [{ score: 2.5, total: 3 }, 'score 小数'],
    [{ score: 4, total: 3 }, 'score 超过 total'],
    [{ score: -1, total: 3 }, 'score 负数'],
    [{ score: 2, total: 4 }, 'total 与题数不符'],
    [{ score: 2, total: 3, note: 'x' }, '未知字段'],
    ['"read"', 'JSON 字符串'],
  ];
  for (const [body, label] of bad) is400(await post(url, body), label);
  is400(await post('/ielts/knowledge/BAD/progress', { read: true }), '非法 id');
  const nf = await post('/ielts/knowledge/st-nope/progress', { read: true });
  assert.strictEqual(nf.status, 404);
  assert.strictEqual(h.saves.length, 0, '校验失败不应写文件');
  assert.strictEqual(h.activity.length, 0);
}));

test('POST progress：学习活动写失败只打日志，成绩照常保存', () => withServer(async ({ h, post }) => {
  h.activityFails = true;
  const r = await post(`/ielts/knowledge/${STRATEGY}/progress`, { score: 3, total: 3 });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(r.body.progress, { readAt: null, best: 3, total: 3, attempts: 1 });
  assert.strictEqual(h.saves.length, 1);
  assert.ok(h.logs.some(([lv, m]) => lv === 'error' && m.includes('学习活动记录失败') && m.includes('disk full')), JSON.stringify(h.logs));
}));

// ================= 运行 =================
(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok   ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${t.name}\n  ${String(e.message).split('\n').join('\n  ')}`);
    }
  }
  console.log(`\n${tests.length - failed} 通过，${failed} 失败`);
  if (failed) process.exitCode = 1;
})();
