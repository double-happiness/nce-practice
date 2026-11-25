# 雅思阅读模块技术方案（2026-11-24）

> 雅思备考 MVP（`ielts-prep-mvp-20261124.md`）二期的第一个新模块。只给本人自学用，不考虑多用户、账号和分享。
> 本线只新建文件；接入 `validate.js`、`package.json`、`plan.js`、`plan.json`、`sw.js` 由协调方合并时统一处理（见 §9）。

## 1. 目标与非目标

**目标**
1. 6 篇原创学术类阅读（易 / 中 / 难各 2 篇），每篇 650–900 词、A–G 共 7 段、13 题、至少 3 种题型
2. 两种模式：考试模式 20 分钟倒计时（到时只提醒，不强制交卷）；练习模式不计时
3. 服务端判分，逐题返回对错、正确答案、中文解析、原文定位句；给出原始分和估算 band
4. 交卷后点题可在文章里滚动并高亮证据句；作答中可选中文字高亮
5. 作答记录存进 `ielts.json` 的 `readings`，列表页显示每篇最好成绩和作答次数

**非目标**：整套 3 篇 60 分钟模考；题目随机组卷；高亮持久化（只在本次页面会话里保留）；G 类阅读；拖拽题型。

**版权与事实**：文章和题目全部原创，只模仿雅思学术类阅读的文体和题型，不照搬剑桥真题。文中涉及的历史事件只用公认的大致事实；具体研究多用泛指描述（如 “a study in a Canadian forest”），不作为事实引用来源。

## 2. 内容数据 `data/ielts/reading/*.json`

目录下所有 `*.json` 自动合并（每个分片是 **JSON 数组**），另外读取不入库的 `data/ielts/local/reading/*.json`（schema 相同）。内容根目录跟随 `IELTS_DATA_DIR`。英文里的引号用直引号，引用词用单引号（如 `'wood wide web'`），避免 JSON 转义。

### 2.1 文章

```jsonc
{
  "id": "rd-green-roofs",            // 小写字母、数字、-，1–64 位，全局唯一
  "title": "Gardens in the Sky: The Rise of Green Roofs",
  "titleCn": "空中花园：绿色屋顶的兴起",
  "difficulty": "easy",              // easy | medium | hard
  "topic": "environment",            // science | history | society | environment | psychology | technology
  "minutes": 20,                     // 可选，建议用时，5–60，默认 20
  "paragraphs": [ { "label": "A", "text": "…" }, … ],   // 标签从 A 起连续，建议 A–G 共 7 段
  "groups": [ …题组… ]               // 按题号顺序排列
}
```

### 2.2 题组与题目

所有题组都有 `type`、`instruction`、`questions`。题目通用字段：

```jsonc
{ "id": "q1",          // 形如 q1、q12，篇内唯一
  "number": 1,         // 整篇从 1 起连续
  "prompt": "…",       // 题干（摘要填空不需要）
  "answer": ["…"],     // 可接受的写法逐个列出；第一个是首选答案
  "explanation": "…",  // 中文解析
  "evidence": { "para": "B", "quote": "…" } }   // quote 必须逐字出现在该段 text 里
```

| type | 组级字段 | 题目字段 | answer 规则 |
|---|---|---|---|
| `tfng` | — | `prompt` | 恰好 1 个：`TRUE` / `FALSE` / `NOT GIVEN`（完整大写；缩写由判分接受） |
| `ynng` | — | `prompt` | 恰好 1 个：`YES` / `NO` / `NOT GIVEN` |
| `matching-headings` | `options: [{ key: "i", text }]`（罗马数字，比题数多 2–3 个） | `para`（配对段落）、`prompt`（如 "Paragraph B"） | 1 个标题 key；同组内段落、标题都不得重复；`evidence.para` = `para` |
| `matching-information` | — | `prompt` | 1 个段落字母；`evidence.para` = 答案 |
| `mcq` | — | `prompt`、`options: [{ key: "A", text }]`（3–5 个） | 1 个选项字母 |
| `sentence-completion` | `wordLimit` | `prompt` 里恰好 1 个 `{blank}` | 每个写法都不超字数；首选答案须以完整词出现在 `evidence.quote` 里 |
| `summary-completion`（取原文） | `wordLimit`、`summary: { title?, text }` | — | 同句子填空 |
| `summary-completion`（词库） | `summary`、`wordBank: [{ key: "A", text }]`（至少比空数多 2 个） | — | 1 个词库字母 |
| `short-answer` | `wordLimit` | `prompt` | 同句子填空 |

- `wordLimit: { words: 1–4, number?: boolean }`。展示文字由代码生成：`{words:2}` → `NO MORE THAN TWO WORDS`，`{words:3, number:true}` → `NO MORE THAN THREE WORDS AND/OR A NUMBER`，`{words:1}` → `ONE WORD ONLY`。`instruction` 必须包含这段文字，保证说明和判分口径一致。
- 摘要正文用 `{q7}` 这样的占位符标出空位，每个题目 id 恰好出现一次。

### 2.3 校验 `validateReadingContent(items) → { errors, warnings }`

`lib/ielts-reading.js` 导出，消息以 `ielts/reading/<分片>` 开头。

**errors**：条目不是对象；id 非法或重复；缺 title；difficulty / topic 不在枚举里；minutes 越界；段落少于 3 段、标签不连续或缺 text；groups 为空；题型未知；缺 instruction；题目 id 非法或篇内重复；题号不连续；answer 不是非空字符串数组；缺 explanation；evidence 缺失、段落不存在或 quote 找不到；各题型的专属规则（见 §2.2 表格）；填空缺 wordLimit、instruction 与 wordLimit 不一致、可接受写法超字数、首选答案不在 quote 里；摘要占位符缺失或多余；词库字母不存在或干扰项不足。

**warnings**：缺 titleCn；段数不是 7；全文不在 650–900 词；题数不是 13；题型少于 3 种；同一题的可接受写法归一化后重复；不需要 wordLimit 的题型写了 wordLimit。

内容加载期的问题（JSON 解析失败、分片不是数组）放在 `getContent().issues`，需要协调方一并报出（见 §9）。

## 3. 判分规则

1. **归一化**：转小写，去首尾空格，连续空白（含制表符、不换行空格）合并成一个空格；弯撇号 `’` 统一成直撇号 `'`。不去标点、不做模糊匹配，**拼写必须与某个可接受写法完全一致**。
2. **TFNG / YNNG**：只认完整词（`true` / `false` / `not given`，`yes` / `no` / `not given`）或缩写（`T` / `F` / `NG`，`Y` / `N` / `NG`），不区分大小写。TFNG 题写 `YES` / `N`、YNNG 题写 `TRUE` / `F` 都判错，`notgiven` 这类残缺写法也判错。
3. **选项类**（单选、两种配对、词库摘要）：按选项 key 比较，不区分大小写。词库摘要额外接受直接写出该选项的词（如写 `nonsense` 等同于 `A`）。
4. **填空类**（句子、取原文摘要、简答）：先按 `wordLimit` 数词数，**超过直接判错**并在结果里标 `overLimit: true`，即使里面包含正确答案。按空格切词，连字符词算 1 个词；`number: true` 时允许 1 个数字（`1858`、`1,200`、`40%`、`1850s`、`19th`）不计入词数，第二个数字起按词计；`number` 不为 true 时数字也算词。
5. 空答案判错，结果里标 `blank: true`。

## 4. 估算 band

先按比例折算到 40 题：`scaled40 = round(raw / total × 40)`，再查学术类阅读的常见近似换算表：

| 40 题原始分 | band | 40 题原始分 | band |
|---|---|---|---|
| 39–40 | 9.0 | 19–22 | 5.5 |
| 37–38 | 8.5 | 15–18 | 5.0 |
| 35–36 | 8.0 | 13–14 | 4.5 |
| 33–34 | 7.5 | 10–12 | 4.0 |
| 30–32 | 7.0 | 8–9 | 3.5 |
| 27–29 | 6.5 | 6–7 | 3.0 |
| 23–26 | 6.0 | 4–5 | 2.5 |
| | | 1–3 | 2.0 |
| | | 0 | 1.0 |

13 题时：13→9.0、12→8.5、11→7.5、10→7.0、9→6.5、8→6.0、7→5.5、6 和 5→5.0、4→4.0、3→3.5、2→3.0、1→2.0、0→1.0。

> **这只是近似。** 官方每套题的换算会根据难度浮动，表格是公开流传的常见对照，4 分以下没有公开数据（按 2.0 / 1.0 粗略处理）；单篇只有 13 题，答对或答错一题就会差 0.5–1 分。估算 band 只用来看趋势，不代表真实考试成绩。接口同时返回这段说明（`bandNote`）。

## 5. 用户数据（`data/profiles/<id>/ielts.json` 的 `readings` 数组）

```jsonc
{ "id": "uuid", "passageId": "rd-pencil", "mode": "exam",      // exam | practice
  "raw": 9, "total": 13, "band": 6.5, "durationSec": 1140,
  "wrong": ["q3", "q7", "q8", "q12"],                          // 答错或未答的题号
  "date": "2026-11-24", "ts": 1795526617077 }
```

- 通过 `lib/ielts.js` 的 `loadUser` / `saveUser` 读写。`loadUser` 会保留未知顶层字段，所以**不需要改 lib/ielts.js**；`saveUser` 不认识 `readings`，因此本模块每次读写前自己清洗：过滤结构不合法的记录（mode、raw ≤ total、band 步长 0.5、ts 等），只保留最近 **300** 条。
- 最好成绩：band 高者优先，同 band 比正确率，再比时间较新。练习模式和考试模式都参与统计，记录里保留 mode。
- 交卷后记一条学习活动 `source: 'ielts-reading'`（`lib/activity.js`），`correct` = 正确率 ≥ 60%；用 try/catch 包住，失败只打日志，不影响交卷结果。

## 6. 接口（`routes/ielts-reading.js`，自动挂载到 `/api`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ielts/reading` | `{ total, items: [ { id, title, titleCn, difficulty, topic, topicCn, minutes, wordCount, questionCount, types, attempts, best: { raw, total, band, mode, ts } \| null, lastTs } ], topics, bandNote }`，按易 → 中 → 难排序，不含答案 |
| GET | `/ielts/reading/:id` | 文章与题目：`{ …摘要字段, paragraphs, groups: [ { type, instruction, wordLimit?, wordLimitLabel?, options?, wordBank?, summary?, questions: [ { id, number, prompt?, para?, options? } ] } ] }`，**不含 answer / explanation / evidence** |
| POST | `/ielts/reading/:id/submit` | body `{ answers: { [qid]: string }, durationSec, mode }` → `{ ok, record, raw, total, scaled40, band, bandNote, results: [ { id, number, type, response, correct, blank, overLimit, answer, answerText, explanation, evidence: { para, quote } } ] }` |

**输入校验**（错误一律 400 `{ error }`）：`:id` 格式非法 → 400，不存在 → 404；body 不是对象；`mode` 不是 `exam` / `practice`；`durationSec` 不是 0–14400 的整数（缺省按 0）；`answers` 不是对象；`answers` 含本篇不存在的题号；值不是字符串或超过 200 字符；一题都没答。

## 7. 前端（`public/js/ielts-reading-ui.js`）

- 注册：`NCE.ielts.registerPage('reading', { meta: { label: '阅读', icon: '📖', before: 'writing' }, render, resume, pause, leave })`。
- **列表页**：难度筛选（全部 / 易 / 中 / 难），每篇显示难度、话题、词数、题型、最好成绩与作答次数、是否有草稿，两个入口按钮（考试模式 / 练习模式）。
- **答题页**：顶部吸顶条（返回、标题、模式、计时、已答数、交卷）。宽屏（≥ 960px）左文章右题目，两栏各自滚动；窄屏用「文章 / 题目」标签切换，分别记住滚动位置。答题页存在时用 `:has()` 把容器放宽到 1280px，其它页面不受影响。
- **计时**：考试模式 20 分钟倒计时，剩 5 分钟变橙，到时 toast + 页内提示，之后显示已超时，交卷不受影响；练习模式不显示时间，只在后台记用时。leave / pause 时清计时器，resume 时恢复。
- **高亮**：在文章里选中文字后弹出「🖍 高亮」按钮，点高亮处取消，可一键清除本篇高亮。高亮按「段落 + 字符区间」存在内存里（同一次页面会话内切走再回来仍在，刷新即清空）。证据句也用同样的区间渲染，所有文本片段逐段转义。
- **草稿**：作答变化 600ms 后存 localStorage，计时中每 15 秒顺带保存已用时间，key 为 `ielts-reading-draft-<文章 id>`（非 default 档案再加 `<档案 id>:` 前缀，与 `profile-store.js` 一致），读写都用 try/catch。交卷成功后清除；同模式重开时恢复已用时间。
- **交卷**：有空题时先提醒一次，再点一次才交。结果页显示原始分、折算 40 题分数、估算 band 和说明；逐题显示对错、你的答案、正确答案（含可接受写法、超字数标记）；点某题展开中文解析和原文句，并在文章里高亮、滚动到证据句（窄屏点「在文章中查看」切到文章）。
- 只用 `onXxx =` 赋值或模块加载时注册一次的全局监听（selectionchange / pointerup / scroll / resize，靠状态判断是否生效），不重复绑定；高亮按钮只创建一次挂在 body 上。样式全部用主题变量，深色主题（midnight）单独调了吸顶条底色、高亮色和输入框。

## 8. 测试（`scripts/test-ielts-reading.js`）

Node 自带 `assert`，不读写档案数据：归一化与可接受写法、字数超限与 AND/OR A NUMBER、TFNG / YNNG 缩写与拒绝项、选项类与词库摘要、整篇判分（真实文章用标准答案应全对）、40 题换算表边界与 13 题折算、非法参数、真实内容校验零错误零警告、内容规模与题型覆盖、各类构造坏数据必须报出对应错误、记录清洗与最好成绩、对外视图不泄露答案。

## 9. 需要协调方接入

1. `scripts/validate.js`：在 `validateIelts` 之后加
   ```js
   const reading = require('../lib/ielts-reading');
   const rc = reading.getContent();
   errors.push(...rc.issues.map((m) => `ielts/${m}`));
   const rr = reading.validateReadingContent(rc.passages);
   errors.push(...rr.errors);
   warnings.push(...rr.warnings);
   ```
   接入后可以删掉 `routes/ielts-reading.js` 里的 `checkContentOnce` 兜底日志（保留也无害）。
2. `package.json`：`"test:ielts-reading": "node scripts/test-ielts-reading.js"`。
3. `routes/plan.js`：`SOURCE_LABEL` 加 `'ielts-reading': '雅思阅读'`；「读」技能的 `sources` 追加 `'ielts-reading'`（`['quiz', 'ielts-reading']`）。注意「读」的单位是「题」，一篇阅读只记 1 次活动。
4. `scripts/validate.js` 的 `IELTS_PLAN_TABS` 加 `ielts:reading`，`IELTS_PLAN_SOURCES` 加 `ielts-reading`。`lib/ielts-plan.js` 的 `loadDailyCounts` 已按 activity 日志的 source 通用计数，无需改动。
5. `data/ielts/plan.json`：可在专项期（W9–20）每周加 2 篇、冲刺期（W21–25）每周加 3 篇按周累计的 internal 任务，例如 `{ "key": "ielts-reading", "label": "雅思阅读（考试模式 20 分钟/篇）", "kind": "internal", "per": "week", "source": ["ielts-reading"], "target": 2, "unit": "篇", "tab": "ielts:reading", "minutes": 50 }`（周任务的 `minutes` 是一周总用时，引擎按 `minutes / 7` 计入日均；冲刺期 3 篇对应 `target: 3`、`minutes: 75`）；原来的外部「剑雅阅读」任务保留作整套模考。目前只有 6 篇，专项期中后段会出现重做，属于预期（重做也能练定位速度）。
6. `public/sw.js`：`PRECACHE_URLS` 加 `'/js/ielts-reading-ui.js'`，`SW_VERSION` +1。

## 10. 任务

- T1 设计与数据结构（本文）
- [x] 已实现 2026-11-25
- T2 `lib/ielts-reading.js`：内容加载、校验、判分、band 估算、记录清洗
- [x] 已实现 2026-11-25
- T3 6 篇原创文章与 78 道题（`easy.json` / `medium.json` / `hard.json`）
- T4 `routes/ielts-reading.js`：列表、详情、交卷
- T5 `public/js/ielts-reading-ui.js` + `index.html` 一行 script
- T6 `scripts/test-ielts-reading.js`
