'use strict';
/*
 * 雅思备考 MVP —— 接口集成测试（依据 docs/design/ielts-prep-mvp-20261124.md §4 §5 §2-D5/D6）
 *
 * 运行：node scripts/test-ielts-api.js      有失败时退出码 1
 *
 * 【隔离方案】
 *   lib/profile.js 的数据目录写死为 <repo>/data/profiles，不支持环境变量改目录，所以：
 *   1. 启动服务（随机空闲端口，PORT 环境变量）后，第一件事 GET /api/profile/list 记录原档案 id；
 *   2. POST /api/profile/create 新建临时档案「ielts-api-test-xxxx」（create 会自动切过去），
 *      此后所有读写（含 ielts.json、activity.json、备份导出）都落在临时档案；
 *   3. finally 中：切回原档案 -> remove 临时档案（服务端会把目录移入 data/profiles/.trash/）
 *      -> 脚本再把 .trash 里属于该临时档案的目录彻底删除（.trash 为空则一并删除）-> 杀掉服务进程。
 *   注意：若脚本被 kill -9 等硬杀，finally 不会执行，当前档案会停在临时档案上，需手动切回。
 *   为覆盖「当前处于第几周」等依赖 startDate 的场景，个别用例会直接改写临时档案目录下的 ielts.json
 *   （schema 见契约 §4），只动临时档案，不碰原档案。
 *
 * 【待合并后核对的假设】（契约没写死的细节）
 *   A1  错误响应均为 JSON { error: string }；校验类错误 HTTP 400；找不到资源（未知题目 id）为 404 或 400。
 *   A2  POST /ielts/profile 成功返回 { profile, derived }，或至少再 GET 能读到更新后的值。
 *   A3  GET /ielts/profile 的 derived 含 daysLeft / totalWeeks / currentWeek / phase / templateWeek。
 *   A4  examDate 最远今天 + 364 天（与 52 周上限对齐），365 天返回 400。
 *   A5  POST /ielts/plan/check 只接受当前模板中 kind 为 external 的 taskKey；internal 任务或未知 key 返回 400；
 *       date 非 YYYY-MM-DD 返回 400。
 *   A6  今日 external 任务可能不在第 1 周：若当前周没有 external 任务，脚本把临时档案 startDate 回拨 8 周
 *       （并把 examDate 设为开始日 + 26 周），使其落在模板第 9 周（专项期，契约要求含 external 任务）。
 *   A7  GET /ielts/vocab-check 的 options 是中文释义字符串数组，POST 的 choice 为选项下标（0-3，常量
 *       CHOICE_AS_INDEX 可改为按选项文本提交）；正确答案 = options 中等于该词 cn 的那项（cn 取自 /ielts/vocab）。
 *   A8  重复提交同一 quizId、无效 quizId 返回 4xx 并带 error；30 分钟过期无法在测试里等待，未覆盖。
 *   A9  writing submit 响应含 { wordCount, band, warning }；字数足够时 warning 为空（falsy），不足时为非空字符串。
 *       提交成功时 HTTP 200（也接受 201）。
 *   A10 selfScores 合法范围 0–9、步长 0.5；缺少维度或非数字、越界、非 0.5 步长一律 400。
 *       Task 2 维度 TR/CC/LR/GRA，Task 1 维度 TA/CC/LR/GRA，口语 FC/LR/GRA/P。
 *   A11 text 为空、非字符串返回 400；超过 20000 字符的处理方式不限：要么 400，要么 200 且存储截断到 <= 20000。
 *   A12 history 条目含完整 text（writing）并按 ts 倒序；type 缺失或非法返回 400；limit 生效。
 *   A13 summary.writing.last3Avg 为最近 3 次 band 的平均（以 history 为准）；estimate.overall 为数字或 null。
 *   A14 plan/overview 的 todayBySource 含 ielts-writing / ielts-speaking / ielts-vocab 计数，
 *       skills 中 key 为 write 的 done 随雅思写作提交 +1（key 为 speak 的 done 随口语提交 +1）。
 *   A15 /api/backup/export 返回 { data: { ielts: {...} } }，ielts.writings 为数组。
 *   A16 speaking submit 的 part 与题目 part 不一致、未知 itemId 返回 400/404；notes 可缺省。
 *   A17 GET /ielts/vocab 的 limit 超大时不会报错；条目带 topic/cefr/key/level 字段。
 */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const READY_LINE = '新概念英语练习系统: http://localhost:';
const CHOICE_AS_INDEX = false; // 与前端一致：choice 传选项原文（空串表示不认识）

// ---------- 小工具 ----------
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // 避开夏令时/零点边界
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const TODAY = () => addDays(0);
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

let BASE = '';
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, opts);
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch (_) { /* 非 JSON 留给断言处理 */ }
  return { status: res.status, body: json, raw };
}
const get = (u) => api('GET', u);
const post = (u, b) => api('POST', u, b);

const isErr400 = (r, msg) => {
  assert.strictEqual(r.status, 400, `${msg || ''} 期望 400，实际 ${r.status} ${r.raw.slice(0, 200)}`);
  assert.ok(r.body && typeof r.body.error === 'string' && r.body.error, `${msg || ''} 应带 { error }`);
};
const isErr4xx = (r, msg) => {
  assert.ok(r.status >= 400 && r.status < 500, `${msg || ''} 期望 4xx，实际 ${r.status} ${r.raw.slice(0, 200)}`);
  assert.ok(r.body && typeof r.body.error === 'string' && r.body.error, `${msg || ''} 应带 { error }`);
};
const isOk = (r, msg) => {
  assert.ok(r.status === 200 || r.status === 201, `${msg || ''} 期望 200，实际 ${r.status} ${r.raw.slice(0, 300)}`);
  assert.ok(r.body !== null, `${msg || ''} 应返回 JSON`);
  return r.body;
};

// ---------- 服务进程 ----------
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`服务 30 秒内未就绪，输出：\n${out}`));
    }, 30000);
    child.stdout.on('data', (b) => {
      out += b.toString();
      if (!settled && out.includes(READY_LINE)) {
        settled = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', (b) => { out += b.toString(); });
    child.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`服务提前退出（code ${code}），输出：\n${out}`));
    });
    child.once('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
  });
}

// ---------- 共享上下文 ----------
const ctx = {
  origId: null,
  tempId: null,
  w2: null, // Task 2 题目（列表项）
  w1: null, // Task 1 题目（列表项）
  s1: null, // 口语 Part 1 条目
  s2: null, // 口语 Part 2 条目
  vocabByWord: null,
  submittedWritings: 0,
};

function tempIeltsFile() {
  return path.join(PROFILES_DIR, ctx.tempId, 'ielts.json');
}
function patchTempIelts(mutator) {
  const f = tempIeltsFile();
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  mutator(cur);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(cur, null, 2));
}

const W2_SCORES = { TR: 6, CC: 6, LR: 5.5, GRA: 5.5 };
const W1_SCORES = { TA: 6, CC: 6, LR: 6, GRA: 6 };
const SP_SCORES = { FC: 5, LR: 5, GRA: 5, P: 5.5 };

async function submitWriting(item, text, selfScores, durationSec) {
  return post('/api/ielts/writing/submit', {
    promptId: item.id, text, durationSec: durationSec == null ? 600 : durationSec, selfScores,
  });
}
const scoresFor = (item, vals) => {
  const keys = item.task === 2 ? ['TR', 'CC', 'LR', 'GRA'] : ['TA', 'CC', 'LR', 'GRA'];
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
};
async function overview() {
  return isOk(await get('/api/plan/overview'), 'plan/overview');
}

// =====================================================================
// profile
// =====================================================================
test('profile: 新档案 GET 返回默认值且 active=false，带 derived', async () => {
  const b = isOk(await get('/api/ielts/profile'));
  assert.ok(b.profile, '缺 profile');
  assert.strictEqual(b.profile.active, false);
  assert.ok(b.derived && typeof b.derived === 'object', '缺 derived');
  for (const k of ['daysLeft', 'totalWeeks', 'currentWeek', 'phase', 'templateWeek']) {
    assert.ok(k in b.derived, `derived 缺 ${k}`);
  }
});

test('profile: 未激活时 GET /ielts/summary 返回 active=false', async () => {
  const b = isOk(await get('/api/ielts/summary'));
  assert.strictEqual(b.active, false);
});

test('profile: POST 激活后 active=true 且 startDate 为今天', async () => {
  const exam = addDays(26 * 7);
  isOk(await post('/api/ielts/profile', { active: true, examType: 'A', examDate: exam }));
  const { profile } = isOk(await get('/api/ielts/profile'));
  assert.strictEqual(profile.active, true);
  assert.strictEqual(profile.startDate, TODAY());
  assert.strictEqual(profile.examType, 'A');
  assert.strictEqual(profile.examDate, exam);
});

test('profile: 再次 POST 部分更新不改变 startDate，且保留未传字段', async () => {
  isOk(await post('/api/ielts/profile', { examType: 'G' }));
  const { profile } = isOk(await get('/api/ielts/profile'));
  assert.strictEqual(profile.examType, 'G');
  assert.strictEqual(profile.startDate, TODAY());
  assert.strictEqual(profile.active, true);
  isOk(await post('/api/ielts/profile', { examType: 'A' }));
});

test('profile: examDate = 今天 + 26 周时 totalWeeks=26、currentWeek=1、templateWeek=1', async () => {
  const { derived } = isOk(await get('/api/ielts/profile'));
  assert.strictEqual(derived.totalWeeks, 26);
  assert.strictEqual(derived.currentWeek, 1);
  assert.strictEqual(derived.templateWeek, 1);
  assert.ok(derived.daysLeft >= 26 * 7 - 1 && derived.daysLeft <= 26 * 7, `daysLeft=${derived.daysLeft}`);
});

test('profile: 考试日很近时 totalWeeks 夹到下限 4（D6）', async () => {
  isOk(await post('/api/ielts/profile', { examDate: addDays(7) }));
  const { derived } = isOk(await get('/api/ielts/profile'));
  assert.strictEqual(derived.totalWeeks, 4);
});

test('profile: 考试日最远 364 天，totalWeeks 为上限 52（D6）；365 天返回 400', async () => {
  isErr400(await post('/api/ielts/profile', { examDate: addDays(365) }), 'examDate=+365');
  isOk(await post('/api/ielts/profile', { examDate: addDays(364) }));
  const { derived } = isOk(await get('/api/ielts/profile'));
  assert.strictEqual(derived.totalWeeks, 52);
  isOk(await post('/api/ielts/profile', { examDate: addDays(26 * 7) }));
});

test('profile: 非法 examType 返回 400 且带 error', async () => {
  isErr400(await post('/api/ielts/profile', { examType: 'X' }), 'examType=X');
  isErr400(await post('/api/ielts/profile', { examType: 'a' }), 'examType=a');
  isErr400(await post('/api/ielts/profile', { examType: 1 }), 'examType=1');
});

test('profile: 非法 examDate 格式返回 400', async () => {
  for (const bad of ['2027/05/24', 'abc', '2027-13-45', '2027-02-30', '', 20270524]) {
    isErr400(await post('/api/ielts/profile', { examDate: bad }), `examDate=${JSON.stringify(bad)}`);
  }
});

test('profile: 过去的 examDate 返回 400', async () => {
  isErr400(await post('/api/ielts/profile', { examDate: '2020-01-01' }), '过去日期');
  isErr400(await post('/api/ielts/profile', { examDate: addDays(-1) }), '昨天');
});

test('profile: 非法请求不会污染已保存的档案', async () => {
  const before = isOk(await get('/api/ielts/profile')).profile;
  await post('/api/ielts/profile', { examType: 'X', examDate: addDays(100) });
  const after = isOk(await get('/api/ielts/profile')).profile;
  assert.strictEqual(after.examType, before.examType);
  assert.strictEqual(after.examDate, before.examDate);
});

test('profile: active 非布尔值返回 400', async () => {
  isErr400(await post('/api/ielts/profile', { active: 'yes' }), 'active=yes');
});

// =====================================================================
// plan
// =====================================================================
test('plan: GET 返回今日任务及整体结构', async () => {
  const p = isOk(await get('/api/ielts/plan'));
  assert.ok(Array.isArray(p.phases) && p.phases.length === 3, 'phases 应有 3 个阶段');
  assert.strictEqual(typeof p.totalWeeks, 'number');
  assert.strictEqual(typeof p.currentWeek, 'number');
  assert.ok(p.week && typeof p.week === 'object', '缺 week');
  assert.ok(p.today && Array.isArray(p.today.tasks) && p.today.tasks.length > 0, 'today.tasks 应非空');
  for (const t of p.today.tasks) {
    assert.ok(t.key && t.label, `任务缺 key/label: ${JSON.stringify(t)}`);
    assert.ok(['internal', 'external'].includes(t.kind), `kind 非法: ${t.kind}`);
    assert.strictEqual(typeof t.done, "number", `${t.key}.done 应为完成次数（数字）`);
    assert.strictEqual(typeof t.met, 'boolean', `${t.key}.met 应为布尔`);
  }
  assert.ok(Array.isArray(p.upcoming), 'upcoming 应为数组');
  assert.ok(p.upcoming.length <= 2, 'upcoming 最多 2 周');
  assert.strictEqual(typeof p.warning, 'string');
});

test('plan: checkpoints 数组结构正确（week/name/criteria/status/suggestions）', async () => {
  const p = isOk(await get('/api/ielts/plan'));
  assert.ok(Array.isArray(p.checkpoints) && p.checkpoints.length === 3, 'checkpoints 应有 3 个');
  const weeks = p.checkpoints.map((c) => c.week);
  assert.deepStrictEqual([...weeks].sort((a, b) => a - b), weeks, '应按周升序');
  for (const c of p.checkpoints) {
    assert.ok(typeof c.week === 'number' && c.name, 'week/name');
    assert.ok(c.criteria && 'vocabBand' in c.criteria, 'criteria');
    assert.ok(['future', 'due', 'passed', 'failed'].includes(c.status), `status=${c.status}`);
    assert.ok(Array.isArray(c.suggestions), 'suggestions 应为数组');
  }
  // 刚开始备考：第 1 周，所有检查点都应为 future
  assert.ok(p.checkpoints.every((c) => c.status === 'future'), '第 1 周时检查点都应是 future');
});

test('plan: 到达检查点周但尚无成绩时为 due，并给出待测项建议', async () => {
  // 把开始日回拨 8 周、考试日 = 开始日 + 26 周 -> 当前第 9 周，第 8 周检查点已到期
  patchTempIelts((j) => {
    j.profile = j.profile || {};
    j.profile.startDate = addDays(-8 * 7);
    j.profile.examDate = addDays(18 * 7);
  });
  const p = isOk(await get('/api/ielts/plan'));
  assert.strictEqual(p.totalWeeks, 26);
  assert.strictEqual(p.currentWeek, 9);
  const cp8 = p.checkpoints.find((c) => c.week === 8);
  assert.ok(cp8, '缺第 8 周检查点');
  assert.strictEqual(cp8.status, 'due', `没有诊断/写作/口语成绩时应为 due，实际 ${cp8.status}`);
  assert.ok(cp8.suggestions.length >= 1, 'due 应列出待完成的测评');
  const later = p.checkpoints.find((c) => c.week === 14);
  assert.strictEqual(later.status, 'future');
});

let externalKey = null;
test('plan: external 任务打勾后 checkedToday=true、done+1，取消后恢复', async () => {
  const p = isOk(await get('/api/ielts/plan'));
  const ext = p.today.tasks.find((t) => t.kind === 'external');
  assert.ok(ext, `当前第 ${p.currentWeek} 周（模板第 ${p.week.week || '?'} 周）没有 external 任务`);
  externalKey = ext.key;
  assert.strictEqual(ext.checkedToday, false);
  const done0 = ext.done;

  isOk(await post('/api/ielts/plan/check', { date: TODAY(), taskKey: externalKey, done: true }));
  let again = isOk(await get('/api/ielts/plan')).today.tasks.find((t) => t.key === externalKey);
  assert.strictEqual(again.checkedToday, true, '打勾后应 checkedToday=true');
  assert.strictEqual(again.done, done0 + 1, '打勾后 done 应 +1');
  assert.strictEqual(again.met, again.done >= again.target, 'met 应等于 done >= target');

  isOk(await post('/api/ielts/plan/check', { date: TODAY(), taskKey: externalKey, done: false }));
  again = isOk(await get('/api/ielts/plan')).today.tasks.find((t) => t.key === externalKey);
  assert.strictEqual(again.checkedToday, false, '取消后应 checkedToday=false');
  assert.strictEqual(again.done, done0, '取消后 done 应恢复');
});

test('plan: 重复打勾幂等（checkedToday 保持 true，不产生重复记录）', async () => {
  assert.ok(externalKey, '依赖上一条用例');
  for (let i = 0; i < 2; i++) {
    isOk(await post('/api/ielts/plan/check', { date: TODAY(), taskKey: externalKey, done: true }));
  }
  const t = isOk(await get('/api/ielts/plan')).today.tasks.find((x) => x.key === externalKey);
  assert.strictEqual(t.checkedToday, true);
  const f = JSON.parse(fs.readFileSync(tempIeltsFile(), 'utf8'));
  const arr = (f.manualDone || {})[TODAY()] || [];
  assert.strictEqual(arr.filter((k) => k === externalKey).length, 1, 'manualDone 中不应重复');
  isOk(await post('/api/ielts/plan/check', { date: TODAY(), taskKey: externalKey, done: false }));
});

test('plan: 未知 taskKey 返回 400', async () => {
  isErr400(await post('/api/ielts/plan/check', { date: TODAY(), taskKey: 'no-such-task', done: true }), '未知 key');
  isErr400(await post('/api/ielts/plan/check', { date: TODAY(), done: true }), '缺 taskKey');
});

test('plan: internal 任务不允许手动打勾（400）', async () => {
  const p = isOk(await get('/api/ielts/plan'));
  const internal = p.today.tasks.find((t) => t.kind === 'internal');
  assert.ok(internal, '当前周应有 internal 任务');
  isErr400(await post('/api/ielts/plan/check', { date: TODAY(), taskKey: internal.key, done: true }), 'internal');
});

test('plan: 非法 date 返回 400', async () => {
  assert.ok(externalKey, '依赖 external 用例');
  isErr400(await post('/api/ielts/plan/check', { date: '2026/11/24', taskKey: externalKey, done: true }), '斜杠日期');
  isErr400(await post('/api/ielts/plan/check', { taskKey: externalKey, done: true }), '缺 date');
});

// =====================================================================
// vocab
// =====================================================================
test('vocab: 无过滤返回 total、topics、items 结构', async () => {
  const b = isOk(await get('/api/ielts/vocab?limit=5'));
  assert.ok(b.total > 0, 'total 应 > 0');
  assert.ok(Array.isArray(b.topics) && b.topics.length > 0, 'topics 应非空');
  for (const t of b.topics) assert.ok(t.key && t.label && typeof t.count === 'number', `topic 结构: ${JSON.stringify(t)}`);
  assert.strictEqual(b.items.length, 5);
  for (const it of b.items) {
    assert.ok(it.word && it.cn && it.topic && it.cefr && it.key, `item 字段不全: ${JSON.stringify(it)}`);
    assert.ok(it.level === null || [0, 1, 2, 3].includes(it.level), `level=${it.level}`);
  }
});

test('vocab: topic 过滤只返回该话题，total 等于 topics 里的 count', async () => {
  const all = isOk(await get('/api/ielts/vocab?limit=1'));
  const t = all.topics.find((x) => x.count > 0);
  const b = isOk(await get(`/api/ielts/vocab?topic=${encodeURIComponent(t.key)}&limit=500`));
  assert.strictEqual(b.total, t.count);
  assert.ok(b.items.length > 0 && b.items.every((i) => i.topic === t.key), '存在非该话题的条目');
});

test('vocab: cefr 过滤只返回该等级', async () => {
  const b = isOk(await get('/api/ielts/vocab?cefr=B2&limit=500'));
  assert.ok(b.items.length > 0, 'B2 应有词');
  assert.ok(b.items.every((i) => i.cefr === 'B2'), '存在非 B2 的条目');
});

test('vocab: topic + cefr 组合过滤取交集', async () => {
  const b = isOk(await get('/api/ielts/vocab?topic=academic&cefr=B2&limit=500'));
  assert.ok(b.items.every((i) => i.topic === 'academic' && i.cefr === 'B2'));
});

test('vocab: limit 限制条数，offset 翻页且不重叠', async () => {
  const p1 = isOk(await get('/api/ielts/vocab?limit=5&offset=0'));
  const p2 = isOk(await get('/api/ielts/vocab?limit=5&offset=5'));
  assert.strictEqual(p1.items.length, 5);
  assert.strictEqual(p2.items.length, 5);
  assert.strictEqual(p1.total, p2.total, 'total 不应随分页变化');
  const k1 = new Set(p1.items.map((i) => i.key));
  assert.ok(p2.items.every((i) => !k1.has(i.key)), '两页不应有重复词');
});

test('vocab: offset 超出总数返回空 items，不报错', async () => {
  const b = isOk(await get('/api/ielts/vocab?limit=5&offset=999999'));
  assert.deepStrictEqual(b.items, []);
  assert.ok(b.total > 0);
});

test('vocab: 不存在的话题返回 400（显式校验枚举）', async () => {
  isErr400(await get('/api/ielts/vocab?topic=no-such-topic'), 'topic=no-such-topic');
  isErr400(await get('/api/ielts/vocab?limit=501'), 'limit=501');
});

test('vocab: q 关键字搜索只返回相关词', async () => {
  const first = isOk(await get('/api/ielts/vocab?limit=1')).items[0];
  const b = isOk(await get(`/api/ielts/vocab?q=${encodeURIComponent(first.word)}&limit=50`));
  assert.ok(b.items.some((i) => i.word === first.word), '按词本身搜索应命中');
});

// =====================================================================
// vocab-check
// =====================================================================
async function loadVocabMap() {
  if (ctx.vocabByWord) return ctx.vocabByWord;
  const map = new Map();
  let offset = 0;
  for (;;) {
    const b = isOk(await get(`/api/ielts/vocab?limit=200&offset=${offset}`));
    for (const i of b.items) map.set(i.word, i.cn);
    offset += b.items.length;
    if (!b.items.length || offset >= b.total) break;
  }
  ctx.vocabByWord = map;
  return map;
}
const pickChoice = (options, correctText, wantCorrect) => {
  const idx = options.indexOf(correctText);
  let i;
  if (wantCorrect) i = idx >= 0 ? idx : 0;
  else i = idx === 0 ? 1 : 0; // 选一个肯定不是正确答案的项
  return CHOICE_AS_INDEX ? i : options[i];
};
async function runCheck(wantCorrect) {
  const map = await loadVocabMap();
  const q = isOk(await get('/api/ielts/vocab-check'));
  const answers = q.items.map((it) => ({ id: it.id, choice: pickChoice(it.options, map.get(it.word), wantCorrect) }));
  const r = await post('/api/ielts/vocab-check', { quizId: q.quizId, answers });
  return { q, answers, r };
}

test('vocab-check: GET 出题结构（quizId、每题 4 个选项、B1/B2/C1 各 10 题）', async () => {
  const q = isOk(await get('/api/ielts/vocab-check'));
  assert.ok(q.quizId, '缺 quizId');
  assert.ok(Array.isArray(q.items) && q.items.length > 0);
  assert.strictEqual(q.items.length, 30, '应从 B1/B2/C1 各抽 10 个共 30 题');
  const ids = new Set();
  for (const it of q.items) {
    assert.ok(it.id !== undefined && it.word, 'item 缺 id/word');
    assert.strictEqual(it.options.length, 4, `${it.word} 应有 4 个选项`);
    assert.strictEqual(new Set(it.options).size, 4, `${it.word} 选项不应重复`);
    assert.ok(!('answer' in it) && !('cn' in it), '不应把答案下发给前端');
    ids.add(it.id);
  }
  assert.strictEqual(ids.size, q.items.length, 'item id 应唯一');
});

test('vocab-check: 全对提交后 byBand 按 B1/B2/C1 分段，含 overall 与 wrong', async () => {
  const before = (await overview()).todayBySource['ielts-vocab'] || 0;
  const { r } = await runCheck(true);
  const b = isOk(r);
  for (const band of ['B1', 'B2', 'C1']) {
    const s = b.byBand[band];
    assert.ok(s, `byBand 缺 ${band}`);
    assert.strictEqual(s.total, 10);
    assert.ok(s.correct >= 0 && s.correct <= s.total);
    assert.ok(s.coverage >= 0 && s.coverage <= 100, `coverage=${s.coverage}`);
  }
  assert.ok(b.overall >= 0 && b.overall <= 100, `overall=${b.overall}`);
  assert.ok(Array.isArray(b.wrong), 'wrong 应为数组');
  assert.strictEqual(b.wrong.length, 0, '按 cn 全选对，wrong 应为空');
  const after = (await overview()).todayBySource['ielts-vocab'] || 0;
  assert.ok(after > before, `活动来源 ielts-vocab 应增加（${before} -> ${after}）`);
});

test('vocab-check: 全错的 overall 低于全对，wrong 列出全部题目', async () => {
  const right = isOk((await runCheck(true)).r);
  const wrongRun = await runCheck(false);
  const wrong = isOk(wrongRun.r);
  assert.ok(wrong.overall < right.overall, `全错 ${wrong.overall} 应 < 全对 ${right.overall}`);
  assert.strictEqual(wrong.wrong.length, wrongRun.q.items.length);
  for (const band of ['B1', 'B2', 'C1']) assert.strictEqual(wrong.byBand[band].correct, 0);
});

test('vocab-check: 提交结果写入 vocabChecks，summary.vocab 可见', async () => {
  const f = JSON.parse(fs.readFileSync(tempIeltsFile(), 'utf8'));
  assert.ok(Array.isArray(f.vocabChecks) && f.vocabChecks.length >= 3, 'vocabChecks 应有记录');
  const s = isOk(await get('/api/ielts/summary'));
  assert.ok(s.vocab && typeof s.vocab.lastOverall === 'number', 'summary.vocab.lastOverall');
  assert.ok(s.vocab.byBand && s.vocab.byBand.B1, 'summary.vocab.byBand');
});

test('vocab-check: 重复提交同一 quizId 返回 4xx', async () => {
  const { q, answers, r } = await runCheck(true);
  isOk(r);
  isErr4xx(await post('/api/ielts/vocab-check', { quizId: q.quizId, answers }), '重复提交');
});

test('vocab-check: 无效 quizId 返回 4xx 且带 error', async () => {
  isErr4xx(await post('/api/ielts/vocab-check', { quizId: 'no-such-quiz', answers: [] }), '无效 quizId');
  isErr4xx(await post('/api/ielts/vocab-check', { answers: [] }), '缺 quizId');
});

test('vocab-check: answers 不是数组返回 400', async () => {
  const q = isOk(await get('/api/ielts/vocab-check'));
  isErr400(await post('/api/ielts/vocab-check', { quizId: q.quizId, answers: 'oops' }), 'answers 非数组');
});

// =====================================================================
// writing
// =====================================================================
test('writing: 列表不含 modelAnswer，每条带 done 与 bestBand', async () => {
  const b = isOk(await get('/api/ielts/writing'));
  const list = Array.isArray(b) ? b : b.items || b.prompts || b.list;
  assert.ok(Array.isArray(list) && list.length > 0, '列表应为非空数组（或 {items:[...]}）');
  for (const it of list) {
    assert.ok(it.id && it.task, `缺 id/task: ${JSON.stringify(it).slice(0, 100)}`);
    assert.ok(!('modelAnswer' in it), `${it.id} 列表不应含 modelAnswer`);
    assert.strictEqual(it.done, 0, `${it.id} 新档案 done 应为 0`);
    assert.ok('bestBand' in it, `${it.id} 缺 bestBand`);
  }
  ctx.w2 = list.find((i) => i.task === 2);
  ctx.w1 = list.find((i) => i.task === 1 && i.variant === 'A') || list.find((i) => i.task === 1);
  assert.ok(ctx.w2 && ctx.w1, '应同时有 Task 1 和 Task 2 题目');
});

test('writing: task / variant / qtype 过滤', async () => {
  const unwrap = (b) => (Array.isArray(b) ? b : b.items || b.prompts || b.list);
  const t2 = unwrap(isOk(await get('/api/ielts/writing?task=2')));
  assert.ok(t2.length > 0 && t2.every((i) => i.task === 2));
  const g = unwrap(isOk(await get('/api/ielts/writing?task=1&variant=G')));
  assert.ok(g.length > 0 && g.every((i) => i.task === 1 && i.variant === 'G'));
  const q = unwrap(isOk(await get(`/api/ielts/writing?task=2&qtype=${t2[0].qtype}`)));
  assert.ok(q.length > 0 && q.every((i) => i.qtype === t2[0].qtype));
});

test('writing: 详情含 modelAnswer 与 prompt', async () => {
  const d = isOk(await get(`/api/ielts/writing/${ctx.w2.id}`));
  assert.strictEqual(d.id, ctx.w2.id);
  assert.ok(typeof d.modelAnswer === 'string' && d.modelAnswer.length > 100, '缺 modelAnswer');
  assert.ok(d.prompt);
});

test('writing: 未知题目 id 详情返回 404（或 400）并带 error', async () => {
  const r = await get('/api/ielts/writing/no-such-id');
  assert.ok(r.status === 404 || r.status === 400, `status=${r.status}`);
  assert.ok(r.body && r.body.error);
});

test('writing: submit 由服务端统计 wordCount（多空格/换行不影响）', async () => {
  const r = isOk(await submitWriting(ctx.w2, 'one  two\nthree \t four\n\nfive', W2_SCORES, 60));
  assert.strictEqual(r.wordCount, 5);
  ctx.submittedWritings++;
});

test('writing: 客户端传入的 wordCount 被忽略', async () => {
  const r = isOk(await post('/api/ielts/writing/submit', {
    promptId: ctx.w2.id, text: 'a b c', durationSec: 60, selfScores: W2_SCORES, wordCount: 999,
  }));
  assert.strictEqual(r.wordCount, 3);
  ctx.submittedWritings++;
});

test('writing: Task 2 少于 250 词给出字数不足提示', async () => {
  const r = isOk(await submitWriting(ctx.w2, words(249), W2_SCORES));
  assert.strictEqual(r.wordCount, 249);
  assert.ok(typeof r.warning === 'string' && r.warning, '249 词应有 warning');
  ctx.submittedWritings++;
});

test('writing: Task 2 恰好 250 词无字数提示', async () => {
  const r = isOk(await submitWriting(ctx.w2, words(250), W2_SCORES));
  assert.strictEqual(r.wordCount, 250);
  assert.ok(!r.warning, `250 词不应有 warning: ${r.warning}`);
  ctx.submittedWritings++;
});

test('writing: Task 1 少于 150 词有提示，达到 150 词无提示', async () => {
  const s = scoresFor(ctx.w1, [6, 6, 6, 6]);
  const low = isOk(await submitWriting(ctx.w1, words(149), s));
  assert.ok(low.warning, '149 词应有 warning');
  const ok = isOk(await submitWriting(ctx.w1, words(150), s));
  assert.ok(!ok.warning, `150 词不应有 warning: ${ok.warning}`);
  ctx.submittedWritings += 2;
});

test('writing: band 按 D5 向下取整到 0.5（6,6,5.5,5.5 平均 5.75 -> 5.5）', async () => {
  const r = isOk(await submitWriting(ctx.w2, words(260), { TR: 6, CC: 6, LR: 5.5, GRA: 5.5 }));
  assert.strictEqual(r.band, 5.5);
  ctx.submittedWritings++;
});

test('writing: band 取整其他边界（整数均分、.125、.375、.875）', async () => {
  const cases = [
    [[6, 6, 6, 6], 6], // 6.0
    [[5, 5, 5, 5.5], 5], // 5.125 -> 5.0
    [[6.5, 6.5, 6.5, 6], 6], // 6.375 -> 6.0
    [[6, 6, 6, 5.5], 5.5], // 5.875 -> 5.5
    [[0, 0, 0, 0], 0],
    [[9, 9, 9, 9], 9],
  ];
  for (const [vals, want] of cases) {
    const r = isOk(await submitWriting(ctx.w2, words(260), scoresFor(ctx.w2, vals)));
    assert.strictEqual(r.band, want, `${vals.join(',')} 期望 ${want}，实际 ${r.band}`);
    ctx.submittedWritings++;
  }
});

test('writing: selfScores 越界（>9、<0）返回 400', async () => {
  for (const bad of [9.5, 10, -0.5, -1]) {
    isErr400(await submitWriting(ctx.w2, words(260), { ...W2_SCORES, TR: bad }), `TR=${bad}`);
  }
});

test('writing: selfScores 非 0.5 步长或非数字返回 400', async () => {
  for (const bad of [5.3, 6.25, 5.1, '6', null, 'abc']) {
    isErr400(await submitWriting(ctx.w2, words(260), { ...W2_SCORES, LR: bad }), `LR=${JSON.stringify(bad)}`);
  }
});

test('writing: selfScores 缺维度或整体缺失返回 400', async () => {
  isErr400(await submitWriting(ctx.w2, words(260), { TR: 6, CC: 6, LR: 6 }), '缺 GRA');
  isErr400(await submitWriting(ctx.w2, words(260), undefined), '缺 selfScores');
});

test('writing: 未知 promptId 返回 4xx', async () => {
  isErr4xx(await post('/api/ielts/writing/submit', {
    promptId: 'no-such-id', text: words(260), durationSec: 60, selfScores: W2_SCORES,
  }), '未知 promptId');
});

test('writing: 空 text 或非字符串 text 返回 400', async () => {
  isErr400(await submitWriting(ctx.w2, '', W2_SCORES), '空 text');
  isErr400(await submitWriting(ctx.w2, 12345, W2_SCORES), '数字 text');
  isErr400(await submitWriting(ctx.w2, undefined, W2_SCORES), '缺 text');
});

test('writing: text 超过 20000 字符被拒绝或截断到 20000 以内，服务不崩溃', async () => {
  const huge = 'a'.repeat(20001);
  const r = await submitWriting(ctx.w2, huge, W2_SCORES);
  if (r.status === 400) {
    assert.ok(r.body && r.body.error);
  } else {
    isOk(r);
    ctx.submittedWritings++;
    const h = isOk(await get('/api/ielts/history?type=writing&limit=1'));
    const items = Array.isArray(h) ? h : h.items;
    assert.ok(items[0].text.length <= 20000, `存储 text 长度 ${items[0].text.length} 超过 20000`);
  }
  isOk(await get('/api/ielts/profile')); // 服务仍可用
});

test('writing: 恰好 20000 字符可以正常提交', async () => {
  const r = isOk(await submitWriting(ctx.w2, 'a'.repeat(20000), W2_SCORES));
  assert.strictEqual(r.wordCount, 1);
  ctx.submittedWritings++;
});

test('writing: 提交后列表 done 增加、bestBand 为最高分', async () => {
  const b = isOk(await get('/api/ielts/writing?task=2'));
  const list = Array.isArray(b) ? b : b.items || b.prompts || b.list;
  const it = list.find((i) => i.id === ctx.w2.id);
  assert.ok(it.done >= 5, `done=${it.done}`);
  assert.strictEqual(it.bestBand, 9, '前面提交过 9,9,9,9，bestBand 应为 9');
});

test('writing: XSS 文本原样保存并返回，服务不崩溃', async () => {
  const xss = '<script>alert(1)</script> <img src=x onerror=alert(2)> & "quotes"';
  const r = isOk(await submitWriting(ctx.w2, xss, W2_SCORES));
  ctx.submittedWritings++;
  assert.ok(r.wordCount > 0);
  const h = isOk(await get('/api/ielts/history?type=writing&limit=1'));
  const items = Array.isArray(h) ? h : h.items;
  assert.strictEqual(items[0].text, xss, '后端不应转义或改写 text');
});

test('plan/overview: 提交写作后今日「写」技能完成数 +1，来源 ielts-writing +1', async () => {
  const before = await overview();
  const writeBefore = before.skills.find((s) => s.key === 'write').done;
  const srcBefore = before.todayBySource['ielts-writing'] || 0;
  isOk(await submitWriting(ctx.w2, words(260), W2_SCORES));
  ctx.submittedWritings++;
  const after = await overview();
  assert.strictEqual(after.skills.find((s) => s.key === 'write').done, writeBefore + 1);
  assert.strictEqual(after.todayBySource['ielts-writing'], srcBefore + 1);
});

// =====================================================================
// speaking
// =====================================================================
test('speaking: 列表结构，Part 2 条目带 part3 题数', async () => {
  const unwrap = (b) => (Array.isArray(b) ? b : b.items || b.list);
  const all = unwrap(isOk(await get('/api/ielts/speaking')));
  assert.ok(all.length > 0);
  for (const it of all) assert.ok(it.id && it.part, '缺 id/part');
  const p2 = unwrap(isOk(await get('/api/ielts/speaking?part=2')));
  assert.ok(p2.length > 0 && p2.every((i) => i.part === 2));
  assert.ok(p2.every((i) => typeof i.part3Count === 'number' || typeof i.part3 === 'number' || Array.isArray(i.part3)),
    'Part 2 条目应带 part3 题数（字段名待核对）');
  const p1 = unwrap(isOk(await get('/api/ielts/speaking?part=1')));
  assert.ok(p1.length > 0 && p1.every((i) => i.part === 1));
  ctx.s1 = p1[0];
  ctx.s2 = p2[0];
});

test('speaking: 详情返回完整条目；未知 id 返回 404/400', async () => {
  const d = isOk(await get(`/api/ielts/speaking/${ctx.s2.id}`));
  assert.strictEqual(d.id, ctx.s2.id);
  assert.ok(d.cueCard && d.sample, 'Part 2 详情应含 cueCard 与 sample');
  const r = await get('/api/ielts/speaking/no-such-id');
  assert.ok(r.status === 404 || r.status === 400, `status=${r.status}`);
  assert.ok(r.body && r.body.error);
});

test('speaking: submit 正常，band 向下取整到 0.5（5,5,5,5.5 -> 5）', async () => {
  const before = await overview();
  const srcBefore = before.todayBySource['ielts-speaking'] || 0;
  const r = isOk(await post('/api/ielts/speaking/submit', {
    itemId: ctx.s2.id, part: 2, durationSec: 118, selfScores: SP_SCORES, notes: 'test',
  }));
  assert.strictEqual(r.band, 5);
  const after = await overview();
  assert.strictEqual(after.todayBySource['ielts-speaking'], srcBefore + 1, '来源 ielts-speaking 应 +1');
});

test('speaking: band 取整（6,6,5.5,5.5 -> 5.5；notes 可缺省）', async () => {
  const r = isOk(await post('/api/ielts/speaking/submit', {
    itemId: ctx.s1.id, part: 1, durationSec: 30, selfScores: { FC: 6, LR: 6, GRA: 5.5, P: 5.5 },
  }));
  assert.strictEqual(r.band, 5.5);
});

test('speaking: selfScores 越界或非 0.5 步长返回 400', async () => {
  for (const bad of [9.5, -1, 5.3, 'x']) {
    isErr400(await post('/api/ielts/speaking/submit', {
      itemId: ctx.s1.id, part: 1, durationSec: 30, selfScores: { ...SP_SCORES, FC: bad },
    }), `FC=${JSON.stringify(bad)}`);
  }
  isErr400(await post('/api/ielts/speaking/submit', {
    itemId: ctx.s1.id, part: 1, durationSec: 30, selfScores: { FC: 5, LR: 5, GRA: 5 },
  }), '缺 P');
});

test('speaking: 未知 itemId 或 part 非法返回 4xx', async () => {
  isErr4xx(await post('/api/ielts/speaking/submit', {
    itemId: 'no-such-id', part: 1, durationSec: 30, selfScores: SP_SCORES,
  }), '未知 itemId');
  isErr400(await post('/api/ielts/speaking/submit', {
    itemId: ctx.s1.id, part: 4, durationSec: 30, selfScores: SP_SCORES,
  }), 'part=4');
});

test('speaking: durationSec 为负数返回 400', async () => {
  isErr400(await post('/api/ielts/speaking/submit', {
    itemId: ctx.s1.id, part: 1, durationSec: -5, selfScores: SP_SCORES,
  }), 'durationSec<0');
});

test('speaking: 口语 notes 含 <script> 原样保存', async () => {
  const notes = '<script>alert(1)</script>';
  isOk(await post('/api/ielts/speaking/submit', {
    itemId: ctx.s1.id, part: 1, durationSec: 20, selfScores: SP_SCORES, notes,
  }));
  const h = isOk(await get('/api/ielts/history?type=speaking&limit=1'));
  const items = Array.isArray(h) ? h : h.items;
  assert.strictEqual(items[0].notes, notes);
});

// =====================================================================
// rubrics / history / summary / backup
// =====================================================================
test('rubrics: 返回 writing 与 speaking 维度', async () => {
  const b = isOk(await get('/api/ielts/rubrics'));
  assert.ok(b.writing && b.writing.task2 && b.writing.task1A && b.writing.task1G, 'writing 三类维度');
  assert.strictEqual(b.writing.task2.length, 4);
  assert.strictEqual(b.speaking.length, 4);
});

test('history: writing 按 ts 倒序，limit 生效', async () => {
  const b = isOk(await get('/api/ielts/history?type=writing&limit=100'));
  const items = Array.isArray(b) ? b : b.items;
  assert.ok(items.length >= 2);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].ts >= items[i].ts, `第 ${i} 条顺序错误`);
  assert.ok(items.every((x) => x.promptId && typeof x.wordCount === 'number' && 'band' in x));
  const two = isOk(await get('/api/ielts/history?type=writing&limit=2'));
  assert.strictEqual((Array.isArray(two) ? two : two.items).length, 2);
});

test('history: speaking 按 ts 倒序', async () => {
  const b = isOk(await get('/api/ielts/history?type=speaking'));
  const items = Array.isArray(b) ? b : b.items;
  assert.ok(items.length >= 2);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].ts >= items[i].ts);
  assert.ok(items.every((x) => x.itemId && x.part));
});

test('history: type 缺失或非法返回 400', async () => {
  isErr400(await get('/api/ielts/history'), '缺 type');
  isErr400(await get('/api/ielts/history?type=listening'), 'type=listening');
});

test('summary: 结构完整，count 与历史一致，last3Avg 为最近 3 次均值', async () => {
  const s = isOk(await get('/api/ielts/summary'));
  assert.strictEqual(s.active, true);
  assert.strictEqual(s.writing.count, ctx.submittedWritings, `writing.count 应为 ${ctx.submittedWritings}`);
  assert.ok(s.speaking.count >= 3);
  const h = isOk(await get('/api/ielts/history?type=writing&limit=3'));
  const last3 = (Array.isArray(h) ? h : h.items).map((x) => x.band);
  const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
  assert.ok(Math.abs(s.writing.last3Avg - avg) < 0.01, `last3Avg=${s.writing.last3Avg} 期望 ≈ ${avg}`);
  assert.ok('vocab' in s && 'estimate' in s);
  assert.ok(s.estimate.overall === null || typeof s.estimate.overall === 'number');
  assert.ok(typeof s.estimate.note === 'string');
});

test('backup: 导出包含 ielts 键，writings 为数组且含刚提交的作文', async () => {
  const b = isOk(await get('/api/backup/export'));
  assert.ok(b.data && 'ielts' in b.data, '导出 data 缺 ielts 键');
  assert.ok(Array.isArray(b.data.ielts.writings) && b.data.ielts.writings.length > 0);
  assert.ok(Array.isArray(b.data.ielts.speakings) && b.data.ielts.speakings.length > 0);
  assert.ok(b.data.ielts.profile && b.data.ielts.profile.active === true);
});

test('backup: 导入包含 ielts 的备份后数据可还原', async () => {
  const exp = isOk(await get('/api/backup/export'));
  const count = exp.data.ielts.writings.length;
  const r = isOk(await post('/api/backup/import', { app: 'nce', data: { ielts: exp.data.ielts } }));
  assert.ok(r.restored.includes('ielts'), `restored=${JSON.stringify(r.restored)}`);
  const h = isOk(await get('/api/ielts/summary'));
  assert.strictEqual(h.writing.count, count);
});

test('接口兜底: 未知 /api/ielts 路径返回 JSON 404', async () => {
  const r = await get('/api/ielts/no-such-endpoint');
  assert.strictEqual(r.status, 404);
  assert.ok(r.body && r.body.error);
});

// =====================================================================
// 主流程
// =====================================================================
function cleanupTrash(tempId) {
  const trash = path.join(PROFILES_DIR, '.trash');
  if (!fs.existsSync(trash)) return;
  for (const name of fs.readdirSync(trash)) {
    if (name.startsWith(`${tempId}-`)) fs.rmSync(path.join(trash, name), { recursive: true, force: true });
  }
  if (fs.readdirSync(trash).length === 0) fs.rmdirSync(trash);
}

async function main() {
  let child = null;
  let failed = 0;
  let passed = 0;
  const failures = [];
  const killChild = () => { if (child && !child.killed) child.kill('SIGTERM'); };
  process.on('SIGINT', () => { killChild(); process.exit(130); });

  try {
    const port = await freePort();
    child = await startServer(port);
    BASE = `http://127.0.0.1:${port}`;
    console.log(`服务已就绪：${BASE}`);

    // 隔离：先记原档案，再建临时档案（create 会自动切换过去）
    const list = isOk(await get('/api/profile/list'), 'profile/list');
    ctx.origId = list.current;
    const name = `ielts-api-test-${Math.random().toString(36).slice(2, 8)}`;
    const created = isOk(await post('/api/profile/create', { name, emoji: '🧪' }), 'profile/create');
    ctx.tempId = created.id;
    const now = isOk(await get('/api/profile/list'));
    assert.strictEqual(now.current, ctx.tempId, '应已切换到临时档案');
    console.log(`原档案 ${ctx.origId}，临时档案 ${ctx.tempId}\n`);

    for (const t of tests) {
      try {
        await t.fn();
        passed++;
        console.log(`✓ ${t.name}`);
      } catch (e) {
        failed++;
        failures.push({ name: t.name, msg: e.message });
        console.log(`✗ ${t.name}`);
        console.log(`    ${String(e.message).split('\n').join('\n    ')}`);
      }
    }
  } catch (e) {
    failed++;
    failures.push({ name: '(启动/隔离阶段)', msg: e.stack || e.message });
    console.error(`✗ 启动/隔离阶段出错：${e.stack || e.message}`);
  } finally {
    // 清理：切回原档案 -> 删除临时档案 -> 清 .trash -> 杀服务
    try {
      if (BASE && ctx.origId) {
        const sw = await post('/api/profile/switch', { id: ctx.origId });
        if (sw.status !== 200) console.error(`!! 切回原档案失败：${sw.raw}，请手动切回 ${ctx.origId}`);
        if (ctx.tempId && sw.status === 200) {
          const rm = await post('/api/profile/remove', { id: ctx.tempId });
          if (rm.status !== 200) console.error(`!! 删除临时档案失败：${rm.raw}（id=${ctx.tempId}）`);
          cleanupTrash(ctx.tempId);
        }
      }
    } catch (e) {
      console.error(`!! 清理出错：${e.message}（原档案 ${ctx.origId}，临时档案 ${ctx.tempId}）`);
      failed++;
    }
    killChild();
  }

  console.log(`\n共 ${passed + failed} 项：通过 ${passed}，失败 ${failed}`);
  if (failures.length) {
    console.log('失败清单：');
    for (const f of failures) console.log(`  - ${f.name}`);
  }
  process.exit(failed ? 1 : 0);
}

main();
