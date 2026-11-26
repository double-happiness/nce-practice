'use strict';
// 写作 AI 批改测试（全部离线，不调用真实 Claude API）：配置、请求构造、schema、回复解析与校验、错误映射、每日计数，
// 以及接口集成（未开启 503、缓存、force、每日上限、各类错误的状态码、并发 409、参数校验）。
// 用法：node scripts/test-ielts-ai.js
//
// 【离线】所有接口调用都通过 setClientFactory 注入假客户端；另把 ANTHROPIC_BASE_URL 指向本机不可用端口，
// 即使有调用漏掉注入也不会打到真实 API。
// 【隔离】接口集成测试用 lib/profile.js 新建临时档案，结束时切回原档案并删除（同 scripts/test-ielts-external.js）。

process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
delete process.env.IELTS_AI_ENABLED;
delete process.env.IELTS_AI_DAILY_LIMIT;
delete process.env.IELTS_AI_MODEL;
delete process.env.IELTS_AI_EFFORT;

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const A = require('@anthropic-ai/sdk');
const ielts = require('../lib/ielts');
const ai = require('../lib/ielts-ai');

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

const KEY_SENTENCE = 'Many young people are not knowing how to cook a simple meal.';
const ESSAY = [
  'It is often said that schools should prepare young people for life rather than only for exams.',
  `${KEY_SENTENCE} In my opinion, schools should spend more time on practical skills such as cooking and managing money.`,
  'Firstly, not every family has the time to teach these skills, so school is the fairest place to learn them. '.repeat(6),
  'Secondly, practical lessons can make academic subjects more meaningful, for example when students use percentages to compare prices. '.repeat(6),
  'However, academic subjects are still important for university and careers, so the change should be moderate. '.repeat(5),
  'In conclusion, I largely agree that schools should teach life skills, as long as academic subjects are not seriously reduced.',
].join('\n\n');

function reviewJson(task, overrides) {
  const dims = ai.DIM_KEYS[task];
  return JSON.stringify({
    criteria: dims.map((k, i) => ({ key: k, band: [6, 6.5, 6, 6.5][i], comment: `${k} 评语` })),
    summary: '总评',
    strengths: ['亮点一', '亮点二', '亮点三', '亮点四'],
    issues: Array.from({ length: 6 }, (_, i) => ({ criterion: dims[i % 4], problem: `问题 ${i}`, example: 'example', suggestion: '建议' })),
    corrections: [
      { original: KEY_SENTENCE, corrected: 'Many young people do not know how to cook a simple meal.', explanation: '状态动词不用进行时' },
      { original: 'This sentence is not in the essay.', corrected: 'x', explanation: 'y' },
    ],
    improvedParagraph: { original: 'Firstly, ...', improved: 'To begin with, ...' },
    ...(overrides || {}),
  });
}

function response(text, extra) {
  return {
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
    usage: { input_tokens: 3000, output_tokens: 2500 },
    ...(extra || {}),
  };
}

const apiErr = (status, type, msg) => A.APIError.generate(status, { type: 'error', error: { type, message: msg } }, msg, new Headers());

// ---------------- 配置 ----------------
test('config：开关、模型、effort、每日上限', () => {
  assert.deepStrictEqual(ai.config({}), { enabled: false, model: 'claude-opus-5-5', effort: 'high', dailyLimit: 20 });
  assert.strictEqual(ai.config({ ANTHROPIC_API_KEY: 'k' }).enabled, true);
  assert.strictEqual(ai.config({ ANTHROPIC_AUTH_TOKEN: 't' }).enabled, true);
  assert.strictEqual(ai.config({ ANTHROPIC_API_KEY: '  ' }).enabled, false, '空白 key 不算');
  assert.strictEqual(ai.config({ IELTS_AI_ENABLED: '1' }).enabled, true, '用 ant 登录凭据时强制开启');
  assert.strictEqual(ai.config({ ANTHROPIC_API_KEY: 'k', IELTS_AI_ENABLED: '0' }).enabled, false, '强制关闭优先');
  assert.strictEqual(ai.config({ IELTS_AI_MODEL: 'claude-sonnet-5-5' }).model, 'claude-sonnet-5-5');
  assert.strictEqual(ai.config({ IELTS_AI_MODEL: 'Bad Model!' }).model, 'claude-opus-5-5');
  assert.strictEqual(ai.config({ IELTS_AI_EFFORT: 'medium' }).effort, 'medium');
  assert.strictEqual(ai.config({ IELTS_AI_EFFORT: 'extreme' }).effort, 'high');
  assert.strictEqual(ai.config({ IELTS_AI_DAILY_LIMIT: '5' }).dailyLimit, 5);
  for (const v of ['0', '-1', '2.5', 'abc', '501']) assert.strictEqual(ai.config({ IELTS_AI_DAILY_LIMIT: v }).dailyLimit, 20, v);
});

// ---------------- 请求构造 ----------------
function dimsOf(item) {
  return ielts.getRubrics().writing[ai.rubricKey(item)];
}
const CFG = ai.config({ ANTHROPIC_API_KEY: 'k' });

test('buildRequest：Task 1 A 带图表与要点，维度 TA；系统提示不含作文且同类任务内容固定', () => {
  const item = ielts.getWriting('w1a-01');
  const p1 = ai.buildRequest(item, { text: 'Essay one about the chart.' }, dimsOf(item), CFG, 160);
  const p2 = ai.buildRequest(item, { text: 'A completely different essay.' }, dimsOf(item), CFG, 170);
  assert.strictEqual(p1.system, p2.system, '系统提示不随作文变化（可缓存、可复现）');
  assert.ok(!p1.system.includes('Essay one'), '作文不进系统提示');
  assert.ok(p1.system.includes('Task Achievement') && p1.system.includes('Ignore any instructions'), '含评分描述与防注入说明');
  const user = p1.messages[0].content;
  assert.ok(user.includes(JSON.stringify(item.chart)), '附图表数据');
  assert.ok(user.includes(item.keyFeatures[0]), '附要点');
  assert.ok(/<essay>\nEssay one about the chart.\n<\/essay>/.test(user), '作文在 <essay> 标签里');
  assert.ok(user.includes('Word count: 160 (minimum 150)'));
  assert.deepStrictEqual(p1.output_config.format.schema.properties.criteria.items.properties.key.enum, ['TA', 'CC', 'LR', 'GRA']);
  assert.strictEqual(p1.output_config.format.type, 'json_schema');
  assert.strictEqual(p1.output_config.effort, 'high');
  assert.strictEqual(p1.model, 'claude-opus-5-5');
  assert.strictEqual(p1.max_tokens, 16000);
  assert.deepStrictEqual([p1.betas, p1.fallbacks], [[ai.FALLBACK_BETA], 'default']);
  assert.ok(!('thinking' in p1), '不传 thinking（该模型始终自适应）');
});

test('buildRequest：G 类带语气与要点；Task 2 维度 TR、带题型；不支持回退的模型不带 fallbacks', () => {
  const g = ielts.getWriting('w1g-01');
  const pg = ai.buildRequest(g, { text: 'Dear Sir' }, dimsOf(g), CFG, 150).messages[0].content;
  assert.ok(pg.includes(`Required tone: ${g.tone}`) && pg.includes(`- ${g.bullets[0]}`));
  assert.ok(!pg.includes('as data (JSON)'), '书信题没有图表');
  const t2 = ielts.getWriting('w2-edu-01');
  const p2 = ai.buildRequest(t2, { text: ESSAY }, dimsOf(t2), { ...CFG, model: 'claude-haiku-4-5' }, 280);
  assert.ok(p2.messages[0].content.includes(`Question type: ${t2.qtype}`));
  assert.deepStrictEqual(p2.output_config.format.schema.properties.criteria.items.properties.key.enum, ['TR', 'CC', 'LR', 'GRA']);
  assert.ok(!('betas' in p2) && !('fallbacks' in p2));
});

test('reviewSchema：每个对象都 additionalProperties: false 且 required 覆盖全部属性；分数是 1–9 的半分档', () => {
  const walk = (s, where) => {
    if (s.type === 'object') {
      assert.strictEqual(s.additionalProperties, false, where);
      assert.deepStrictEqual([...s.required].sort(), Object.keys(s.properties).sort(), where);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${where}.${k}`);
    } else if (s.type === 'array') {
      walk(s.items, `${where}[]`);
    }
  };
  walk(ai.reviewSchema(2), 'root');
  assert.deepStrictEqual(ai.BANDS, [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9]);
});

// ---------------- 回复解析 ----------------
test('extractText：拒答回退后只取最后一个 fallback 块之后的文本', () => {
  assert.strictEqual(ai.extractText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'ab');
  assert.strictEqual(ai.extractText({ content: [{ type: 'text', text: 'declined' }, { type: 'fallback' }, { type: 'thinking' }, { type: 'text', text: '{}' }] }), '{}');
  assert.strictEqual(ai.extractText({}), '');
});

test('parseReview：合法结果归一化、截断条数、标记逐句修改是否在原文、总分向下取整', () => {
  const r = ai.parseReview(reviewJson(2), 2, ESSAY);
  assert.ok(!r.error, r.error);
  const v = r.review;
  assert.deepStrictEqual(Object.keys(v.criteria), ['TR', 'CC', 'LR', 'GRA']);
  assert.strictEqual(v.band, 6, '(6 + 6.5 + 6 + 6.5) / 4 = 6.25 → 6（与自评 bandFromScores 一致，向下取整）');
  assert.strictEqual(v.strengths.length, ai.LIMITS.strengths);
  assert.strictEqual(v.issues.length, ai.LIMITS.issues);
  assert.deepStrictEqual(v.corrections.map((c) => c.found), [true, false]);
  assert.deepStrictEqual(v.improvedParagraph, { original: 'Firstly, ...', improved: 'To begin with, ...' });
  const high = ai.parseReview(reviewJson(1, { criteria: ['TA', 'CC', 'LR', 'GRA'].map((k) => ({ key: k, band: 7, comment: '' })) }), 1, ESSAY);
  assert.strictEqual(high.review.band, 7);
  const noPara = ai.parseReview(reviewJson(2, { improvedParagraph: { original: '', improved: '  ' } }), 2, ESSAY);
  assert.strictEqual(noPara.review.improvedParagraph, null);
});

test('parseReview：非法 JSON、缺项、重复、错分数、错维度都报错', () => {
  const bad = (text, task, re) => {
    const r = ai.parseReview(text, task, ESSAY);
    assert.ok(r.error && re.test(r.error), `应报错 ${re}：${r.error}`);
  };
  bad('not json', 2, /不是合法 JSON/);
  bad('[]', 2, /不是对象/);
  bad(JSON.stringify({}), 2, /缺少 criteria/);
  const crit = (list) => reviewJson(2, { criteria: list });
  bad(crit([{ key: 'TR', band: 6, comment: '' }]), 2, /缺少评分项：CC、LR、GRA/);
  bad(crit(['TR', 'TR', 'CC', 'LR'].map((k) => ({ key: k, band: 6, comment: '' }))), 2, /重复/);
  bad(crit(['TR', 'CC', 'LR', 'GRA'].map((k) => ({ key: k, band: 6.3, comment: '' }))), 2, /分数不合法/);
  bad(crit(['TA', 'CC', 'LR', 'GRA'].map((k) => ({ key: k, band: 6, comment: '' }))), 2, /不认识的评分项：TA/);
});

// ---------------- 错误映射与计数 ----------------
test('mapError：SDK 类型化错误 → 状态码', () => {
  const cases = [
    [apiErr(401, 'authentication_error', 'bad key'), 502, /认证失败/],
    [apiErr(403, 'permission_error', 'no'), 502, /认证失败/],
    [apiErr(429, 'rate_limit_error', 'slow'), 429, /太频繁/],
    [apiErr(529, 'overloaded_error', 'busy'), 503, /繁忙/],
    [apiErr(500, 'api_error', 'boom'), 503, /繁忙/],
    [apiErr(400, 'invalid_request_error', 'bad param'), 502, /400.*bad param/],
    [new A.APIConnectionTimeoutError(), 504, /超时/],
    [new A.APIConnectionError({ message: 'ECONNREFUSED' }), 504, /连不上/],
    [new Error('weird'), 500, /weird/],
  ];
  for (const [err, status, re] of cases) {
    const m = ai.mapError(err);
    assert.strictEqual(m.status, status, `${err.constructor.name} → ${m.status}`);
    assert.ok(re.test(m.error), m.error);
  }
});

test('每日计数：累加、只保留近 30 天、忽略畸形值', () => {
  const user = { aiUsage: { '2026-10-01': 5, '2026-11-20': 2, bad: 3, '2026-11-25': -1 } };
  assert.strictEqual(ai.usedToday(user, '2026-11-20'), 2);
  assert.strictEqual(ai.usedToday({}, '2026-11-20'), 0);
  assert.strictEqual(ai.bumpUsage(user, '2026-11-26', ielts.dayNumber), 1);
  assert.deepStrictEqual(user.aiUsage, { '2026-11-20': 2, '2026-11-26': 1 });
  assert.strictEqual(ai.bumpUsage(user, '2026-11-26', ielts.dayNumber), 2);
});

// ---------------- 接口集成（临时档案 + 假客户端）----------------
async function integration() {
  const express = require('express');
  const profile = require('../lib/profile');
  const original = profile.currentId();
  const created = profile.create(`ai-test-${Date.now().toString(36)}`);
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
    app.use('/api', require('../routes/ielts-ai'));
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
    ai.setClientFactory(null);
    if (server) await new Promise((r) => server.close(r));
    cleanup();
    process.removeListener('SIGINT', onSig);
    process.removeListener('SIGTERM', onSig);
  }
}

async function runIntegration(call) {
  // 假客户端：handler(params) 决定返回什么；calls 记录每次请求参数
  const calls = [];
  let handler = () => response(reviewJson(2));
  ai.setClientFactory(() => ({ beta: { messages: { create: async (params) => { calls.push(params); return handler(params); } } } }));

  const submit = async (text) => {
    const r = await call('POST', '/ielts/writing/submit', {
      promptId: 'w2-edu-01', text, durationSec: 2400, selfScores: { TR: 6, CC: 6, LR: 6, GRA: 6 },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    return r.data.entry.id;
  };
  const essayId = await submit(ESSAY);
  const shortId = await submit('Too short to review.');
  const review = (id, body) => call('POST', `/ielts/writing/${id}/ai-review`, body);

  await testAsync('接口：未配置 key 时 status.enabled=false，批改返回 503', async () => {
    const s = await call('GET', '/ielts/ai/status');
    assert.deepStrictEqual(s.data, { enabled: false, model: 'claude-opus-5-5', effort: 'high', dailyLimit: 20, usedToday: 0 });
    const r = await review(essayId, {});
    assert.strictEqual(r.status, 503);
    assert.ok(r.data.error.includes('ANTHROPIC_API_KEY'));
    assert.strictEqual(calls.length, 0);
  });

  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';

  await testAsync('接口：参数校验 400 / 404', async () => {
    assert.strictEqual((await review('bad%20id', {})).status, 400);
    assert.strictEqual((await review('no-such-record', {})).status, 404);
    const short = await review(shortId, {});
    assert.strictEqual(short.status, 400);
    assert.ok(short.data.error.includes('至少写到 30 词'));
    assert.strictEqual((await review(essayId, { force: 'yes' })).status, 400);
    assert.strictEqual((await review(essayId, { foo: 1 })).status, 400);
    assert.strictEqual((await review(essayId, '[1]')).status, 400);
    assert.strictEqual(calls.length, 0, '参数不合法时不调用 API');
  });

  await testAsync('接口：批改成功写入记录；再次请求走缓存不再调用；status 计数 +1', async () => {
    const r = await review(essayId, {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.strictEqual(r.data.cached, false);
    const v = r.data.review;
    assert.strictEqual(v.band, 6);
    assert.deepStrictEqual(Object.keys(v.criteria), ['TR', 'CC', 'LR', 'GRA']);
    assert.deepStrictEqual(v.usage, { inputTokens: 3000, outputTokens: 2500 });
    assert.strictEqual(v.model, 'claude-opus-5-5');
    assert.strictEqual(v.effort, 'high');
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].messages[0].content.includes(KEY_SENTENCE) && !calls[0].system.includes(KEY_SENTENCE));
    const hist = (await call('GET', '/ielts/history?type=writing&limit=10')).data.items.find((x) => x.id === essayId);
    assert.ok(hist.ai && hist.ai.band === 6, '记录页能拿到 ai 字段');
    const again = await review(essayId, {});
    assert.deepStrictEqual([again.status, again.data.cached, calls.length], [200, true, 1]);
    assert.strictEqual((await call('GET', '/ielts/ai/status')).data.usedToday, 1);
  });

  await testAsync('接口：force 重新批改；超过每日上限 429 且不调用', async () => {
    handler = () => response(reviewJson(2, { criteria: ['TR', 'CC', 'LR', 'GRA'].map((k) => ({ key: k, band: 7, comment: '' })) }));
    const r = await review(essayId, { force: true });
    assert.deepStrictEqual([r.status, r.data.cached, r.data.review.band, calls.length], [200, false, 7, 2]);
    process.env.IELTS_AI_DAILY_LIMIT = '2';
    const over = await review(essayId, { force: true });
    assert.strictEqual(over.status, 429);
    assert.ok(over.data.error.includes('次数已用完'));
    assert.strictEqual(calls.length, 2);
    delete process.env.IELTS_AI_DAILY_LIMIT;
  });

  await testAsync('接口：API 错误、拒答、截断、格式不对都返回 JSON 错误，且不改动已有结果和计数', async () => {
    const cases = [
      [() => { throw apiErr(429, 'rate_limit_error', 'slow'); }, 429],
      [() => { throw apiErr(529, 'overloaded_error', 'busy'); }, 503],
      [() => { throw apiErr(401, 'authentication_error', 'bad'); }, 502],
      [() => { throw new A.APIConnectionTimeoutError(); }, 504],
      [() => { throw new Error('unexpected'); }, 500],
      [() => response('{"criteria":', { stop_reason: 'max_tokens' }), 502],
      [() => response('', { stop_reason: 'refusal' }), 502],
      [() => response('not json'), 502],
      [() => response(reviewJson(2, { criteria: [] })), 502],
    ];
    for (const [h, status] of cases) {
      handler = h;
      const r = await review(essayId, { force: true });
      assert.strictEqual(r.status, status, `${h} → ${r.status} ${JSON.stringify(r.data)}`);
      assert.ok(typeof r.data.error === 'string' && r.data.error, '错误是 JSON { error }');
    }
    const user = ielts.loadUser();
    assert.strictEqual(user.writings.find((x) => x.id === essayId).ai.band, 7, '失败不覆盖上一次的结果');
    assert.strictEqual((await call('GET', '/ielts/ai/status')).data.usedToday, 2, '失败不计次');
  });

  await testAsync('接口：同一篇并发请求只放行一个，另一个 409', async () => {
    let release;
    handler = () => new Promise((resolve) => { release = () => resolve(response(reviewJson(2))); });
    const first = review(essayId, { force: true });
    await new Promise((r) => setTimeout(r, 100));
    const second = await review(essayId, { force: true });
    assert.strictEqual(second.status, 409);
    release();
    assert.strictEqual((await first).status, 200);
  });

  await testAsync('接口：IELTS_AI_ENABLED=0 强制关闭', async () => {
    process.env.IELTS_AI_ENABLED = '0';
    assert.strictEqual((await call('GET', '/ielts/ai/status')).data.enabled, false);
    assert.strictEqual((await review(essayId, { force: true })).status, 503);
    delete process.env.IELTS_AI_ENABLED;
  });

  delete process.env.ANTHROPIC_API_KEY;
}

(async () => {
  try {
    await integration();
  } catch (e) {
    failed++;
    console.error(`FAIL: 接口集成测试没能运行：${e.stack || e.message}`);
  }
  console.log(`\n写作 AI 批改测试：${passed} 通过，${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
