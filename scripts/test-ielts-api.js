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

// ---- 口语转写与流利度指标（可选字段 transcript / metrics）----
const SP_METRICS = { words: 210, wpm: 118.5, fillers: 4, repeats: 1, longPauses: 2, connectives: 6 };
const speakSubmit = (extra) => post('/api/ielts/speaking/submit', {
  itemId: ctx.s1.id, part: 1, durationSec: 107, selfScores: SP_SCORES, ...extra,
});
// 直接发原始 JSON 文本（JSON.stringify 写不出 1e999、也不会保留 "__proto__" 自有键）
async function postRaw(url, raw) {
  const res = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* 非 JSON 留给断言处理 */ }
  return { status: res.status, body: json, raw: text };
}
const speakingCount = async () => isOk(await get('/api/ielts/summary')).speaking.count;

test('speaking: 带 transcript 与 metrics 提交，记录原样返回（transcript 去首尾空白、不转义）', async () => {
  const transcript = '  I usually <b>walk</b> to work because it is close.\n\nUm, I mean... "quotes" & more  ';
  const r = isOk(await speakSubmit({ transcript, metrics: SP_METRICS }));
  assert.strictEqual(r.entry.transcript, transcript.trim());
  assert.deepStrictEqual(r.entry.metrics, SP_METRICS);
  const h = isOk(await get('/api/ielts/history?type=speaking&limit=1'));
  const top = (Array.isArray(h) ? h : h.items)[0];
  assert.strictEqual(top.id, r.entry.id);
  assert.strictEqual(top.transcript, transcript.trim());
  assert.deepStrictEqual(top.metrics, SP_METRICS);
});

test('speaking: transcript / metrics 为 null、空白或空对象时不写入记录；metrics 可只给部分字段', async () => {
  const r1 = isOk(await speakSubmit({ transcript: null, metrics: null }));
  assert.ok(!('transcript' in r1.entry) && !('metrics' in r1.entry), JSON.stringify(r1.entry));
  const r2 = isOk(await speakSubmit({ transcript: '   \n ', metrics: {} }));
  assert.ok(!('transcript' in r2.entry) && !('metrics' in r2.entry), JSON.stringify(r2.entry));
  const r3 = isOk(await speakSubmit({ metrics: { words: 0, wpm: 0 } }));
  assert.deepStrictEqual(r3.entry.metrics, { words: 0, wpm: 0 });
});

test('speaking: transcript 非字符串或超过 6000 字符返回 400；恰好 6000 字符可以提交', async () => {
  const before = await speakingCount();
  for (const bad of [123, ['a'], { t: 'x' }, true]) {
    isErr400(await speakSubmit({ transcript: bad }), `transcript=${JSON.stringify(bad)}`);
  }
  isErr400(await speakSubmit({ transcript: 'a'.repeat(6001) }), 'transcript 6001 字符');
  assert.strictEqual(await speakingCount(), before, '非法提交不应写入记录');
  const r = isOk(await speakSubmit({ transcript: 'a'.repeat(6000) }));
  assert.strictEqual(r.entry.transcript.length, 6000);
});

test('speaking: metrics 非对象、未知字段、越界、负数、非数字、计数非整数返回 400', async () => {
  const before = await speakingCount();
  for (const bad of [[], [1, 2], 'x', 5, true]) {
    isErr400(await speakSubmit({ metrics: bad }), `metrics=${JSON.stringify(bad)}`);
  }
  const cases = [
    { words: 10, score: 7 }, // 未知字段
    { words: -1 },
    { words: 20001 },
    { words: 1.5 }, // 计数必须是整数
    { wpm: -0.1 },
    { wpm: 601 },
    { wpm: '120' },
    { fillers: 5001 },
    { repeats: 2.5 },
    { longPauses: 2001 },
    { connectives: null },
    { connectives: [3] },
  ];
  for (const m of cases) isErr400(await speakSubmit({ metrics: m }), `metrics=${JSON.stringify(m)}`);
  assert.strictEqual(await speakingCount(), before, '非法提交不应写入记录');
});

test('speaking: metrics 含 Infinity（1e999）或 "__proto__" 键返回 400', async () => {
  const before = await speakingCount();
  const base = JSON.stringify({ itemId: ctx.s1.id, part: 1, durationSec: 30, selfScores: SP_SCORES, metrics: { words: '__X__' } });
  isErr400(await postRaw('/api/ielts/speaking/submit', base.replace('"__X__"', '1e999')), 'words=1e999');
  isErr400(await postRaw('/api/ielts/speaking/submit', base.replace('{"words":"__X__"}', '{"words":3,"__proto__":{"x":1}}')), '__proto__ 键');
  assert.strictEqual(await speakingCount(), before, '非法提交不应写入记录');
});

test('speaking: 文件里 transcript / metrics 不合法的记录被过滤，合法的保留', async () => {
  const before = await speakingCount();
  const t0 = Date.now() + 5000;
  const rec = (id, extra, i) => ({ id, itemId: ctx.s1.id, part: 1, band: 6, durationSec: 60, notes: '', ts: t0 + i, ...extra });
  patchTempIelts((j) => {
    j.speakings = (j.speakings || []).concat([
      rec('bad-tx-1', { transcript: 123 }, 1),
      rec('bad-tx-2', { transcript: 'x'.repeat(6001) }, 2),
      rec('bad-tx-3', { metrics: { words: -1 } }, 3),
      rec('bad-tx-4', { metrics: { words: 3, extra: 1 } }, 4),
      rec('bad-tx-5', { metrics: [1, 2] }, 5),
      rec('bad-tx-6', { metrics: { fillers: 1.5 } }, 6),
      rec('ok-tx-1', { transcript: 'fine', metrics: { words: 1, wpm: 60 } }, 7),
    ]);
  });
  try {
    const s = isOk(await get('/api/ielts/history?type=speaking&limit=500'));
    const ids = (Array.isArray(s) ? s : s.items).map((r) => r.id);
    assert.ok(!ids.some((id) => String(id).startsWith('bad-tx-')), `畸形记录不应返回：${ids.filter((id) => String(id).startsWith('bad-tx-'))}`);
    assert.ok(ids.includes('ok-tx-1'), '合法的带转写记录应保留');
    assert.strictEqual(await speakingCount(), before + 1, 'summary 只多算合法的那 1 条');
  } finally {
    patchTempIelts((j) => {
      j.speakings = (j.speakings || []).filter((r) => !/^(bad|ok)-tx-/.test(String(r.id)));
    });
  }
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

test('history: 畸形或越界的记录（如导入的备份）不返回、不参与均值', async () => {
  const before = isOk(await get('/api/ielts/summary'));
  patchTempIelts((j) => {
    j.writings = (j.writings || []).concat([
      { id: 'bad-1', promptId: 'w2-edu-01', task: 2, text: 'x', band: 99, ts: Date.now() + 1000 },
      { id: 'bad-2', promptId: 'w2-edu-01', task: 2, text: 123, band: 6, ts: Date.now() + 1001 },
    ]);
    j.speakings = (j.speakings || []).concat([{ id: 'bad-3', itemId: 's1-hometown', part: 1, band: 6, notes: { x: 1 }, ts: Date.now() + 1002 }]);
  });
  const w = isOk(await get('/api/ielts/history?type=writing&limit=500'));
  const ids = (Array.isArray(w) ? w : w.items).map((r) => r.id);
  assert.ok(!ids.includes('bad-1') && !ids.includes('bad-2'), '畸形写作记录不应返回');
  const s = isOk(await get('/api/ielts/history?type=speaking&limit=500'));
  assert.ok(!(Array.isArray(s) ? s : s.items).some((r) => r.id === 'bad-3'), '畸形口语记录不应返回');
  const after = isOk(await get('/api/ielts/summary'));
  assert.deepStrictEqual(after.writing, before.writing, 'summary 不受畸形记录影响');
  // 清掉注入的畸形记录，避免影响后续备份用例对原始文件条数的比较
  patchTempIelts((j) => {
    j.writings = (j.writings || []).filter((r) => !String(r.id).startsWith('bad-'));
    j.speakings = (j.speakings || []).filter((r) => !String(r.id).startsWith('bad-'));
  });
});

test('history: type 缺失或非法返回 400', async () => {
  isErr400(await get('/api/ielts/history'), '缺 type');
  // listening / reading 已是合法类型（见文末听力阅读用例），这里改用仍不支持的类型
  isErr400(await get('/api/ielts/history?type=vocab'), 'type=vocab');
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
// 听力 / 阅读成绩接入记录与总分估算
// =====================================================================
const officialRound = (x) => Math.floor(x * 2 + 0.5 + 1e-9) / 2; // 与 lib/ielts-plan.js 同口径
const itemsOf = (b) => (Array.isArray(b) ? b : b.items);
const titleOf = (it) => (it.titleCn ? `${it.title}（${it.titleCn}）` : it.title);

// 直接改写临时档案的四类记录；用例结束后原样还原，不影响其它用例
async function withPatchedRecords(patch, fn) {
  const keys = ['writings', 'speakings', 'listenings', 'readings'];
  let saved = null;
  patchTempIelts((j) => {
    saved = Object.fromEntries(keys.map((k) => [k, j[k]]));
    Object.assign(j, patch);
  });
  try {
    await fn();
  } finally {
    patchTempIelts((j) => {
      for (const k of keys) {
        if (saved[k] === undefined) delete j[k];
        else j[k] = saved[k];
      }
    });
  }
}

// 注入记录工厂（字段与 routes/ielts-listening.js、routes/ielts-reading.js 写入的结构一致）
const INJ_T0 = Date.now() - 86400000;
const lRec = (i, band, mode, extra) => ({
  id: `inj-l-${i}`, sectionId: ctx.lSection ? ctx.lSection.id : 'l1-sports-centre', part: 1, mode: mode || 'exam',
  raw: 5, total: 10, band, durationSec: 600, answers: {}, ts: INJ_T0 + i * 1000, ...extra,
});
const rRec = (i, band, mode, extra) => ({
  id: `inj-r-${i}`, passageId: ctx.rPassage ? ctx.rPassage.id : 'rd-green-roofs', mode: mode || 'exam',
  raw: 7, total: 13, band, durationSec: 1200, wrong: [], date: TODAY(), ts: INJ_T0 + i * 1000, ...extra,
});
const wRec = (i, band) => ({
  id: `inj-w-${i}`, promptId: ctx.w2 ? ctx.w2.id : 'w2-edu-01', task: 2, variant: null, text: 'x', wordCount: 1,
  durationSec: 0, selfScores: { TR: band, CC: band, LR: band, GRA: band }, band, ts: INJ_T0 + i * 1000,
});
const sRec = (i, band) => ({
  id: `inj-s-${i}`, itemId: ctx.s1 ? ctx.s1.id : 's1-hometown', part: 1, durationSec: 0,
  selfScores: { FC: band, LR: band, GRA: band, P: band }, band, notes: '', ts: INJ_T0 + i * 1000,
});

test('history: listening 交卷后倒序返回标题、模式、原始分、band、用时、错题数与错题', async () => {
  const list = isOk(await get('/api/ielts/listening'));
  assert.ok(list.items.length, '听力题库为空');
  const sec = list.items[0];
  ctx.lSection = sec;
  const detail = isOk(await get(`/api/ielts/listening/${sec.id}`));
  const firstNo = String(detail.groups[0].questions[0].no);
  const wrongInput = 'zzzz qqqq xxxx yyyy'; // 4 个词：填空题超字数、选择题不是选项字母，必错
  const r1 = isOk(await post(`/api/ielts/listening/${sec.id}/submit`, { answers: { [firstNo]: wrongInput }, durationSec: 321, mode: 'practice' }));
  const r2 = isOk(await post(`/api/ielts/listening/${sec.id}/submit`, { answers: {}, durationSec: 0, mode: 'exam' }));

  const h = isOk(await get('/api/ielts/history?type=listening&limit=10'));
  assert.strictEqual(h.type, 'listening');
  const items = itemsOf(h);
  assert.ok(items.length >= 2);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].ts >= items[i].ts, `第 ${i} 条顺序错误`);
  const [latest, prev] = items;
  assert.strictEqual(latest.id, r2.entry.id, '最新一次交卷排在最前');
  assert.strictEqual(prev.id, r1.entry.id);
  assert.strictEqual(prev.sectionId, sec.id);
  assert.strictEqual(prev.part, sec.part);
  assert.strictEqual(prev.title, titleOf(sec));
  assert.strictEqual(prev.mode, 'practice');
  assert.strictEqual(latest.mode, 'exam');
  assert.strictEqual(prev.raw, r1.raw);
  assert.strictEqual(prev.total, r1.total);
  assert.strictEqual(prev.band, r1.band);
  assert.strictEqual(prev.durationSec, 321);
  assert.strictEqual(prev.wrongCount, r1.total - r1.raw);
  assert.ok(Array.isArray(prev.wrongItems) && prev.wrongItems.length === prev.wrongCount, 'wrongItems 条数 = 错题数');
  const w = prev.wrongItems.find((x) => String(x.no) === firstNo);
  assert.ok(w, '答错的题应出现在错题里');
  assert.strictEqual(w.yours, wrongInput);
  for (const x of prev.wrongItems) {
    assert.ok(typeof x.prompt === 'string' && x.prompt, `第 ${x.no} 题缺 prompt`);
    assert.ok(Array.isArray(x.answer) && x.answer.length, `第 ${x.no} 题缺 answer`);
    assert.ok(typeof x.explanation === 'string' && x.explanation, `第 ${x.no} 题缺 explanation`);
  }
  // 白卷：全部是错题，未作答的 yours 为空串
  assert.strictEqual(latest.raw, 0);
  assert.strictEqual(latest.wrongItems.length, latest.total);
  assert.ok(latest.wrongItems.every((x) => x.yours === ''));
  assert.ok(!('answers' in prev), '不透传作答原文');
});

test('history: reading 交卷后返回标题、模式、原始分、band、用时、错题数与错题（含摘要填空题干）', async () => {
  const list = isOk(await get('/api/ielts/reading'));
  assert.ok(list.items.length, '阅读题库为空');
  const p = list.items[0];
  ctx.rPassage = p;
  const detail = isOk(await get(`/api/ielts/reading/${p.id}`));
  const q1 = detail.groups[0].questions[0].id;
  const r = isOk(await post(`/api/ielts/reading/${p.id}/submit`, { answers: { [q1]: 'zzzz' }, durationSec: 900, mode: 'exam' }));

  const it = itemsOf(isOk(await get('/api/ielts/history?type=reading&limit=5')))[0];
  assert.strictEqual(it.id, r.record.id);
  assert.strictEqual(it.passageId, p.id);
  assert.strictEqual(it.title, titleOf(p));
  assert.strictEqual(it.mode, 'exam');
  assert.strictEqual(it.raw, r.raw);
  assert.strictEqual(it.total, r.total);
  assert.strictEqual(it.band, r.band);
  assert.strictEqual(it.durationSec, 900);
  assert.strictEqual(it.wrongCount, r.total - r.raw);
  assert.ok(Array.isArray(it.wrongItems) && it.wrongItems.length === it.wrongCount, 'wrongItems 条数 = 错题数');
  for (let i = 1; i < it.wrongItems.length; i++) assert.ok(it.wrongItems[i - 1].no < it.wrongItems[i].no, '错题按题号升序');
  for (const x of it.wrongItems) {
    assert.ok(typeof x.prompt === 'string' && x.prompt && !/\{(blank|q\d+)\}/.test(x.prompt), `第 ${x.no} 题题干异常：${x.prompt}`);
    assert.ok(Array.isArray(x.answer) && x.answer.length, `第 ${x.no} 题缺 answer`);
    assert.ok(typeof x.explanation === 'string' && x.explanation, `第 ${x.no} 题缺 explanation`);
    assert.strictEqual(x.yours, null, '阅读记录不保存作答内容');
  }
});

// summary 四项的原有字段（last3Avg / count / practiceCount）；basis、fullCount、stale、label 另行断言
function summaryCore(x) {
  const out = { last3Avg: x.last3Avg, count: x.count };
  if ('practiceCount' in x) out.practiceCount = x.practiceCount;
  return out;
}

test('summary: 听力 / 阅读只算模考近 3 次；四项齐全时四项平均后 .25 进到 .5', async () => {
  await withPatchedRecords({
    // 听力模考 4 次取最近 3 次 (5.5 + 6 + 6.5) / 3 = 6；练习 2 次分数再高也不计
    listenings: [lRec(1, 9), lRec(2, 5.5), lRec(3, 6), lRec(4, 6.5), lRec(5, 9, 'practice'), lRec(6, 8.5, 'practice')],
    readings: [rRec(1, 6.5), rRec(2, 6.5), rRec(3, 6.5), rRec(4, 3, 'practice')],
    writings: [wRec(1, 6), wRec(2, 6), wRec(3, 6)],
    speakings: [sRec(1, 6.5), sRec(2, 6.5), sRec(3, 6.5)],
  }, async () => {
    const s = isOk(await get('/api/ielts/summary'));
    assert.deepStrictEqual(summaryCore(s.listening), { last3Avg: 6, count: 4, practiceCount: 2 });
    assert.deepStrictEqual(summaryCore(s.reading), { last3Avg: 6.5, count: 3, practiceCount: 1 });
    assert.deepStrictEqual(summaryCore(s.writing), { last3Avg: 6, count: 3 });
    assert.deepStrictEqual(summaryCore(s.speaking), { last3Avg: 6.5, count: 3 });
    // 没有模考和剑雅成绩：四项都按单项口径，label 写明次数
    for (const k of ['listening', 'reading', 'writing', 'speaking']) {
      assert.strictEqual(s[k].basis, 'single', `${k}.basis`);
      assert.strictEqual(s[k].fullCount, 0, `${k}.fullCount`);
      assert.strictEqual(s[k].stale, false, `${k}.stale`);
    }
    assert.strictEqual(s.listening.label, '近 3 次单项考试均分 · 考试模式 4 次 · 练习 2 次');
    assert.strictEqual(s.writing.label, '近 3 次自评均分 · 共 3 篇');
    assert.deepStrictEqual(s.estimate.bySkill, { listening: 6, reading: 6.5, writing: 6, speaking: 6.5 });
    assert.strictEqual(s.estimate.overall, 6.5, '(6 + 6.5 + 6 + 6.5) / 4 = 6.25 → 6.5');
    assert.ok(!s.estimate.note.includes('缺'), `四项齐全时 note 不应提示缺项：${s.estimate.note}`);
    assert.ok(s.estimate.note.includes('偏乐观') && s.estimate.note.includes('剑雅模考'), s.estimate.note);
  });
});

test('summary: 四项平均 .75 进到整数、.125 舍到整数，与 officialRound 一致', async () => {
  const cases = [
    { l: [7, 7, 7], r: [7], w: 6.5, s: 6.5, expect: 7 }, // 6.75 → 7
    { l: [6, 6, 6], r: [6], w: 6, s: 6.5, expect: 6 }, // 6.125 → 6
    { l: [5, 5.5, 6], r: [6, 6.5], w: 6, s: 6, expect: officialRound((5.5 + 6.25 + 6 + 6) / 4) }, // 5.9375 → 6
  ];
  for (const c of cases) {
    await withPatchedRecords({
      listenings: c.l.map((b, i) => lRec(i + 1, b)),
      readings: c.r.map((b, i) => rRec(i + 1, b)),
      writings: [wRec(1, c.w)],
      speakings: [sRec(1, c.s)],
    }, async () => {
      const e = isOk(await get('/api/ielts/summary')).estimate;
      const vals = Object.values(e.bySkill);
      assert.ok(vals.every((v) => typeof v === 'number'), `bySkill 应四项齐全：${JSON.stringify(e.bySkill)}`);
      assert.strictEqual(e.overall, c.expect, `bySkill=${JSON.stringify(e.bySkill)}`);
      assert.strictEqual(e.overall, officialRound(vals.reduce((a, b) => a + b, 0) / 4));
    });
  }
});

test('summary: 缺项时用已有几项粗估，note 写明缺哪几项；全无数据时 overall 为 null', async () => {
  // 听力 / 阅读只有练习：不计入，按写作、口语粗估
  await withPatchedRecords({
    listenings: [lRec(1, 8, 'practice')],
    readings: [rRec(1, 8, 'practice')],
    writings: [wRec(1, 6)],
    speakings: [sRec(1, 6.5)],
  }, async () => {
    const s = isOk(await get('/api/ielts/summary'));
    assert.deepStrictEqual(summaryCore(s.listening), { last3Avg: null, count: 0, practiceCount: 1 });
    assert.deepStrictEqual(summaryCore(s.reading), { last3Avg: null, count: 0, practiceCount: 1 });
    assert.strictEqual(s.listening.basis, null);
    assert.strictEqual(s.listening.label, '还没有考试成绩（练习 1 次不计分）');
    assert.deepStrictEqual(s.estimate.bySkill, { listening: null, reading: null, writing: 6, speaking: 6.5 });
    assert.strictEqual(s.estimate.overall, 6.5, '(6 + 6.5) / 2 = 6.25 → 6.5');
    assert.ok(s.estimate.note.includes('缺听力、阅读'), s.estimate.note);
  });
  // 只有听力、阅读模考
  await withPatchedRecords({
    listenings: [lRec(1, 5.5)],
    readings: [rRec(1, 6)],
    writings: [],
    speakings: [],
  }, async () => {
    const e = isOk(await get('/api/ielts/summary')).estimate;
    assert.deepStrictEqual(e.bySkill, { listening: 5.5, reading: 6, writing: null, speaking: null });
    assert.strictEqual(e.overall, 6, '(5.5 + 6) / 2 = 5.75 → 6');
    assert.ok(e.note.includes('缺写作、口语'), e.note);
    assert.ok(!e.note.includes('偏乐观'), '没有自评项时不提自评偏乐观');
  });
  // 一项都没有
  await withPatchedRecords({ listenings: [], readings: [], writings: [], speakings: [] }, async () => {
    const e = isOk(await get('/api/ielts/summary')).estimate;
    assert.strictEqual(e.overall, null);
    assert.deepStrictEqual(e.bySkill, { listening: null, reading: null, writing: null, speaking: null });
    assert.ok(typeof e.note === 'string' && e.note);
  });
});

test('history / summary: 畸形的听力 / 阅读记录被过滤，不返回、不参与均分', async () => {
  const badL = [
    lRec(11, 7.3), // band 不是 0.5 步长
    lRec(12, 10), // band 超过 9
    lRec(13, 6, 'mock'), // mode 非法
    lRec(14, 6, 'exam', { raw: 11 }), // raw 超过 total
    lRec(15, 6, 'exam', { ts: 'yesterday' }),
    lRec(16, 6, 'exam', { sectionId: '../etc' }),
    'not-an-object',
    null,
    [1, 2],
  ];
  const badR = [
    rRec(11, 6, 'exam', { id: 'bad id!' }),
    rRec(12, 6, 'exam', { wrong: [1, 2] }),
    rRec(13, 6, 'exam', { total: 0, raw: 0 }),
    rRec(14, 6, 'exam', { durationSec: -5 }),
    rRec(15, 6.25),
    rRec(16, 6, 'exam', { passageId: 'Bad_ID' }),
    42,
  ];
  await withPatchedRecords({
    listenings: [lRec(1, 6.5), ...badL],
    readings: [rRec(1, 5.5), ...badR],
    writings: [],
    speakings: [],
  }, async () => {
    const hl = isOk(await get('/api/ielts/history?type=listening&limit=500'));
    assert.strictEqual(hl.total, 1, `听力只应剩 1 条合法记录：${JSON.stringify(itemsOf(hl).map((x) => x.id))}`);
    assert.deepStrictEqual(itemsOf(hl).map((x) => x.id), ['inj-l-1']);
    const hr = isOk(await get('/api/ielts/history?type=reading&limit=500'));
    assert.strictEqual(hr.total, 1, `阅读只应剩 1 条合法记录：${JSON.stringify(itemsOf(hr).map((x) => x.id))}`);
    assert.deepStrictEqual(itemsOf(hr).map((x) => x.id), ['inj-r-1']);
    const s = isOk(await get('/api/ielts/summary'));
    assert.deepStrictEqual(summaryCore(s.listening), { last3Avg: 6.5, count: 1, practiceCount: 0 });
    assert.deepStrictEqual(summaryCore(s.reading), { last3Avg: 5.5, count: 1, practiceCount: 0 });
    assert.strictEqual(s.estimate.overall, 6, '(6.5 + 5.5) / 2 = 6');
  });
});

test('history: 题目已不在题库或记录与题库对不上时仍返回记录，title 为空、wrongItems 为 null', async () => {
  await withPatchedRecords({
    listenings: [
      lRec(1, 5, 'exam', { sectionId: 'l9-no-such-section' }),
      lRec(2, 5, 'exam', { durationSec: -1 }), // 模块校验不管 durationSec：记录保留，用时按未记录处理
    ],
    readings: [
      rRec(1, 5, 'exam', { passageId: 'rd-no-such-passage' }),
      rRec(2, 5, 'exam', { raw: 12, wrong: ['q999'] }), // 错题 id 不在本篇
    ],
  }, async () => {
    const l = itemsOf(isOk(await get('/api/ielts/history?type=listening')));
    const gone = l.find((x) => x.id === 'inj-l-1');
    assert.ok(gone, '题目不在题库的记录仍应返回');
    assert.strictEqual(gone.title, '');
    assert.strictEqual(gone.wrongItems, null);
    assert.strictEqual(gone.wrongCount, 5);
    const noDur = l.find((x) => x.id === 'inj-l-2');
    assert.strictEqual(noDur.durationSec, null);
    // 注入的 answers 为空，重判得 0 分与记录的 5 分不一致 → 无法还原错题
    assert.strictEqual(noDur.wrongItems, null);

    const r = itemsOf(isOk(await get('/api/ielts/history?type=reading')));
    const rGone = r.find((x) => x.id === 'inj-r-1');
    assert.strictEqual(rGone.title, '');
    assert.strictEqual(rGone.wrongItems, null);
    const mismatch = r.find((x) => x.id === 'inj-r-2');
    assert.ok(mismatch.title, '文章还在，标题照常返回');
    assert.strictEqual(mismatch.wrongItems, null);
  });
});

// =====================================================================
// 间隔复习：雅思阅读 / 听力错题自动入队（lib/ielts-srs.js）
// 正确答案取自 lib/ielts-reading.js、lib/ielts-listening.js 读到的同一份内容（接口交卷前不下发答案）
// =====================================================================
const srsDueIds = async (prefix) => {
  const d = isOk(await get('/api/srs/due?limit=500'), 'srs/due');
  return d.questions.filter((q) => q.id.startsWith(prefix));
};

test('srs: 阅读交卷故意答错 2 题 → 间隔复习出现这 2 题且不含答案，作答后重排、再交卷不重复入队', async () => {
  const R = require('../lib/ielts-reading');
  const list = isOk(await get('/api/ielts/reading'));
  // 用最后一篇，避开前面用例已交卷（错题已入队）的第一篇，保证本用例的入队计数独立
  const pid = list.items[list.items.length - 1].id;
  assert.deepStrictEqual(await srsDueIds(`ir:${pid}:`), [], '本篇此前不应有复习题');
  const qs = [];
  for (const g of R.getPassage(pid).groups) for (const q of g.questions) qs.push(q);
  const wrong = qs.slice(0, 2).map((q) => q.id);
  const answers = Object.fromEntries(qs.map((q) => [q.id, wrong.includes(q.id) ? 'zzz wrong' : q.answer[0]]));
  const totalBefore = isOk(await get('/api/srs/stats')).total;

  const r = isOk(await post(`/api/ielts/reading/${pid}/submit`, { answers, mode: 'exam', durationSec: 600 }));
  assert.strictEqual(r.raw, r.total - 2, `raw=${r.raw} total=${r.total}`);
  const due = await srsDueIds(`ir:${pid}:`);
  assert.deepStrictEqual(due.map((q) => q.id).sort(), wrong.map((id) => `ir:${pid}:${id}`).sort());
  for (const q of due) {
    assert.strictEqual(q.kind, 'ielts-reading');
    assert.ok(q.ielts && Array.isArray(q.ielts.paragraphs) && q.ielts.paragraphs.length, '带所在段落原文');
    assert.ok(!('answer' in q) && !('explanation' in q) && !('evidence' in q), '复习题不含答案');
  }
  assert.strictEqual(isOk(await get('/api/srs/stats')).total, totalBefore + 2);

  const t0 = Date.now();
  const right = isOk(await post('/api/srs/grade', { id: `ir:${pid}:${wrong[0]}`, response: qs[0].answer[0] }));
  assert.strictEqual(right.correct, true);
  assert.ok(right.nextDueAt >= t0 + 86400000, '答对后至少 1 天后再复习');
  assert.ok(typeof right.explanation === 'string' && right.explanation, '答完给解析');
  const miss = isOk(await post('/api/srs/grade', { id: `ir:${pid}:${wrong[1]}`, response: 'zzz wrong' }));
  assert.strictEqual(miss.correct, false);
  assert.deepStrictEqual(miss.answer, qs[1].answer);
  assert.ok(miss.nextDueAt > t0 && miss.nextDueAt <= Date.now() + 600000, '答错约 10 分钟后重来');
  assert.deepStrictEqual(await srsDueIds(`ir:${pid}:`), [], '两题都已重排出当前到期列表');

  isOk(await post(`/api/ielts/reading/${pid}/submit`, { answers, mode: 'exam', durationSec: 600 }));
  assert.strictEqual(isOk(await get('/api/srs/stats')).total, totalBefore + 2, '已在队列的题不重复加入');
});

test('srs: 听力交卷答错的题进入间隔复习（未作答的不进），复习按原模块规则判分', async () => {
  const L = require('../lib/ielts-listening');
  const list = isOk(await get('/api/ielts/listening'));
  // 用最后一个 section，避开前面用例已交卷的第一个
  const sid = list.items[list.items.length - 1].id;
  assert.deepStrictEqual(await srsDueIds(`il:${sid}:`), [], '本 section 此前不应有复习题');
  const qs = [];
  for (const g of L.getSection(sid).groups) for (const q of g.questions) qs.push(q);
  const wrong = [qs[0].no, qs[1].no];
  const blank = qs[2].no;
  const answers = {};
  for (const q of qs) {
    if (q.no === blank) continue;
    answers[String(q.no)] = wrong.includes(q.no) ? 'zzz' : q.answer[0];
  }
  const r = isOk(await post(`/api/ielts/listening/${sid}/submit`, { answers, mode: 'practice', durationSec: 300 }));
  assert.strictEqual(r.raw, r.total - 3);
  const due = await srsDueIds(`il:${sid}:`);
  assert.deepStrictEqual(due.map((q) => q.id).sort(), wrong.map((n) => `il:${sid}:${n}`).sort());
  for (const q of due) {
    assert.strictEqual(q.kind, 'ielts-listening');
    assert.ok(q.ielts && q.ielts.script && q.ielts.script.text, '带对应 segment 脚本');
  }
  // 大小写与首尾空格不计较（与原模块一致）
  const g = isOk(await post('/api/srs/grade', { id: `il:${sid}:${wrong[0]}`, response: `  ${qs[0].answer[0].toUpperCase()} ` }));
  assert.strictEqual(g.correct, true);
});

test('srs: 雅思复习题作答不是字符串返回 400，不存在的题返回 404', async () => {
  const list = isOk(await get('/api/ielts/reading'));
  const id = `ir:${list.items[0].id}:q1`;
  isErr400(await post('/api/srs/grade', { id, response: 123 }), 'response 非字符串');
  isErr400(await post('/api/srs/grade', { id, response: 'x'.repeat(201) }), 'response 超长');
  isErr4xx(await post('/api/srs/grade', { id: 'ir:no-such-passage:q1', response: 'TRUE' }), '不存在的题');
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
