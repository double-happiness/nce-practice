# 雅思全真模考技术方案（2026-11-25）

> 雅思备考二期：新增「🏁 模考」子页。按考试顺序连做听力 → 阅读 → 写作 → 口语，限时进行，最后出四项分数和总分。
> 系统只给本人自学用，不考虑多用户。复用听力（`lib/ielts-listening.js`）、阅读（`lib/ielts-reading.js`）的判分与 band 换算，
> 写作、口语沿用四维自评和 D5 取整（`lib/ielts-plan.js` 的 `floorHalf` / `officialRound`）。

## 1. 目标与非目标

**目标**
1. 一键组卷：听力 4 个 section（Part 1–4 各 1）、阅读 3 篇（尽量易 / 中 / 难各 1）、写作 Task 1（按档案 examType）+ Task 2、口语 Part 1 话题 + Part 2 题卡及其 Part 3 追问；优先抽最近没做过的内容。
2. 按考试顺序限时进行，每部分提交保存后才能进入下一部分；允许中途离开，回来从当前部分继续。
3. 正在计时的部分被中断，只能「重新开始本部分」或「放弃本部分」，保证计时完整。
4. 出分：四项 band + 总分（官方取整），和上一次模考对比；听力、阅读可逐题看错题。
5. 每部分的作答同时写进 `listenings` / `readings` / `writings` / `speakings`，现有记录和统计也能看到。

**非目标**：真人录音或音频文件；语音识别转写（口语模考只录音回听，不做实时转写）；纸笔考试的 10 分钟誊写时间；按考试日自动安排模考；把模考成绩接入 `/ielts/summary`（另有 agent 在改，见 §9）。

## 2. 组卷

| 部分 | 抽题规则 | 内容来源 |
|---|---|---|
| 听力 | Part 1、2、3、4 各抽 1 个 section，按 Part 顺序排列 | `listening.getSections()`（已过滤数据有误的 section） |
| 阅读 | 易、中、难各抽 1 篇；某个难度没有可用文章时，从其余文章补足 3 篇；按易 → 中 → 难排列 | `reading.getContent().byId` 中 `validateReadingContent` 零 error 的文章 |
| 写作 | Task 1：档案 `examType` 为 A 时从 A 类图表题（bar / line / pie / table / process / map）抽，G 时从书信抽；Task 2 任抽 1 道 | `ielts.getWritingList()` |
| 口语 | Part 1 话题 1 个（questions 非空）；Part 2 题卡 1 张（有 cueCard），Part 3 用这张题卡自带的 `part3` | `ielts.getSpeakingList()` |

**最近没做过优先**（`pickLeastRecent`）：对每类内容按 id 统计「最近一次使用时间」，来源为
`listenings[].sectionId`、`readings[].passageId`、`writings[].promptId`、`speakings[].itemId` 的 `ts`，以及历次模考（含进行中、已放弃）`paper` 里的全部 id（时间取模考 `createdAt`）。
候选先随机打乱，再按最近使用时间升序稳定排序（从没用过记 0），取第一个：从没做过的里随机挑；全部做过之后，挑最久没做的（允许重复）。

题库不足（某个 Part 没有听力 section、阅读不足 3 篇、写作或口语某类为空）时，`start` 返回 500 `{ error }` 并说明缺哪类。

## 3. 流程与计时

总顺序：听力 → 阅读 → 写作 → 口语。服务端只允许操作「当前部分」（第一个状态为 `pending` / `running` 的部分）。

| 部分 | 流程 | 计时 |
|---|---|---|
| 听力 | 考试模式：每个 Part 先由旁白读开场（`intro`）→ 每组题前 30 秒读题 → 本组音频只播一次 → 下一组前旁白提示再读题 → Part 结束提示 → 4 个 Part 播完后 **2 分钟检查** → 自动交卷 | 由音频驱动，约 25–30 分钟（取决于朗读速度）；语速固定 1.0 |
| 阅读 | 3 篇用标签切换（宽屏左文右题），题号按真实考试连续编号（1–13、14–26、27–39） | **60 分钟**共用一个倒计时；剩 10 分钟变橙；到 0 自动交卷 |
| 写作 | Task 1 / Task 2 用标签切换，实时字数；时间到或点「结束写作」后进入两篇的四维自评 | **60 分钟**两题共用；界面提示「建议 Task 1 用 20 分钟、Task 2 用 40 分钟」，并分别显示两题已用时间 |
| 口语 | Part 1 逐题作答 → Part 2 准备 60 秒（到时自动开始作答）→ 作答 120 秒（到时只提示）→ Part 3 逐题作答 → 回听录音 + 四维自评 | 与口语模块一致：Part 1 / 3 正计时，Part 2 倒计时；录音只存在浏览器内存（D4） |

**TTS**：复用听力子页导出的 `NCE.ielts.listeningTts`（声音检测、按性别分配声音、分块朗读与看门狗）。浏览器不支持语音合成或没有英文声音时，听力部分无法进行，页面只提供「重新检测」和「放弃听力部分」。

**中断与续做**

- 「开始本部分」= `begin`，服务端把该部分置为 `running` 并记 `startedAt`。
- 中断：切到别的子页（`leave`）、切到别的标签（`pause`）、刷新或关闭页面；听力另外在 `document.visibilitychange` 变为隐藏时中断（与听力模块一致，朗读会被打断）。中断时立即停止朗读、清所有定时器、释放麦克风。
- 回到模考页时，服务端显示该部分仍为 `running`，但页面内已没有对应的进行中会话 → 只给两个按钮：
  - 「重新开始本部分」：再次 `begin`，计时从头开始，已作答内容清空（服务端 `restarts + 1`）；
  - 「放弃本部分」：`abandon`，该部分记为 `skipped`，不出分。
- 不计时、内容已冻结的阶段可以直接续做，不算中断：
  - 写作已结束（时间到或主动结束）、正在自评：作文与用时在结束时冻结到 localStorage（key `nce-ielts-mock-frozen:<模考 id>`，按档案加前缀），回来直接继续自评；
  - 口语全部答完、正在自评：答题用时冻结到 localStorage，回来继续自评（录音若已随页面刷新释放，会提示「录音已释放」）；
  - 听力音频已播完、处在检查时间：同一次页面会话内回来停在「检查时间（已暂停）」，手动交卷。
- 整套放弃：`finish` 带 `{ abandon: true }`，状态变为 `abandoned`，不出分、不参与对比。

**同一时间只有一套进行中的模考**：已有进行中的模考时 `start` 返回 409 `{ error, activeId }`；带 `{ replaceActive: true }` 时把旧的一套标为 `abandoned` 再组新卷。

## 4. 算分

| 项 | 规则 |
|---|---|
| 听力 | 4 个 section 原始分相加（满分 40），`listening.estimateBand(raw, total)`：按比例折算到 40 题后查听力换算表（总题数正好 40 时不缩放） |
| 阅读 | 3 篇原始分相加（共 39 题），`reading.estimateBand(raw, total)`：`round(raw / 39 × 40)` 后查学术类阅读换算表 |
| 写作 | 每篇四维自评 → 该篇 band = `floorHalf(四维平均)`（与写作模块一致）；最终 = `floorHalf((Task 1 + 2 × Task 2) / 3)`（Task 2 权重是 Task 1 的两倍）。某篇没写（正文为空）记 0 分且不用自评 |
| 口语 | 四维自评一次，`floorHalf(四维平均)`（沿用口语模块） |
| 总分 | 四项都有分时：`officialRound(四项平均)`，即 .25 进为 .5、.75 进为整数；有任一部分被放弃时不出总分（`overall: null`，`complete: false`） |

示例：写作 Task 1 = 6.0、Task 2 = 7.0 → (6 + 14) / 3 = 6.67 → 6.5；四项 6.5 / 6.5 / 6.0 / 6.0 → 6.25 → 6.5。

**对比**：取本套之前最近一次 `finished` 的模考，四项和总分分别给出差值（两边都有分时才比）。
**说明**：听力、阅读 band 是近似换算；写作、口语是自评，偏乐观时向下取整。结果页显示这段说明（`bandNote`）。

## 5. 接口（`routes/ielts-mock.js`，自动挂载到 `/api`）

所有接口错误返回 JSON `{ error }`：参数非法 400；`:id` 格式非法 400、不存在 404；已有进行中模考时 `start` 返回 409；题库不足 500。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/ielts/mock/start` | body `{}` 或 `{ replaceActive: true }` → `{ ok, mock: 视图 }`；视图里 `paper` 即题目 id 清单 |
| GET | `/ielts/mock/:id` | 模考视图（见下） |
| POST | `/ielts/mock/:id/section` | body `{ section, action, ... }`，`action` 为 `begin` / `submit` / `abandon` → `{ ok, mock: 视图 }` |
| POST | `/ielts/mock/:id/finish` | body `{}` 出分（四部分都已 `done` / `skipped`）；`{ abandon: true }` 放弃整套 → `{ ok, mock: 视图 }` |
| GET | `/ielts/mocks?limit=` | `{ total, activeId, items: [摘要] }`，新的在前；`limit` 1–50，默认 50 |

**`section` 请求体**（只接受列出的键，多余的键 400）

| section | action | 其余字段 |
|---|---|---|
| 任意 | `begin` / `abandon` | 无 |
| `listening` | `submit` | `answers: { [sectionId]: { "题号": string \| null } }`（键只能是本套听力的 section id，值按听力模块 `parseAnswers` 校验，单题 ≤ 100 字符）；`durationSec`（可省略，0–7200 整数） |
| `reading` | `submit` | `answers: { [passageId]: { [qid]: string \| null } }`（键只能是本套文章 id 和该篇题号，单题 ≤ 200 字符，可以全空）；`durationSec`（0–14400） |
| `writing` | `submit` | `task1`、`task2`：`{ text, selfScores?, durationSec? }`（`text` ≤ 20000 字符；正文非空时 `selfScores` 必填，Task 1 为 TA/CC/LR/GRA、Task 2 为 TR/CC/LR/GRA，每项 0–9、步长 0.5；正文为空时不能带 `selfScores`）；`durationSec`（0–14400） |
| `speaking` | `submit` | `selfScores`（FC/LR/GRA/P）必填；`notes`（可选，≤ 2000 字符）；`durationSec`（0–3600） |

状态校验：模考不是 `in-progress`、`section` 不是当前部分、`submit` 前没有 `begin`、对已完成的部分再操作，一律 400 并说明原因。

**模考视图**

```jsonc
{ "id": "uuid", "status": "in-progress", "examType": "A",
  "createdAt": 0, "updatedAt": 0, "finishedAt": null, "serverNow": 0,
  "paper": { "listening": ["l1-…", "l2-…", "l3-…", "l4-…"], "reading": ["rd-…", "rd-…", "rd-…"],
             "writing": { "task1": "w1a-…", "task2": "w2-…" }, "speaking": { "part1": "s1-…", "part2": "s2-…" } },
  "current": "reading",                       // 当前部分；全部 done / skipped 时为 null
  "limits": { "reading": 3600, "writing": 3600 },
  "sections": { "listening": { "state": "done", "startedAt": 0, "submittedAt": 0, "restarts": 0, "durationSec": 1700 }, … },
  // 以下只在 finished 时给出（进行中不透露分数，和真实考试一样最后统一出分）
  "result": { "listening": 7.0, "reading": 6.5, "writing": 6.0, "speaking": 6.0, "overall": 6.5, "complete": true },
  "scores": { "listening": { "raw": 30, "total": 40 }, "reading": { "raw": 28, "total": 39, "scaled40": 29 },
              "writing": { "task1": { "band": 6, "wordCount": 172 }, "task2": { "band": 6, "wordCount": 268 } },
              "speaking": { "selfScores": { "FC": 6, "LR": 6, "GRA": 5.5, "P": 6.5 } } },
  "review": { "listening": [ { "sectionId", "part", "title", "raw", "total", "wrong": [ { "no", "prompt", "yours", "yoursText", "answer", "answerText", "overLimit", "explanation" } ] } ],
              "reading":   [ { "passageId", "title", "difficulty", "offset", "raw", "total", "wrong": [ { "number", "displayNo", "prompt", "yours", "answer", "answerText", "overLimit", "explanation", "evidence" } ] } ],
              "writing":   { "task1": { "promptId", "prompt", "variant", "band", "wordCount", "recordId" }, "task2": { … } } },
  "compare": { "previous": { "id", "finishedAt", "result" }, "deltas": { "listening": 0.5, "reading": -0.5, "writing": 0, "speaking": null, "overall": 0 } } | null,
  "bandNote": "…" }
```

错题由服务端用保存的作答重新判分得出（答案、解析只在 `finished` 后下发）。

## 6. 用户数据（`data/profiles/<id>/ielts.json` 的 `mocks` 数组）

```jsonc
{ "mocks": [
  { "id": "uuid", "status": "in-progress",          // in-progress | finished | abandoned
    "examType": "A", "createdAt": 0, "updatedAt": 0, "finishedAt": null,
    "paper": { …同视图… },
    "sections": {
      "listening": { "state": "done", "startedAt": 0, "submittedAt": 0, "restarts": 0, "durationSec": 1700,
                     "raw": 30, "total": 40, "raw40": 30, "band": 7,
                     "parts": [ { "sectionId": "l1-…", "raw": 8, "total": 10 } ],
                     "answers": { "l1-…": { "1": "Brennan" } }, "recordIds": ["uuid", …] },
      "reading":   { "state": "running", "startedAt": 0, "submittedAt": null, "restarts": 1 },
      "writing":   { "state": "pending", "startedAt": null, "submittedAt": null, "restarts": 0 },
      "speaking":  { "state": "pending", … } },
    "result": null } ] }
```
- `reading` 完成后另有 `raw / total / scaled40 / band / parts / answers / recordIds`；`writing` 有 `band / tasks: { task1: { promptId, wordCount, band, selfScores \| null }, task2 } / recordIds`；`speaking` 有 `band / selfScores / recordIds`。
- 读写走 `lib/ielts.js` 的 `loadUser` / `saveUser`（`loadUser` 保留未知顶层字段）；本模块读取时自行校验（`sanitizeMocks`），结构不合法的记录丢弃；最多保留最近 **50** 条。
- **同步写入各模块记录**（都带 `mockId`，各模块的清洗函数只做过滤，会保留这个字段）：
  - `listenings`：每个 section 一条，`mode: "exam"`，`durationSec` 为听力总用时按 section 数均分；
  - `readings`：每篇一条，`mode: "exam"`，`wrong` 为错题 id，`durationSec` 按篇数均分；
  - `writings`：每篇有正文的写一条（空篇不写），`durationSec` 用前端上报的单篇用时，缺省按 1 : 2 拆分总用时；
  - `speakings`：一条，`itemId` 为 Part 2 题卡、`part: 2`（与口语模块「Part 2 + 3 作为一次练习」一致），`notes` 以「[模考] Part 1：话题」开头。
- **学习活动**：出分（`finish`，至少一部分完成）后记一次 `activity.record(complete, 'ielts-mock')`，用 try/catch 包住，失败只打日志。一套模考只记 1 次，便于计划按「套」统计。
- `ielts.json` 已在备份范围内，无需额外接入。

## 7. 前端（`public/js/ielts-mock-ui.js`）

注册：`NCE.ielts.registerPage('mock', { meta: { label: '模考', icon: '🏁', before: 'history' }, render, resume, pause, leave })`；`index.html` 在 `ielts-reading-ui.js` 之后加一行 script。

| 页面 | 内容 |
|---|---|
| 首页 | 模考说明（顺序、时长、算分）；进行中的一套（「继续模考」）；「开始新模考」；历次模考列表（四项 + 总分，点开看结果） |
| 总览 | 四部分进度条与状态；当前部分说明和「开始」按钮；听力前检测 TTS；被中断时只显示「重新开始本部分」「放弃本部分」；「放弃整套模考」（需再点一次确认） |
| 听力 / 阅读 / 写作 / 口语 | 见 §3；题目渲染在本文件内实现（精简版），听力朗读复用 `NCE.ielts.listeningTts` |
| 结果 | 总分 + 四项（听力、阅读带原始分），与上一次模考对比（↑↓），各部分错题（展开查看你的答案、正确答案、解析、原文），写作两篇的分数与加权算式，跳转听力 / 阅读 / 记录子页 |

**复用**：`ielts-listening-ui.js` 末尾导出 `NCE.ielts.listeningTts = { detect, castVoices, speak, stop, voiceLabel, errorText, GAP_SAME_MS, GAP_SWITCH_MS }`，只是把已有函数挂出去，不改听力页行为。写作图表用 `NCE.ielts.chart.mount`，自评用壳层的 `rubricDims` / `mountScoreForm`。阅读、听力的题目渲染和口语录音在模考页内单独实现（原页面的渲染函数读写各自模块的内部状态，抽出来改动太大）。

**生命周期**：`leave()` / `pause()` / 页面隐藏（仅听力）时停止朗读（`listeningTts.stop()` + `speechSynthesis.cancel()`）、清空全部定时器、停掉麦克风音轨；`leave()` 后录音 blob URL 只在自评阶段保留，其余情况一并释放。所有动态内容经 `NCE.escapeHtml` 转义，属性一律双引号；颜色用主题变量。

## 8. 文件清单

| 文件 | 说明 |
|---|---|
| `docs/design/ielts-mock-20261125.md` | 本文 |
| `lib/ielts-mock.js` | 组卷、提交校验与判分、写作加权与总分、状态机、记录清洗、视图与错题复盘 |
| `routes/ielts-mock.js` | 5 个接口 |
| `public/js/ielts-mock-ui.js` | 模考子页 |
| `public/js/ielts-listening-ui.js` | 末尾导出 `NCE.ielts.listeningTts`（单独 refactor 提交） |
| `public/index.html` | 只加一行 `<script src="js/ielts-mock-ui.js"></script>` |
| `scripts/test-ielts-mock.js` | 组卷、算分、写作加权、总分取整、中断续做、接口校验测试 |

## 9. 需要协调方接入（本线不改这些文件）

1. `package.json`：`"test:ielts-mock": "node scripts/test-ielts-mock.js"`。
2. `scripts/validate.js`：`IELTS_PLAN_SOURCES` 加 `ielts-mock`，`IELTS_PLAN_TABS` 加 `ielts:mock`（之后 `plan.json` 才能引用）。模考没有自己的内容文件，不需要新增内容校验。
3. `routes/plan.js`：`SOURCE_LABEL` 加 `'ielts-mock': '雅思模考'`；不建议并入听 / 说 / 读 / 写任一技能（一套模考只记 1 次活动）。
4. `data/ielts/plan.json`：冲刺期 W21–25 可在外部「剑雅全套模考」之外加
   `{"key":"ielts-mock","label":"站内全真模考 1 套（听 → 读 → 写 → 说，限时连做）","kind":"internal","source":["ielts-mock"],"target":1,"unit":"套","per":"week","tab":"ielts:mock","minutes":180}`；专项期后段（W17–20）可每两周 1 套。
5. `public/sw.js`：`PRECACHE_URLS` 加 `'/js/ielts-mock-ui.js'`，`SW_VERSION` +1。
6. 可选：`/ielts/summary` 接入最近一次模考的四项分数（`mocks` 中最新的 `finished`），取代仅按写作、口语自评的粗估。

## 10. 任务

- T1 设计文档与数据结构（本文）
  - [x] 已实现 2026-11-25
- T2 `lib/ielts-mock.js` + `routes/ielts-mock.js`
  - [x] 已实现 2026-11-25
- T3 `public/js/ielts-mock-ui.js` + `index.html` 一行 script（含 `ielts-listening-ui.js` 导出 TTS）
  - [x] 已实现 2026-11-25
- T4 `scripts/test-ielts-mock.js`
  - [x] 已实现 2026-11-25
