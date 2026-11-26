'use strict';
// 雅思阅读 / 听力错题接入间隔复习的测试：key 解析、resolve、出题不泄露答案、判分与原模块逐题一致、
// 作答校验、错题入队与去重、原题删除后的清理（以及内容暂时不可用时不清理）、/api/srs 接口全流程，
// 以及听力多选 / 地图标注 / 流程图填空的复习题（夹具 scripts/fixtures/ielts-listening/new-types.json）。
// 用法：node scripts/test-ielts-srs.js
// 隔离：profile.file 被改指向临时目录，雅思内容夹具也写在临时目录，不读写任何真实档案学习数据。

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const profile = require('../lib/profile');
const R = require('../lib/ielts-reading');
const L = require('../lib/ielts-listening');
const S = require('../lib/ielts-srs');

// ---- 隔离：当前档案的数据文件全部落到临时目录 ----
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-srs-profile-'));
const realProfileFile = profile.file;
profile.file = (name) => path.join(PROFILE_DIR, name);
const SRS_FILE = path.join(PROFILE_DIR, 'srs.json');
const ACTIVITY_FILE = path.join(PROFILE_DIR, 'activity.json');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const clone = (v) => JSON.parse(JSON.stringify(v));
const readSrs = () => JSON.parse(fs.readFileSync(SRS_FILE, 'utf8'));
const writeSrs = (obj) => fs.writeFileSync(SRS_FILE, JSON.stringify(obj));
const resetProfile = () => {
  for (const f of fs.readdirSync(PROFILE_DIR)) fs.rmSync(path.join(PROFILE_DIR, f), { recursive: true, force: true });
};

function eachReading(fn) {
  for (const p of R.getPassages()) for (const g of p.groups) for (const q of g.questions) fn(p, g, q);
}
function eachListening(fn) {
  for (const s of L.getSections()) for (const g of s.groups) for (const q of g.questions) fn(s, g, q);
}
function readingQ(pid, qid) {
  const p = R.getPassage(pid);
  assert.ok(p, `真实数据里缺少 ${pid}`);
  for (const g of p.groups) for (const q of g.questions) if (q.id === qid) return { p, g, q };
  throw new Error(`${pid} 没有 ${qid}`);
}
function listeningQ(sid, no) {
  const s = L.getSection(sid);
  assert.ok(s, `真实数据里缺少 ${sid}`);
  for (const g of s.groups) for (const q of g.questions) if (q.no === no) return { s, g, q };
  throw new Error(`${sid} 没有题号 ${no}`);
}
const gradeKey = (key, response) => {
  const r = S.resolve(key);
  assert.ok(r, `${key} 应能解析`);
  return S.gradeIelts(r, response);
};
// 递归查找对象里是否出现某些属性名
function findKeys(obj, names, at = '$') {
  const hits = [];
  if (Array.isArray(obj)) obj.forEach((v, i) => hits.push(...findKeys(v, names, `${at}[${i}]`)));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (names.includes(k)) hits.push(`${at}.${k}`);
      hits.push(...findKeys(v, names, `${at}.${k}`));
    }
  }
  return hits;
}

// 临时内容目录：IELTS_DATA_DIR 指过去并重载阅读 / 听力内容；fn 结束后恢复
async function withContent(setup, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-srs-content-'));
  const prev = process.env.IELTS_DATA_DIR;
  const origError = console.error;
  const ctl = {
    dir,
    write(kind, file, value) {
      fs.mkdirSync(path.join(dir, kind), { recursive: true });
      fs.writeFileSync(path.join(dir, kind, file), typeof value === 'string' ? value : JSON.stringify(value));
      R.reload();
      L.reload();
    },
  };
  try {
    process.env.IELTS_DATA_DIR = dir;
    console.error = () => {}; // 听力内容有 section 被跳过时会打一条预期内的日志
    await setup(ctl);
    await fn(ctl);
  } finally {
    console.error = origError;
    if (prev === undefined) delete process.env.IELTS_DATA_DIR;
    else process.env.IELTS_DATA_DIR = prev;
    R.reload();
    L.reload();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------- key ----------------
test('key：生成与解析互逆，阅读用题目 id、听力用题号', () => {
  assert.strictEqual(S.readingKey('rd-green-roofs', 'q3'), 'ir:rd-green-roofs:q3');
  assert.strictEqual(S.listeningKey('l1-sports-centre', 4), 'il:l1-sports-centre:4');
  assert.deepStrictEqual(S.parseKey('ir:rd-green-roofs:q3'), { source: 'reading', contentId: 'rd-green-roofs', qid: 'q3' });
  assert.deepStrictEqual(S.parseKey('il:l1-sports-centre:4'), { source: 'listening', contentId: 'l1-sports-centre', no: 4 });
  assert.ok(S.isIeltsKey('ir:x') && S.isIeltsKey('il:x'));
  assert.ok(!S.isIeltsKey('w:hello') && !S.isIeltsKey('dlg:a#1') && !S.isIeltsKey(null) && !S.isIeltsKey(42));
});

test('key：格式非法一律解析为 null，resolve 也为 null，不抛错', () => {
  const bad = [
    null, undefined, 42, {}, [], '', 'ir:', 'ir:rd-green-roofs', 'ir:rd-green-roofs:3', 'ir:rd-green-roofs:q3:x',
    'ir:RD-GREEN:q3', 'ir:rd green:q3', 'ir:-rd:q3', 'ir:rd-green-roofs:q1234', 'il:l1-sports-centre:0',
    'il:l1-sports-centre:01', 'il:l1-sports-centre:q4', 'il:l1-sports-centre:1.5', 'il:a:1', 'IR:rd-green-roofs:q3',
    'ir:__proto__:q1', `ir:${'a'.repeat(120)}:q1`, 'w:hello', 'xx:rd-green-roofs:q3',
  ];
  for (const k of bad) {
    assert.strictEqual(S.parseKey(k), null, `parseKey(${JSON.stringify(k)})`);
    assert.strictEqual(S.resolve(k), null, `resolve(${JSON.stringify(k)})`);
  }
  // 格式合法但内容里没有：按 Map 查找，原型属性名也查不到
  for (const k of ['il:constructor:1', 'ir:hasownproperty:q1', 'il:to-string:1']) {
    assert.ok(S.parseKey(k), k);
    assert.strictEqual(S.resolve(k), null, k);
  }
});

test('resolve：真实内容的每一道阅读题、听力题都能解析回原题；不存在的题返回 null', () => {
  let n = 0;
  eachReading((p, g, q) => {
    const r = S.resolve(S.readingKey(p.id, q.id));
    assert.ok(r && r.question === q && r.group === g && r.passage === p, `${p.id}:${q.id}`);
    n++;
  });
  eachListening((s, g, q) => {
    const r = S.resolve(S.listeningKey(s.id, q.no));
    assert.ok(r && r.question === q && r.group === g && r.section === s, `${s.id}:${q.no}`);
    n++;
  });
  assert.ok(n > 50, `真实题目数 ${n} 太少`);
  assert.strictEqual(S.resolve('ir:rd-green-roofs:q99'), null);
  assert.strictEqual(S.resolve('ir:no-such-passage:q1'), null);
  assert.strictEqual(S.resolve('il:l1-sports-centre:99'), null);
  assert.strictEqual(S.resolve('il:no-such-section:1'), null);
});

// ---------------- 出题 ----------------
test('出题：不含 answer / explanation / evidence；结构字段齐全', () => {
  const check = (key) => {
    const q = S.ieltsQuestion(S.resolve(key));
    assert.deepStrictEqual(findKeys(q, ['answer', 'explanation', 'evidence', 'segment']), [], key);
    assert.strictEqual(q.id, key);
    assert.strictEqual(q.type, 'fill', '旧版前端按填空渲染，按文本作答也能判分');
    assert.ok(typeof q.stem === 'string' && q.stem.length > 0);
    assert.ok(q.ielts && typeof q.ielts.prompt === 'string');
    assert.ok(Number.isInteger(q.ielts.maxLength) && q.ielts.maxLength > 0);
    return q;
  };
  eachReading((p, g, q) => {
    const out = check(S.readingKey(p.id, q.id));
    assert.strictEqual(out.kind, 'ielts-reading');
    assert.ok(Array.isArray(out.ielts.paragraphs) && out.ielts.paragraphs.length >= 1);
    assert.strictEqual(out.ielts.script, null);
  });
  eachListening((s, g, q) => {
    const out = check(S.listeningKey(s.id, q.no));
    assert.strictEqual(out.kind, 'ielts-listening');
    assert.strictEqual(out.ielts.paragraphs, null);
    assert.strictEqual(out.ielts.script.text, s.segments[q.segment].text, '脚本应为该题对应的 segment');
  });
});

test('出题：选择类给选项、填空类题干含 {blank}；摘要题只把本题的空标成 {blank}', () => {
  const tf = S.ieltsQuestion(S.resolve('ir:rd-green-roofs:q1')).ielts;
  assert.deepStrictEqual(tf.choices.map((c) => c.key), ['TRUE', 'FALSE', 'NOT GIVEN']);
  const mcq = S.ieltsQuestion(S.resolve('ir:rd-green-roofs:q6')).ielts;
  assert.deepStrictEqual(mcq.choices, readingQ('rd-green-roofs', 'q6').q.options.map((o) => ({ key: o.key, text: o.text })));
  const sc = S.ieltsQuestion(S.resolve('ir:rd-green-roofs:q10')).ielts;
  assert.strictEqual(sc.choices, null);
  assert.strictEqual(sc.prompt.split('{blank}').length, 2);
  assert.strictEqual(sc.wordLimitLabel, 'NO MORE THAN TWO WORDS');
  const sum = S.ieltsQuestion(S.resolve('ir:rd-machine-translation:q12')).ielts;
  assert.strictEqual(sum.prompt.split('{blank}').length, 2, '本题的空只出现一次');
  assert.ok(!/\{q\d+\}/.test(sum.prompt), '其它空不应留下占位符');
  assert.ok(sum.prompt.includes('______'));
  const bank = S.ieltsQuestion(S.resolve('ir:rd-spacing-effect:q7')).ielts;
  assert.ok(bank.choices.length >= 5, '词库型摘要给词库选项');
  assert.strictEqual(bank.wordLimitLabel, '', '词库型摘要判分不查字数');
  const lc = S.ieltsQuestion(S.resolve('il:l1-sports-centre:1')).ielts;
  assert.strictEqual(lc.prompt, 'Surname: {blank}');
  assert.strictEqual(lc.wordLimitLabel, 'ONE WORD AND/OR A NUMBER');
  const lm = S.ieltsQuestion(S.resolve('il:l2-castle-tour:16')).ielts;
  assert.ok(lm.choices.length >= 5 && lm.choicesTitle);
});

test('出题：所在段落——默认给 evidence 段、标题配对给待配对段、信息定位给全文（避免泄题）', () => {
  const tf = readingQ('rd-green-roofs', 'q1');
  const paras = S.ieltsQuestion(S.resolve('ir:rd-green-roofs:q1')).ielts.paragraphs;
  assert.deepStrictEqual(paras.map((x) => x.label), [tf.q.evidence.para]);
  const mh = readingQ('rd-machine-translation', 'q1');
  assert.deepStrictEqual(S.ieltsQuestion(S.resolve('ir:rd-machine-translation:q1')).ielts.paragraphs.map((x) => x.label), [mh.q.para]);
  const mi = S.ieltsQuestion(S.resolve('ir:rd-pencil:q1')).ielts.paragraphs;
  assert.strictEqual(mi.length, readingQ('rd-pencil', 'q1').p.paragraphs.length);
});

// ---------------- 判分 ----------------
function variants(answers) {
  const out = new Set(['', 'zzz', 'T', 'f', 'ng', 'Not Given', 'yes', 'N', 'a', 'c', 'B ', 'iv', 'ii']);
  for (const a of answers) {
    out.add(a);
    out.add(a.toUpperCase());
    out.add(a.toLowerCase());
    out.add(`  ${a.split(' ').join('   ')}  `);
    out.add(`${a}s`);
    out.add(`the ${a} and more words`);
    out.add(a.replace(/'/g, '’'));
  }
  return [...out];
}

test('判分：每一道阅读题与 lib/ielts-reading.js gradeQuestion 逐条一致（含 overLimit / blank）', () => {
  let n = 0;
  eachReading((p, g, q) => {
    const key = S.readingKey(p.id, q.id);
    for (const resp of variants(q.answer)) {
      const want = R.gradeQuestion(q, g, resp.trim());
      const got = gradeKey(key, resp);
      assert.strictEqual(got.correct, want.correct, `${key} 「${resp}」`);
      assert.strictEqual(got.ielts.overLimit, want.overLimit, `${key} 「${resp}」 overLimit`);
      assert.strictEqual(got.ielts.blank, want.blank, `${key} 「${resp}」 blank`);
      n++;
    }
  });
  assert.ok(n > 500);
});

test('判分：每一道听力题与 lib/ielts-listening.js gradeQuestion 逐条一致（含 overLimit）', () => {
  let n = 0;
  eachListening((s, g, q) => {
    const key = S.listeningKey(s.id, q.no);
    for (const resp of variants(q.answer)) {
      const want = L.gradeQuestion(q, g, resp);
      const got = gradeKey(key, resp);
      assert.strictEqual(got.correct, want.correct, `${key} 「${resp}」`);
      assert.strictEqual(got.ielts.overLimit, want.overLimit, `${key} 「${resp}」 overLimit`);
      n++;
    }
  });
  assert.ok(n > 500);
});

test('判分规则：大小写 / 多余空格不计较，拼写错判错，超字数判错，T/F/NG 缩写可用', () => {
  assert.strictEqual(gradeKey('ir:rd-green-roofs:q12', '  Waterproof   MEMBRANE ').correct, true);
  assert.strictEqual(gradeKey('ir:rd-green-roofs:q12', 'membrain').correct, false);
  const over = gradeKey('ir:rd-green-roofs:q12', 'a waterproof membrane');
  assert.strictEqual(over.correct, false);
  assert.strictEqual(over.ielts.overLimit, true);
  assert.strictEqual(over.ielts.wordLimitLabel, 'NO MORE THAN TWO WORDS');
  assert.strictEqual(gradeKey('ir:rd-green-roofs:q1', 'f').correct, true);
  assert.strictEqual(gradeKey('ir:rd-green-roofs:q4', 'NG').correct, true);
  assert.strictEqual(gradeKey('ir:rd-green-roofs:q4', 'not given').correct, true);
  assert.strictEqual(gradeKey('ir:rd-green-roofs:q4', 'false').correct, false);
  assert.strictEqual(gradeKey('ir:rd-fungal-networks:q2', 'y').correct, true);
  assert.strictEqual(gradeKey('ir:rd-pencil:q11', 'in 1858').correct, true, '数字 + 词在 AND/OR A NUMBER 限制内');
  assert.strictEqual(gradeKey('ir:rd-green-roofs:q6', 'b').correct, true, '选项字母不分大小写');
  const blank = gradeKey('ir:rd-green-roofs:q6', '   ');
  assert.strictEqual(blank.correct, false);
  assert.strictEqual(blank.ielts.blank, true);
});

test('判分规则（听力）：拼写、数字写法、货币符号、字数限制按原模块', () => {
  assert.strictEqual(gradeKey('il:l1-sports-centre:1', 'BRENNAN').correct, true);
  assert.strictEqual(gradeKey('il:l1-sports-centre:1', 'Brenan').correct, false);
  assert.strictEqual(gradeKey('il:l3-cycling-survey:30', '3,000').correct, true, '千分位逗号');
  assert.strictEqual(gradeKey('il:l3-cycling-survey:30', '3000 words').correct, false);
  assert.strictEqual(gradeKey('il:l1-sports-centre:6', '£ 32').correct, true, '货币符号后的空格');
  const over = gradeKey('il:l1-sports-centre:6', 'thirty two');
  assert.strictEqual(over.correct, false);
  assert.strictEqual(over.ielts.overLimit, true);
  assert.strictEqual(gradeKey('il:l1-lost-property:3', '7.45').correct, true);
  assert.strictEqual(gradeKey('il:l2-castle-tour:11', 'c').correct, true);
  const g = gradeKey('il:l2-castle-tour:11', 'A');
  assert.strictEqual(g.correct, false);
  assert.strictEqual(g.ielts.answerText, 'to control a river crossing', '选择题给出正确选项的文字');
  assert.ok(g.ielts.evidence && g.ielts.evidence.quote, '选择题带原文依据');
});

test('判分返回：正确答案、中文解析、原文依据与原模块一致', () => {
  const { q } = readingQ('rd-green-roofs', 'q12');
  const r = gradeKey('ir:rd-green-roofs:q12', 'wrong');
  assert.deepStrictEqual(r.answer, q.answer);
  assert.strictEqual(r.explanation, q.explanation);
  assert.deepStrictEqual(r.ielts.evidence, { para: q.evidence.para, quote: q.evidence.quote });
  const mcq = gradeKey('ir:rd-green-roofs:q6', 'A');
  assert.ok(mcq.ielts.answerText, '选择题给出正确选项的文字');
  const l = listeningQ('l1-sports-centre', 1).q;
  const lr = gradeKey('il:l1-sports-centre:1', 'x');
  assert.deepStrictEqual(lr.answer, l.answer);
  assert.strictEqual(lr.explanation, l.explanation);
});

test('作答校验：response 必须是字符串，长度上限与原模块交卷一致（阅读 200、听力 100）', () => {
  for (const bad of [null, undefined, 5, true, ['A'], { a: 1 }]) {
    assert.ok(gradeKey('ir:rd-green-roofs:q1', bad).error, `阅读 ${JSON.stringify(bad)}`);
    assert.ok(gradeKey('il:l1-sports-centre:1', bad).error, `听力 ${JSON.stringify(bad)}`);
  }
  assert.ok(gradeKey('ir:rd-green-roofs:q10', 'x'.repeat(201)).error);
  assert.ok(!gradeKey('ir:rd-green-roofs:q10', 'x'.repeat(200)).error);
  assert.ok(gradeKey('il:l1-sports-centre:1', 'x'.repeat(101)).error);
  assert.ok(!gradeKey('il:l1-sports-centre:1', 'x'.repeat(100)).error);
});

// ---------------- 错题入队 ----------------
test('错题筛选：只取答错且作答了的题，答对和未作答的不送', () => {
  const rr = [
    { id: 'q1', correct: false, blank: false },
    { id: 'q2', correct: true, blank: false },
    { id: 'q3', correct: false, blank: true },
    null,
  ];
  assert.deepStrictEqual(S.readingWrongKeys('rd-green-roofs', rr), ['ir:rd-green-roofs:q1']);
  const lr = [
    { no: 1, correct: false, yours: 'x' },
    { no: 2, correct: true, yours: 'July' },
    { no: 3, correct: false, yours: '' },
  ];
  assert.deepStrictEqual(S.listeningWrongKeys('l1-sports-centre', lr), ['il:l1-sports-centre:1']);
  assert.deepStrictEqual(S.readingWrongKeys('x', 'oops'), []);
});

test('enqueue：新题按 routes/srs.js 的结构入队；已在队列的不重复加、进度不变；无法解析的跳过', () => {
  resetProfile();
  writeSrs({ items: { 'b1-l1-q1': { step: 3, dueAt: 1, reps: 4, lapses: 1, addedAt: 1 } } });
  const before = Date.now();
  const r1 = S.enqueue(['ir:rd-green-roofs:q1', 'il:l1-sports-centre:1', 'ir:rd-green-roofs:q99', 'w:hello', 42]);
  assert.deepStrictEqual(r1, { added: 2, total: 3 });
  const db = readSrs();
  assert.deepStrictEqual(db.items['b1-l1-q1'], { step: 3, dueAt: 1, reps: 4, lapses: 1, addedAt: 1 }, '原有条目不动');
  const it = db.items['ir:rd-green-roofs:q1'];
  assert.deepStrictEqual(Object.keys(it).sort(), ['addedAt', 'dueAt', 'lapses', 'reps', 'step']);
  assert.ok(it.step === 0 && it.reps === 0 && it.lapses === 0 && it.dueAt >= before && it.dueAt <= Date.now());

  // 已在队列（且有进度）的题再次答错：不重复加入，不重置进度
  db.items['ir:rd-green-roofs:q1'] = { step: 2, dueAt: 123, reps: 2, lapses: 0, addedAt: 1 };
  writeSrs(db);
  const r2 = S.enqueue(['ir:rd-green-roofs:q1', 'ir:rd-green-roofs:q1', 'il:l1-sports-centre:1']);
  assert.deepStrictEqual(r2, { added: 0, total: 3 });
  assert.deepStrictEqual(readSrs().items['ir:rd-green-roofs:q1'], { step: 2, dueAt: 123, reps: 2, lapses: 0, addedAt: 1 });
  assert.deepStrictEqual(S.enqueue(['ir:rd-green-roofs:q2', 'ir:rd-green-roofs:q2']), { added: 1, total: 4 }, '同批重复只加一次');
});

test('enqueue：srs.json 不存在时新建；items 结构异常时抛错且不改文件', () => {
  resetProfile();
  assert.deepStrictEqual(S.enqueue(['il:l2-castle-tour:11']), { added: 1, total: 1 });
  assert.ok(readSrs().items['il:l2-castle-tour:11']);
  const broken = JSON.stringify({ items: ['x'] });
  fs.writeFileSync(SRS_FILE, broken);
  assert.throws(() => S.enqueue(['ir:rd-green-roofs:q1']), /srs\.json 结构异常/);
  assert.strictEqual(fs.readFileSync(SRS_FILE, 'utf8'), broken);
});

// ---------------- 原题删除 / 暂时不可用 ----------------
const realPassage = (id) => clone(R.getPassage(id));
const realSection = (id) => clone(L.getSection(id));
const dropReadingQ = (p, qid) => {
  for (const g of p.groups) g.questions = g.questions.filter((q) => q.id !== qid);
  return p;
};
const dropListeningQ = (s, no) => {
  for (const g of s.groups) g.questions = g.questions.filter((q) => q.no !== no);
  return s;
};

test('isGone：原题、整篇文章、整个 section 删除后为 true；非雅思 key 为 false', async () => {
  const green = realPassage('rd-green-roofs');
  const pencil = realPassage('rd-pencil');
  const sports = realSection('l1-sports-centre');
  const castle = realSection('l2-castle-tour');
  await withContent(
    (c) => {
      c.write('reading', 'a.json', [green, pencil]);
      c.write('listening', 'a.json', [sports, castle]);
    },
    (c) => {
      for (const k of ['ir:rd-green-roofs:q13', 'ir:rd-pencil:q1', 'il:l1-sports-centre:10', 'il:l2-castle-tour:11']) {
        assert.ok(S.resolve(k), `${k} 应可解析`);
        assert.strictEqual(S.isGone(k), false, k);
      }
      c.write('reading', 'a.json', [dropReadingQ(clone(green), 'q13')]);
      c.write('listening', 'a.json', [dropListeningQ(clone(sports), 10)]);
      assert.strictEqual(R.validateReadingContent([R.getPassage('rd-green-roofs')]).errors.length, 0, '夹具：删题后文章仍合法');
      assert.ok(L.getSection('l1-sports-centre'), '夹具：删题后 section 仍合法');
      for (const k of ['ir:rd-green-roofs:q13', 'ir:rd-pencil:q1', 'il:l1-sports-centre:10', 'il:l2-castle-tour:11']) {
        assert.strictEqual(S.resolve(k), null, `${k} 删除后 resolve 应为 null`);
        assert.strictEqual(S.isGone(k), true, `${k} 删除后应判为已删除`);
      }
      assert.strictEqual(S.isGone('ir:rd-green-roofs:q1'), false, '未删的题');
      assert.strictEqual(S.isGone('ir:bad-key'), true, '格式坏的雅思 key');
      assert.strictEqual(S.isGone('w:hello'), false);
      assert.strictEqual(S.isGone('b1-l1-q1'), false);
    }
  );
});

test('isGone：分片读取失败、听力 section 校验不过、阅读文章自身报错时只算暂时不可用，不清理', async () => {
  const green = realPassage('rd-green-roofs');
  const sports = realSection('l1-sports-centre');
  await withContent(
    (c) => {
      c.write('reading', 'a.json', [green]);
      c.write('listening', 'a.json', [sports]);
    },
    (c) => {
      // 1) 阅读分片坏了：即便目标文章不在了也不判删除
      c.write('reading', 'a.json', []);
      c.write('reading', 'z.json', '{ not json');
      assert.strictEqual(S.resolve('ir:rd-green-roofs:q1'), null);
      assert.strictEqual(S.isGone('ir:rd-green-roofs:q1'), false);
      // 2) 阅读文章在但自身校验报错（如题目被改坏）：不判删除
      fs.rmSync(path.join(c.dir, 'reading', 'z.json'));
      const broken = clone(green);
      broken.groups[0].questions[0].id = 'Q-bad';
      c.write('reading', 'a.json', [broken]);
      assert.strictEqual(S.resolve('ir:rd-green-roofs:q1'), null);
      assert.strictEqual(S.isGone('ir:rd-green-roofs:q1'), false);
      // 3) 听力 section 校验不过被跳过：不判删除
      const bad = clone(sports);
      bad.groups[0].questions[0].segment = 999;
      c.write('listening', 'a.json', [bad]);
      assert.strictEqual(L.getSection('l1-sports-centre'), null);
      assert.strictEqual(S.isGone('il:l1-sports-centre:1'), false);
      // 4) 听力分片读取失败：不判删除
      c.write('listening', 'a.json', []);
      c.write('listening', 'z.json', '[oops');
      assert.strictEqual(S.isGone('il:l1-sports-centre:1'), false);
    }
  );
});

// ---------------- /api/srs 接口 ----------------
let BASE = '';
let server = null;
async function call(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* 非 JSON 交给断言 */ }
  return { status: res.status, body: json, raw: text };
}
const ok = (r, msg) => {
  assert.strictEqual(r.status, 200, `${msg || ''} 期望 200，实际 ${r.status} ${r.raw.slice(0, 200)}`);
  return r.body;
};
const isErr = (r, status, msg) => {
  assert.strictEqual(r.status, status, `${msg || ''} 期望 ${status}，实际 ${r.status} ${r.raw.slice(0, 200)}`);
  assert.ok(r.body && typeof r.body.error === 'string' && r.body.error, `${msg || ''} 应带 { error }`);
};

function startApp() {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', require('../routes/srs'));
  app.use('/api', require('../routes/ielts-reading'));
  app.use('/api', require('../routes/ielts-listening'));
  app.use('/api', (req, res) => res.status(404).json({ error: `接口不存在：${req.method} /api${req.path}` }));
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      BASE = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

test('接口：/srs/add 接受雅思 key，/srs/due 下发雅思题且不含答案', async () => {
  resetProfile();
  const add = ok(await call('POST', '/api/srs/add', { ids: ['ir:rd-green-roofs:q12', 'il:l1-sports-centre:1', 'ir:rd-green-roofs:q99'] }));
  assert.deepStrictEqual(add, { added: 2, total: 2 });
  const due = ok(await call('GET', '/api/srs/due'));
  assert.strictEqual(due.count, 2);
  assert.deepStrictEqual(due.questions.map((q) => q.id).sort(), ['il:l1-sports-centre:1', 'ir:rd-green-roofs:q12']);
  assert.deepStrictEqual(findKeys(due.questions, ['answer', 'explanation', 'evidence']), []);
  const kinds = due.questions.map((q) => q.kind).sort();
  assert.deepStrictEqual(kinds, ['ielts-listening', 'ielts-reading']);
  const stats = ok(await call('GET', '/api/srs/stats'));
  assert.strictEqual(stats.due, 2);
  assert.strictEqual(stats.total, 2);
});

test('接口：/srs/grade 答对按遗忘曲线后移、答错 10 分钟后重来，返回解析与原文依据', async () => {
  resetProfile();
  S.enqueue(['ir:rd-green-roofs:q12', 'il:l1-sports-centre:6']);
  const t0 = Date.now();
  const right = ok(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q12', response: 'Waterproof Membrane' }));
  assert.strictEqual(right.correct, true);
  assert.ok(right.nextDueAt >= t0 + 86400000 && right.nextDueAt <= Date.now() + 86400000, '答对后 1 天');
  assert.ok(right.ielts && right.ielts.evidence && right.ielts.evidence.para);
  assert.ok(right.explanation);
  let it = readSrs().items['ir:rd-green-roofs:q12'];
  assert.ok(it.step === 1 && it.reps === 1 && it.lapses === 0);

  const wrong = ok(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q12', response: 'a waterproof membrane' }));
  assert.strictEqual(wrong.correct, false);
  assert.strictEqual(wrong.ielts.overLimit, true, '超字数判错并标出');
  assert.deepStrictEqual(wrong.answer, readingQ('rd-green-roofs', 'q12').q.answer);
  assert.ok(wrong.nextDueAt - Date.now() <= 600000 && wrong.nextDueAt - t0 >= 600000 - 1000, '答错后约 10 分钟');
  it = readSrs().items['ir:rd-green-roofs:q12'];
  assert.ok(it.step === 0 && it.reps === 2 && it.lapses === 1);

  const lr = ok(await call('POST', '/api/srs/grade', { id: 'il:l1-sports-centre:6', response: '£ 32' }));
  assert.strictEqual(lr.correct, true);
  const stats = ok(await call('GET', '/api/srs/stats'));
  assert.strictEqual(stats.due, 0, '两题都已后移');
});

test('接口：/srs/grade 作答不合法返回 400，不改队列', async () => {
  resetProfile();
  S.enqueue(['ir:rd-green-roofs:q1']);
  const before = fs.readFileSync(SRS_FILE, 'utf8');
  isErr(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q1', response: 5 }), 400, '数字');
  isErr(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q1' }), 400, '缺 response');
  isErr(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q1', response: 'x'.repeat(201) }), 400, '超长');
  isErr(await call('POST', '/api/srs/grade', { id: 'il:l1-sports-centre:1', response: 'x'.repeat(101) }), 400, '听力超长');
  isErr(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q99', response: 'TRUE' }), 404, '不存在的题');
  isErr(await call('POST', '/api/srs/grade', { id: { x: 1 }, response: 'TRUE' }), 404, 'id 非字符串');
  assert.strictEqual(fs.readFileSync(SRS_FILE, 'utf8'), before);
});

test('接口：复习雅思题沿用 srs 原有方式，不额外写学习活动', async () => {
  resetProfile();
  S.enqueue(['ir:rd-green-roofs:q1']);
  ok(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q1', response: 'FALSE' }));
  assert.ok(!fs.existsSync(ACTIVITY_FILE), 'srs 判分不记 activity（与单词 / 对话 / 题库错题复习一致）');
});

test('接口：原题删除后 /srs/due 跳过并清理出队列，暂时不可用的保留；/srs/grade 返回 404 不报错', async () => {
  const green = realPassage('rd-green-roofs');
  const sports = realSection('l1-sports-centre');
  await withContent(
    (c) => {
      c.write('reading', 'a.json', [green]);
      c.write('listening', 'a.json', [sports]);
    },
    async (c) => {
      resetProfile();
      writeSrs({ items: { 'b1-l1-q1': { step: 0, dueAt: 1, reps: 0, lapses: 0, addedAt: 1 } } });
      S.enqueue(['ir:rd-green-roofs:q13', 'ir:rd-green-roofs:q1', 'il:l1-sports-centre:1', 'il:l1-sports-centre:10']);
      assert.strictEqual(Object.keys(readSrs().items).length, 5);

      // 删掉阅读 q13；听力 section 改坏（暂时不可用）
      c.write('reading', 'a.json', [dropReadingQ(clone(green), 'q13')]);
      const bad = clone(sports);
      bad.groups[0].questions[0].segment = 999;
      c.write('listening', 'a.json', [bad]);

      const due = ok(await call('GET', '/api/srs/due?limit=50'));
      const ids = due.questions.map((q) => q.id);
      assert.ok(ids.includes('ir:rd-green-roofs:q1'));
      assert.ok(!ids.includes('ir:rd-green-roofs:q13'), '已删的题不下发');
      assert.ok(!ids.some((id) => id.startsWith('il:')), '暂时不可用的题不下发');
      const items = readSrs().items;
      assert.ok(!items['ir:rd-green-roofs:q13'], '已删的题清理出队列');
      assert.ok(items['il:l1-sports-centre:1'] && items['il:l1-sports-centre:10'], '暂时不可用的题保留');
      assert.ok(items['b1-l1-q1'], '非雅思条目不受影响');
      const stats = ok(await call('GET', '/api/srs/stats'));
      assert.strictEqual(stats.total, ids.length, 'stats 只计可解析的题');

      // 内容修好：听力题回到复习里
      c.write('listening', 'a.json', [sports]);
      const due2 = ok(await call('GET', '/api/srs/due?limit=50'));
      assert.ok(due2.questions.some((q) => q.id === 'il:l1-sports-centre:1'));

      // 复习过程中原题被删：判分返回 404 并清理，不抛 500
      c.write('listening', 'a.json', [dropListeningQ(clone(sports), 10)]);
      const r = await call('POST', '/api/srs/grade', { id: 'il:l1-sports-centre:10', response: '28' });
      isErr(r, 404, '已删的题判分');
      assert.ok(!readSrs().items['il:l1-sports-centre:10'], '判分时发现已删也清理出队列');
    }
  );
});

// ---------------- 交卷后错题自动入队 ----------------
// 构造一份交卷答案：wrong 里的题故意答错，blank 里的题不作答，其余全对
function readingAnswers(pid, wrong, blank) {
  const out = {};
  for (const g of R.getPassage(pid).groups) {
    for (const q of g.questions) {
      if (blank.includes(q.id)) continue;
      out[q.id] = wrong.includes(q.id) ? 'zzz wrong' : q.answer[0];
    }
  }
  return out;
}
function listeningAnswers(sid, wrong, blank) {
  const out = {};
  for (const g of L.getSection(sid).groups) {
    for (const q of g.questions) {
      if (blank.includes(q.no)) continue;
      out[String(q.no)] = wrong.includes(q.no) ? 'zzz' : q.answer[0];
    }
  }
  return out;
}
const srsIds = () => (fs.existsSync(SRS_FILE) ? Object.keys(readSrs().items).sort() : []);

test('交卷：阅读答错的题进入复习队列（未作答、答对的不进），/srs/due 能看到', async () => {
  resetProfile();
  const answers = readingAnswers('rd-green-roofs', ['q2', 'q11'], ['q13']);
  const r = ok(await call('POST', '/api/ielts/reading/rd-green-roofs/submit', { answers, mode: 'practice', durationSec: 60 }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.raw, r.total - 3, '2 错 1 空');
  assert.deepStrictEqual(srsIds(), ['ir:rd-green-roofs:q11', 'ir:rd-green-roofs:q2']);
  const due = ok(await call('GET', '/api/srs/due'));
  assert.deepStrictEqual(due.questions.map((q) => q.id).sort(), ['ir:rd-green-roofs:q11', 'ir:rd-green-roofs:q2']);
});

test('交卷：同一题再次答错不重复入队，已有复习进度不被重置', async () => {
  resetProfile();
  const answers = readingAnswers('rd-green-roofs', ['q2', 'q11'], []);
  ok(await call('POST', '/api/ielts/reading/rd-green-roofs/submit', { answers, mode: 'exam' }));
  ok(await call('POST', '/api/srs/grade', { id: 'ir:rd-green-roofs:q2', response: readingQ('rd-green-roofs', 'q2').q.answer[0] }));
  const progressed = readSrs().items['ir:rd-green-roofs:q2'];
  assert.strictEqual(progressed.step, 1);
  ok(await call('POST', '/api/ielts/reading/rd-green-roofs/submit', { answers: readingAnswers('rd-green-roofs', ['q2', 'q3'], []), mode: 'exam' }));
  assert.deepStrictEqual(srsIds(), ['ir:rd-green-roofs:q11', 'ir:rd-green-roofs:q2', 'ir:rd-green-roofs:q3']);
  assert.deepStrictEqual(readSrs().items['ir:rd-green-roofs:q2'], progressed);
});

test('交卷：听力答错的题进入复习队列，复习时按原模块规则判分', async () => {
  resetProfile();
  const answers = listeningAnswers('l1-sports-centre', [1, 6], [10]);
  const r = ok(await call('POST', '/api/ielts/listening/l1-sports-centre/submit', { answers, mode: 'practice', durationSec: 30 }));
  assert.strictEqual(r.raw, r.total - 3);
  assert.deepStrictEqual(srsIds(), ['il:l1-sports-centre:1', 'il:l1-sports-centre:6']);
  const due = ok(await call('GET', '/api/srs/due'));
  assert.deepStrictEqual(due.questions.map((q) => q.id).sort(), ['il:l1-sports-centre:1', 'il:l1-sports-centre:6']);
  const g1 = ok(await call('POST', '/api/srs/grade', { id: 'il:l1-sports-centre:6', response: '£ 32' }));
  assert.strictEqual(g1.correct, true);
  const g2 = ok(await call('POST', '/api/srs/grade', { id: 'il:l1-sports-centre:1', response: 'Brenan' }));
  assert.strictEqual(g2.correct, false);
});

test('交卷：全对不入队；加入复习失败只打日志，交卷照常成功并落盘', async () => {
  resetProfile();
  ok(await call('POST', '/api/ielts/listening/l2-castle-tour/submit', { answers: listeningAnswers('l2-castle-tour', [], []), mode: 'exam' }));
  assert.deepStrictEqual(srsIds(), []);

  const broken = JSON.stringify({ items: ['x'] });
  fs.writeFileSync(SRS_FILE, broken);
  const logs = [];
  const origError = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  let rr;
  let lr;
  try {
    rr = await call('POST', '/api/ielts/reading/rd-green-roofs/submit', { answers: readingAnswers('rd-green-roofs', ['q1'], []), mode: 'exam' });
    lr = await call('POST', '/api/ielts/listening/l2-castle-tour/submit', { answers: listeningAnswers('l2-castle-tour', [11], []), mode: 'exam' });
  } finally {
    console.error = origError;
  }
  assert.strictEqual(ok(rr).ok, true);
  assert.strictEqual(ok(lr).ok, true);
  assert.ok(logs.some((m) => m.includes('[ielts-reading] 错题加入间隔复习失败')), logs.join('\n'));
  assert.ok(logs.some((m) => m.includes('[ielts-listening] 错题加入间隔复习失败')), logs.join('\n'));
  assert.strictEqual(fs.readFileSync(SRS_FILE, 'utf8'), broken, '结构异常的 srs.json 不被覆盖');
  const user = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, 'ielts.json'), 'utf8'));
  assert.strictEqual(user.readings.length, 1, '阅读交卷记录照常写入');
  assert.strictEqual(user.listenings.length, 2, '听力交卷记录照常写入');
});

// ---------------- 新题型：多选 / 地图标注 / 流程图填空 ----------------
// 夹具：lx-wetland-tour（多选 11–12 答案 B、D；地图 16–20）与 lx-river-project（三选 21–23；二选 24–25；流程图 26–30）
const NEW_TYPES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ielts-listening', 'new-types.json'), 'utf8'));
const withNewTypes = (fn) => withContent((c) => c.write('listening', 'a.json', clone(NEW_TYPES)), fn);
const fxGroup = (sid, type, nth = 0) => NEW_TYPES.find((s) => s.id === sid).groups.filter((g) => g.type === type)[nth];

test('新题型出题：多选用组题干并带 pickHint；地图带 figure；其余 figure 为 null、pickHint 为空', async () => {
  await withNewTypes(() => {
    const multi = S.ieltsQuestion(S.resolve('il:lx-wetland-tour:12'));
    assert.deepStrictEqual(findKeys(multi, ['answer', 'explanation', 'evidence', 'segment']), []);
    const g = fxGroup('lx-wetland-tour', 'mcq-multi');
    assert.strictEqual(multi.ielts.groupType, 'mcq-multi');
    assert.strictEqual(multi.ielts.prompt, g.prompt, '题干取组上的 prompt');
    assert.strictEqual(multi.ielts.pickHint, '本组有 2 个正确选项，选出其中一个即可');
    assert.deepStrictEqual(multi.ielts.choices, g.options.map((o) => ({ key: o.key, text: o.text })));
    assert.strictEqual(multi.ielts.figure, null);
    assert.ok(multi.stem.includes(g.prompt), '旧版前端的纯文本题干也带组题干');
    const three = S.ieltsQuestion(S.resolve('il:lx-river-project:22')).ielts;
    assert.strictEqual(three.pickHint, '本组有 3 个正确选项，选出其中一个即可');

    const map = S.ieltsQuestion(S.resolve('il:lx-wetland-tour:18'));
    const mg = fxGroup('lx-wetland-tour', 'map-labelling');
    assert.deepStrictEqual(map.ielts.figure, mg.figure);
    assert.strictEqual(map.ielts.prompt, 'bird hide');
    assert.strictEqual(map.ielts.pickHint, '');
    assert.deepStrictEqual(map.ielts.choices, mg.options.map((o) => ({ key: o.key, text: '' })), '地图题选项没有文字');
    assert.deepStrictEqual(findKeys(map, ['answer', 'explanation', 'evidence', 'segment']), []);

    const flow = S.ieltsQuestion(S.resolve('il:lx-river-project:27')).ielts;
    assert.strictEqual(flow.prompt, 'Mud dried in an {blank} overnight');
    assert.strictEqual(flow.wordLimitLabel, 'ONE WORD ONLY');
    assert.strictEqual(flow.choices, null);
    assert.strictEqual(flow.figure, null);
    assert.strictEqual(flow.pickHint, '');
    const mcq = S.ieltsQuestion(S.resolve('il:lx-wetland-tour:13')).ielts;
    assert.strictEqual(mcq.figure, null);
    assert.strictEqual(mcq.pickHint, '');
  });
});

test('出题：每道听力题都带 figure 与 pickHint 字段（旧题型为 null 与空串）', () => {
  let n = 0;
  eachListening((s, g, q) => {
    const ie = S.ieltsQuestion(S.resolve(S.listeningKey(s.id, q.no))).ielts;
    assert.ok('figure' in ie && 'pickHint' in ie, `${s.id}:${q.no}`);
    if (g.type !== 'map-labelling') assert.strictEqual(ie.figure, null, `${s.id}:${q.no}`);
    if (g.type !== 'mcq-multi') assert.strictEqual(ie.pickHint, '', `${s.id}:${q.no}`);
    n++;
  });
  assert.ok(n > 50);
});

test('新题型复习判分：多选作答在正确集合里即对（不管是哪道题号），并给出全部正确选项文字', async () => {
  await withNewTypes(() => {
    // 第 12 题的解析讲 D，但复习时填 B 也算对：单题只判「是否在正确集合里」
    for (const resp of ['B', 'b', ' D ', 'd']) {
      assert.strictEqual(gradeKey('il:lx-wetland-tour:12', resp).correct, true, resp);
      assert.strictEqual(gradeKey('il:lx-wetland-tour:11', resp).correct, true, resp);
    }
    const wrong = gradeKey('il:lx-wetland-tour:12', 'C');
    assert.strictEqual(wrong.correct, false);
    assert.deepStrictEqual(wrong.answer, ['B', 'D']);
    assert.strictEqual(wrong.ielts.answerText, 'feed the birds / bring dogs');
    assert.strictEqual(wrong.ielts.evidence.quote, fxGroup('lx-wetland-tour', 'mcq-multi').questions[1].evidence);
    assert.strictEqual(gradeKey('il:lx-river-project:23', 'a').correct, true);
    assert.strictEqual(gradeKey('il:lx-river-project:23', 'a').ielts.answerText, 'a map of the sampling sites / a table of water temperatures / a list of references');
    assert.strictEqual(gradeKey('il:lx-river-project:23', 'B').correct, false);
    // 地图题：字母判分，选项没有文字时 answerText 为空串
    const map = gradeKey('il:lx-wetland-tour:18', 'd');
    assert.strictEqual(map.correct, false);
    assert.deepStrictEqual(map.answer, ['C']);
    assert.strictEqual(map.ielts.answerText, '');
    assert.strictEqual(gradeKey('il:lx-wetland-tour:18', 'c').correct, true);
    // 流程图：与填空题相同，超字数判错
    const over = gradeKey('il:lx-river-project:27', 'an oven');
    assert.strictEqual(over.correct, false);
    assert.strictEqual(over.ielts.overLimit, true);
    assert.strictEqual(over.ielts.wordLimitLabel, 'ONE WORD ONLY');
    assert.strictEqual(over.ielts.answerText, '');
    assert.strictEqual(gradeKey('il:lx-river-project:27', 'Oven').correct, true);
  });
});

test('新题型复习判分：与 lib/ielts-listening.js gradeQuestion 逐条一致', async () => {
  await withNewTypes(() => {
    let n = 0;
    eachListening((s, g, q) => {
      const key = S.listeningKey(s.id, q.no);
      for (const resp of variants(q.answer)) {
        const want = L.gradeQuestion(q, g, resp);
        const got = gradeKey(key, resp);
        assert.strictEqual(got.correct, want.correct, `${key} 「${resp}」`);
        assert.strictEqual(got.ielts.overLimit, want.overLimit, `${key} 「${resp}」 overLimit`);
        n++;
      }
    });
    assert.ok(n > 200, `夹具题目的作答变体 ${n} 太少`);
  });
});

test('接口：多选、地图题进复习队列后 /srs/due 带 pickHint / figure，/srs/grade 按集合判分', async () => {
  await withNewTypes(async () => {
    resetProfile();
    S.enqueue(['il:lx-wetland-tour:12', 'il:lx-wetland-tour:18']);
    const due = ok(await call('GET', '/api/srs/due'));
    assert.deepStrictEqual(findKeys(due.questions, ['answer', 'explanation', 'evidence']), []);
    const byId = Object.fromEntries(due.questions.map((q) => [q.id, q]));
    assert.strictEqual(byId['il:lx-wetland-tour:12'].ielts.pickHint, '本组有 2 个正确选项，选出其中一个即可');
    assert.strictEqual(byId['il:lx-wetland-tour:12'].ielts.figure, null);
    assert.strictEqual(byId['il:lx-wetland-tour:18'].ielts.figure.type, 'map');
    const g = ok(await call('POST', '/api/srs/grade', { id: 'il:lx-wetland-tour:12', response: 'b' }));
    assert.strictEqual(g.correct, true);
    assert.strictEqual(g.ielts.answerText, 'feed the birds / bring dogs');
  });
});

// ---------------- 主流程 ----------------
async function main() {
  let passed = 0;
  let failed = 0;
  try {
    await startApp();
    for (const t of tests) {
      try {
        await t.fn();
        passed++;
      } catch (e) {
        failed++;
        console.error(`FAIL: ${t.name}\n  ${String(e.message).split('\n').join('\n  ')}`);
      }
    }
  } finally {
    if (server) server.close();
    profile.file = realProfileFile;
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  }
  console.log(`\n雅思错题间隔复习测试：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
