# 雅思备考 MVP 技术方案（2026-11-24）

> 本文是 5 条并行工作线的**共同契约**：内容 schema、API、文件归属以白名单为准，任何一条线不得改动其他线的文件。

## 1. 目标与非目标

**用户**：本人，起点 **A2**，目标 **雅思 7.0+**，备考 **26 周**（默认考试日 2027-05-24，可改），默认 **A 类**，可切换 G 类。

**目标（MVP）**
1. 备考档案 + 倒计时 + 26 周三阶段计划，每日任务深链到现有功能，外部资料任务可手动打勾
2. 学习计划新增「雅思」强度预设；雅思写作、口语、词汇练习计入今日目标
3. 水平页 CEFR 补齐 B2/C1/C2，并粗估雅思分数
4. 雅思词汇（约 720 词）接入现有背单词、查词典、间隔复习，另加「雅思词汇诊断」
5. 写作题库（Task 2 / Task 1 A 类图表 / Task 1 G 类书信）+ 计时写作 + 四维自评 + 范文对照 + 历史记录
6. 口语题库（Part 1 / 2 / 3）+ 计时 + 浏览器内录音回听 + 四维自评 + 参考答案

**非目标（二期）**：AI 批改（Claude API，作为可选开关）；听力和阅读的雅思题型（填表、TFNG、Matching Headings）与限时模考；语音识别；Task 1 流程图和地图题；导入用户自有资料（本期只预留目录）。

**进展（2026-11-25）**：二期第二批已上线，详见 [变更记录](../changes/2026-11-25-雅思第二批功能.md)。
- 已实现 · 听力：「🎧 听力」子页，8 个原创 section（Part 1–4 各 2）共 80 题，浏览器 TTS 朗读，考试 / 练习模式（设计见 [ielts-listening-20261124.md](ielts-listening-20261124.md)）
- 已实现 · 阅读题型：「📖 阅读」子页，6 篇原创文章共 78 题、8 种题型（含 TFNG、Matching Headings），考试 / 练习模式（设计见 [ielts-reading-20261124.md](ielts-reading-20261124.md)）
- 已实现 · 语音识别（可选）：口语实时转写 + 流利度指标，默认关闭、手动勾选开启
- 已实现 · Task 1 流程图与地图：各 4 题
- 已实现 · 自有资料导入：`npm run import:ielts`（vocab / writing / speaking），说明见 [docs/雅思自有资料导入.md](../雅思自有资料导入.md)
- 部分实现 · 限时模考：只有单个听力 section、单篇阅读的考试模式，整套模考（听力 4 个 Part 连做、阅读 3 篇 60 分钟）未做
- 推迟 · AI 批改

**如实说明**：A2 到 7.0 要跨 B1、B2、C1 三档，约需 600 小时有效学习，相当于 26 周每天 3–3.5 小时。时间线非常激进，计划中用三个检查点兜底（见 §5）。

## 2. 已定决策（均为推荐方案，理由附后）

| # | 决策 | 理由 |
|---|---|---|
| D1 | 新增顶层标签 `ielts`（🎓 雅思备考），归入「学」组，面板内自带子导航：总览计划 / 词汇 / 写作 / 口语 / 记录 | 雅思是主线目标，需要一个入口 |
| D2 | **不改** `data/global-vocab.json`；另做「雅思词汇诊断」，按 B1/B2/C1 分段抽样，估算雅思词表覆盖率 | 保住「总词汇量」历次成绩的可比性；高段测量交给雅思词表 |
| D3 | 雅思词汇作为查词典的新来源 `ielts`，优先级为「教材 > extras > global > ielts」（雅思词只补充新词；2026-11-24 审查后由 ielts > global 调整，避免覆盖 346 个已有全局词条）；背单词复用 `/api/words/rate`、`/api/words/spell`（带 cn 存 extras） | 掌握度、间隔复习、活动统计全部复用，最小侵入 |
| D4 | 录音只存在浏览器内存（MediaRecorder + blob URL），不上传也不落盘；服务端只存时长和自评分 | 隐私、体积，并保持 JSON 存储简单 |
| D5 | 写作和口语自评分取四维平均后**向下取整到 0.5**；总分估算按官方规则四舍五入到 0.5（.25 进为 .5，.75 进为整数） | 自评偏乐观，向下取整更保守 |
| D6 | 26 周模板固定，实际周数 = ceil((考试日 − 开始日) / 7)，夹在 [4, 52] 之间；第 i 实际周映射到模板第 round((i−1)×26/实际周数)+1 周 | 改考试日后计划自动压缩或拉伸 |
| D7 | 官方真题和评分标准原文不入库；题目、范文、例句全部原创，评分维度用自己的话概括；`data/ielts/local/` 进 .gitignore，内容加载器顺带读它（schema 相同） | 版权 |
| D8 | 学习计划 `LEVELS` 新增 `ielts` 预设；在现有技能的 sources 里追加 `ielts-writing`（写）、`ielts-speaking`（说），雅思词汇经 `words` 计入「记」 | 不改变其他预设的行为 |
| D9 | `cefrOf` 改为 Pre-A1 / A1 / A2 / B1 / B2 / C1，原「B1+」由 B2 / C1 取代，并标注「总词汇量测试高段词量有限，C1 以上请看雅思词汇诊断」 | B1+ 低估了高段水平 |

## 3. 内容数据（`data/ielts/`，全局共享、入库）

所有文件均为 **JSON 数组**（`rubrics.json`、`plan.json` 除外），目录下的 `*.json` 自动合并。id 全局唯一。英文中的引号用直引号。

### 3.1 词汇 `data/ielts/vocab/*.json`（词汇线）
```jsonc
{ "word": "sustainable", "pos": "adj.", "cn": "可持续的", "phon": "/səˈsteɪnəbl/",
  "topic": "environment",          // 见下方 topic 枚举
  "cefr": "B2",                    // B1 | B2 | C1 | C2
  "academic": true,                // 是否学术通用高频词
  "eg": "Governments must invest in sustainable energy.",   // 原创例句
  "egCn": "政府必须投资可持续能源。",
  "collocations": ["sustainable development", "environmentally sustainable"] }
```
topic 枚举：`academic`（学术通用）`education` `environment` `technology` `health` `work` `crime` `media` `urban` `globalization` `government` `culture` `science`。

### 3.2 写作 `data/ielts/writing/*.json`（写作线）
```jsonc
// Task 2
{ "id": "w2-edu-01", "task": 2, "topic": "education",
  "qtype": "opinion",   // opinion | discussion | problem-solution | adv-disadv | two-part
  "prompt": "Some people believe ... To what extent do you agree or disagree?",
  "promptCn": "……",
  "ideas": ["论点思路 1（中文）", "…"],
  "outline": ["Intro: …", "Body 1: …", "Body 2: …", "Conclusion: …"],
  "phrases": ["It is widely argued that …", "…"],
  "modelAnswer": "…",   // 260–320 词，段落之间用 \n\n 分隔
  "modelBand": 7.5 }
// Task 1 A 类（图表）
{ "id": "w1a-01", "task": 1, "variant": "A", "topic": "…",
  "prompt": "The bar chart below shows ... Summarise the information ...",
  "chart": { "type": "bar",          // bar | line | pie | table
             "title": "…", "unit": "%",
             "categories": ["2000", "2010", "2020"],
             "series": [ { "name": "UK", "values": [12, 15, 19] } ] },   // values 长度 = categories 长度；pie 只有 1 个 series
  "keyFeatures": ["总体趋势…", "…"],
  "modelAnswer": "…",   // 170–200 词
  "modelBand": 7.5 }
// Task 1 G 类（书信）
{ "id": "w1g-01", "task": 1, "variant": "G", "tone": "formal",   // formal | semi-formal | informal
  "prompt": "You recently ... Write a letter to ...",
  "bullets": ["…", "…", "…"],
  "modelAnswer": "…", "modelBand": 7.5 }
```

### 3.3 口语 `data/ielts/speaking/*.json`（口语线）
```jsonc
{ "id": "s1-hometown", "part": 1, "topic": "Hometown", "topicCn": "家乡",
  "questions": [ { "q": "Where is your hometown?", "sample": "…（40–70 词）" } ] }
{ "id": "s2-person-01", "part": 2, "category": "person",   // person | place | object | event | experience | media
  "cueCard": { "title": "Describe a teacher who influenced you.",
               "points": ["who this person is", "…", "…"],
               "final": "and explain why this person influenced you." },
  "sample": "…（220–280 词）",
  "part3": [ { "q": "…", "sample": "…（60–100 词）" } ] }
```

### 3.4 评分维度 `data/ielts/rubrics.json`（口语线，对象）
```jsonc
{ "writing": {
    "task1A": [ { "key": "TA",  "name": "Task Achievement", "nameCn": "任务完成",
                  "levels": [ { "band": 5, "desc": "…" }, { "band": 6, "desc": "…" }, { "band": 7, "desc": "…" }, { "band": 8, "desc": "…" } ],
                  "checklist": ["是否有 overview 概述总体趋势", "…"] },
                { "key": "CC", … }, { "key": "LR", … }, { "key": "GRA", … } ],
    "task1G": [ …TA/CC/LR/GRA… ],
    "task2":  [ { "key": "TR", "name": "Task Response", … }, CC, LR, GRA ] },
  "speaking": [ { "key": "FC", "name": "Fluency and Coherence", … }, LR, GRA, { "key": "P", "name": "Pronunciation", … } ] }
```
desc 和 checklist 一律用自己的话概括，**不得照抄**官方 band descriptors。

### 3.5 26 周计划模板 `data/ielts/plan.json`（后端线，对象）
```jsonc
{ "version": 1, "baseline": "A2", "target": 7.0, "templateWeeks": 26,
  "phases": [
    { "key": "foundation", "name": "基础期", "weeks": [1, 8],  "cefrGoal": "B1", "goal": "…" },
    { "key": "skills",     "name": "专项期", "weeks": [9, 20], "cefrGoal": "B2", "goal": "…" },
    { "key": "sprint",     "name": "冲刺期", "weeks": [21, 26], "cefrGoal": "C1", "goal": "…" } ],
  "weeks": [ { "week": 1, "phase": "foundation", "focus": "…", "tips": "…",
               "tasks": [ { "key": "nce2-read", "label": "NCE2 精读 1 课 + 本课题",
                            "kind": "internal",     // internal：按活动来源自动统计；external：手动打勾
                            "source": ["quiz", "lesson"], "target": 20, "unit": "题",
                            "tab": "learn", "minutes": 40 } ] } ],
  "checkpoints": [
    { "week": 8,  "name": "B1 检查点", "criteria": { "vocabBand": "B1", "vocabCoverageMin": 70, "writingMin": 5.0, "speakingMin": 5.0 } },
    { "week": 14, "name": "B2 中期检查", "criteria": { "vocabBand": "B2", "vocabCoverageMin": 60, "writingMin": 5.5, "speakingMin": 5.5 } },
    { "week": 20, "name": "冲刺前检查", "criteria": { "vocabBand": "C1", "vocabCoverageMin": 50, "writingMin": 6.5, "speakingMin": 6.5 } } ] }
```
**阶段内容要点**（后端线据此写满 26 周，每周 5–8 项任务，日均约 180–210 分钟）：
- **基础期 W1–8（A2→B1）**：NCE2 精读 + 题库（learn / practice）、句型转换（transform）、听写 NCE2（dictation）、背单词（NCE2 词 + 雅思 academic/B1 词）、情景对话（daily / campus）、间隔复习（review）；W3 起口语 Part 1，W6 起 Task 1 入门（每周 1 篇）。
- **专项期 W9–20（B1→B2）**：NCE3 精读 + 阅读理解、听力理解（comprehension）、听写 NCE3、每周 2 个雅思话题词、Task 1 ×2 / 周、Task 2 ×2 / 周、口语 Part 1/2/3 每日、学术对话（dialogue）；外部任务：剑雅听力 / 阅读各 1 套（`kind: external`）。
- **冲刺期 W21–26（B2→C1）**：NCE4 精读、Task 2 ×5 / 周、Task 1 ×3 / 周、口语全套模拟每日、阶段测验（exam，第四册模考）、每周 1 次雅思词汇诊断、外部剑雅全套模考 ×2 / 周；W26 为考试周，降量复盘。

可用 `tab`：`home learn practice dictionary dictation exam transform dialogue review vocab words globalvocab comprehension stats plan level ielts`，以及雅思子页 `ielts:plan ielts:vocab ielts:writing ielts:speaking ielts:history`。
可用 `source`：`quiz transform words vocab dictation dialogue lesson comprehension ielts-writing ielts-speaking ielts-vocab`。

## 4. 用户数据（按档案隔离，`data/profiles/<id>/ielts.json`）
```jsonc
{ "profile": { "active": true, "examType": "A", "examDate": "2027-05-24", "startDate": "2026-11-24",
               "baseline": "A2", "target": { "overall": 7.0, "listening": null, "reading": null, "writing": null, "speaking": null } },
  "writings":  [ { "id": "…", "promptId": "w2-edu-01", "task": 2, "variant": null, "text": "…", "wordCount": 270,
                   "durationSec": 2400, "selfScores": { "TR": 6, "CC": 6, "LR": 5.5, "GRA": 5.5 }, "band": 5.5, "ts": 0 } ],
  "speakings": [ { "id": "…", "itemId": "s2-person-01", "part": 2, "durationSec": 118,
                   "selfScores": { "FC": 5, "LR": 5, "GRA": 5, "P": 5.5 }, "band": 5.0, "notes": "", "ts": 0 } ],
  "vocabChecks": [ { "ts": 0, "byBand": { "B1": { "total": 10, "correct": 8, "coverage": 73 } }, "overall": 61 } ],
  "manualDone": { "2026-11-24": ["w9-cam-listening"] } }
```
- 没有该文件，或 `profile.active` 不为 true 时，视为未开启雅思备考；GET 接口返回默认档案，并带 `active: false`
- `writings` 和 `speakings` 各最多保留 500 条，`text` 最长 20000 字符
- `ielts.json` 要加入 `lib/profile.js` 的 `USER_FILES` 和 `routes/backup.js` 的 `KEYS`

## 5. 后端 API（`routes/ielts.js`，挂载在 `/api` 下）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ielts/profile` | `{ profile, derived: { daysLeft, totalWeeks, currentWeek, phase, templateWeek } }` |
| POST | `/ielts/profile` | 部分更新 `{ active, examType: A\|G, examDate: YYYY-MM-DD, target: {...}, baseline }`；逐字段校验，非法返回 400 `{ error }`；首次激活时写入 `startDate` = 今天 |
| GET | `/ielts/plan` | `{ phases, totalWeeks, currentWeek, week: {...当前周（已映射）}, today: { tasks: [ { ...task, done, met } ] }, upcoming: [后 2 周概要], checkpoints: [ { week(实际周), name, criteria, status: 'future'\|'due'\|'passed'\|'failed', detail, suggestions: [] } ], warning: '时间线说明' }` |
| POST | `/ielts/plan/check` | `{ date, taskKey, done }`，只用于 external 任务 |
| GET | `/ielts/vocab?topic=&cefr=&q=&limit=&offset=` | `{ total, topics: [ { key, label, count } ], items: [ { ...word, key, level（来自 words.json states，0–3 或 null） } ] }` |
| GET | `/ielts/vocab-check` | `{ quizId, items: [ { id, word, options: [4 个中文释义] } ] }`，从 B1/B2/C1 各抽 10 个，答案留在服务端内存（30 分钟过期，参考 routes/comprehension.js） |
| POST | `/ielts/vocab-check` | `{ quizId, answers: [ { id, choice } ] }` → `{ byBand, overall, wrong: [...] }`，写入 vocabChecks，活动来源记 `ielts-vocab` |
| GET | `/ielts/writing?task=&variant=&topic=&qtype=` | 列表：不含 modelAnswer，每条带 `done`（本人提交次数）和 `bestBand` |
| GET | `/ielts/writing/:id` | 完整题目，含 modelAnswer（前端在提交前隐藏） |
| POST | `/ielts/writing/submit` | `{ promptId, text, durationSec, selfScores }` → 服务端统计 wordCount、计算 band（D5）、给出字数不足提示（Task 1 少于 150 词，Task 2 少于 250 词）；写入 writings，活动来源记 `ielts-writing` |
| GET | `/ielts/speaking?part=` | 列表（Part 2 条目带 part3 题数） |
| GET | `/ielts/speaking/:id` | 完整条目 |
| POST | `/ielts/speaking/submit` | `{ itemId, part, durationSec, selfScores, notes }` → band，写入 speakings，活动来源记 `ielts-speaking` |
| GET | `/ielts/rubrics` | rubrics.json |
| GET | `/ielts/history?type=writing\|speaking&limit=` | 倒序 |
| GET | `/ielts/summary` | `{ active, writing: { last3Avg, count }, speaking: { last3Avg, count }, vocab: { lastOverall, byBand }, estimate: { overall, note } }`，供总览、水平页和首页使用 |

**检查点判定**：到达对应实际周后为 `due`。取最近一次雅思词汇诊断中 `vocabBand` 段的覆盖率，以及写作、口语近 3 次自评均值，与 criteria 比较：全部达标为 `passed`，否则为 `failed`。`failed` 时给出建议：①把学习计划切到「雅思」或「冲刺」预设并加量；②按差距把考试日推迟 4–8 周（给出具体日期）；③把目标暂调到 6.5。只做提示，不自动修改。

**今日完成数**：`lib/ielts-plan.js` 自行读取 progress（quiz）、transforms.json（transform）和 activity 日志，按 source 统计当天次数。**不改** `routes/plan.js` 已有函数，只追加 LEVELS、SOURCE_LABEL 和 sources。

## 6. 前端（`public/js/`）
- `feat-ielts.js`：注册 `{ id: 'ielts', label: '雅思备考', icon: '🎓' }`，壳层和子导航；`NCE.pendingIelts = { page }` 用于深链子页。未开启时显示开启引导（默认 A 类 / 2027-05-24 / 7.0，可改），并给出时间线说明
- `ielts-plan-ui.js`：倒计时、阶段进度条、本周重点、今日任务清单（「去做 →」用 `NCE.gotoTab`；external 任务可打勾）、检查点卡片和建议
- `ielts-vocab-ui.js`：按话题和 CEFR 浏览、卡片背诵（调 `/api/words/rate` 并带 cn/eg）、拼写（`/api/words/spell`）、雅思词汇诊断
- `ielts-writing-ui.js`：题目筛选 → 写作页（计时器：Task 1 20 分钟 / Task 2 40 分钟，实时字数，草稿自动存 localStorage）→ 提交 → 四维自评（rubrics 分档描述 + checklist）→ 范文对照 → band
- `ielts-chart.js`：用内联 SVG 渲染 bar / line / pie / table，明暗主题都能看清
- `ielts-speaking-ui.js`：Part 1 逐题作答；Part 2 准备 60 秒 → 作答 120 秒倒计时；Part 3 追问。MediaRecorder 录音、回听（D4），不支持时隐藏录音；四维自评 + 参考答案
- 改动现有文件：`index.html`（加 script）、`app.js`（`TAB_GROUP_OF` 加 `ielts: 'learn'`，首页在雅思备考开启时显示倒计时卡片）、`feat-level.js`（D9 + 雅思分数粗估 + 跳转雅思备考）、`sw.js`（预缓存新 js，`SW_VERSION` +1）

## 7. 校验与测试
- `scripts/validate.js` 新增雅思内容校验：id 唯一、必填字段齐全、枚举合法、图表 values 长度与 categories 一致、pie 只有 1 个 series、词汇不重复（normKey）、范文字数（Task 2 ≥ 250、Task 1 ≥ 150）、plan 共 26 周且 tab / source 合法、rubrics 四个维度齐全
- `scripts/test-ielts.js`（`npm run test:ielts`）：周数映射、band 取整、检查点判定、profile 校验；用 `IELTS_DATA_DIR` 环境变量指向测试夹具
- 手工验证：开启备考 → 计划 → 背 5 个词 → 写一篇 → 口语一题 → 今日目标和首页卡片更新 → 备份导出中包含 ielts

## 8. 工作线与文件归属（严格白名单）

| 线 | 允许创建或修改的文件 |
|---|---|
| A 后端 | `lib/ielts.js` `lib/ielts-plan.js` `routes/ielts.js` `routes/plan.js` `lib/profile.js` `lib/wordlookup.js` `routes/backup.js` `scripts/validate.js` `scripts/test-ielts.js` `scripts/fixtures/ielts/**` `package.json` `.gitignore` `data/ielts/plan.json` |
| B 前端 | `public/js/feat-ielts.js` `public/js/ielts-*.js` `public/index.html` `public/app.js` `public/js/feat-level.js` `public/sw.js` |
| C 词汇 | `data/ielts/vocab/*.json` |
| D 写作 | `data/ielts/writing/*.json` |
| E 口语 | `data/ielts/speaking/*.json` `data/ielts/rubrics.json` |

**内容规模**：词汇约 720 个（academic 约 240，其余 12 个话题各约 40）；Task 2 共 20 题全部带范文（覆盖 10 个话题和 5 种题型）；Task 1 A 类 8 题（bar ×2、line ×2、pie ×2、table ×2）；G 类 6 封信（三种语气各 2 封）；口语 Part 1 16 个话题 × 4 题；Part 2 题卡 16 张 × Part 3 追问 4 题，全部带参考答案。
