# 雅思：按题型的弱项统计

日期：2026-11-26
状态：已实现（2026-11-26，见文末「进展」）

## 1. 目标

现在听力、阅读只看得到每个 section / 每篇的总分，看不出「哪种题型最弱、错在哪」。本功能按题型统计正确率，听力再按错误原因归类，给出最弱的 2–3 项和对应的讲解与练习入口，让专项练习有的放矢。

目标用户：本人（A2 → 7.0，A 类）。所需数据都已在 `ielts.json` 的 `listenings` / `readings` 里，不改存储结构。

## 2. MVP 范围

| 做 | 不做（后续） |
|----|--------------|
| 听力：按题型、按 Part 的正确率；错误原因归类 | 写作 / 口语的弱项（依赖 AI 批改，另行设计） |
| 阅读：按题型、按难度的正确率 | 阅读错误原因（阅读记录不存作答内容，无法判断） |
| 最弱 2–3 项：附一句建议、知识库讲解与练习入口 | 按时间的弱项变化趋势 |
| 新子页「🎯 弱项」，时间窗口 30 / 60 / 90 天可切换 | 把弱项写进 26 周计划自动加任务 |

## 3. 统计口径（`lib/ielts-weakness.js`，纯函数）

时间窗口：只看最近 `days` 天（默认 60，允许 7–365）的记录，按记录 `ts` 的本地日期判断。

### 听力

- 数据：`listening.sanitizeListenings(user.listenings)`；每条记录按当前题库重判 `listening.gradeSection(section, r.answers)`。题目已不在题库，或重判的 `total` / `raw` 与记录不一致时跳过这条（同 `routes/ielts.js` 的 `listeningWrongItems`），并计入 `skipped`。
- 计数口径：**考试模式**（含模考写入的记录）每题都算，未作答记为错；**练习模式**只算作答了的题（练习常常只做一部分，空着的不代表不会）。
- 维度：题型（`form-completion` / `note-completion` / `sentence-completion` / `summary-completion` / `mcq` / `matching`）、Part（1–4）。
- 错误原因（只对计入的错题；按顺序取第一个命中的）：

| cause | 标签 | 判定 |
|-------|------|------|
| `blank` | 未作答 | 作答为空（只会出现在考试模式） |
| `over-limit` | 超出字数 | `gradeQuestion` 返回 `overLimit` |
| `choice` | 选项选错 | 题型为 `mcq` / `matching` |
| `plural` | 单复数 | 归一化后与某个可接受答案只差结尾的 `s` / `es` |
| `number` | 数字 / 日期听错 | 某个可接受答案含数字，且作答也含数字 |
| `spelling` | 拼写 | 与某个可接受答案的编辑距离 ≤ 1（答案 ≤ 5 个字符）或 ≤ 2（更长） |
| `other` | 其他（没听到 / 听错词） | 以上都不是 |

归一化用听力模块已有的 `normalizeAnswer`。

### 阅读

- 数据：`reading.sanitizeReadings(user.readings)`，**只算考试模式**（含模考）：阅读记录只存错题 id、不存作答内容，练习模式分不清「没做」和「做错」。
- 每条记录按当前题库还原题目：文章不在题库、`reading.gradePassage(p, {}).total !== r.total`、或 `wrong` 里有不存在的题 id 时跳过（同 `readingWrongItems`）。
- 维度：题型（8 种，见 `lib/ielts-reading.js` 的 `QUESTION_TYPES`）、难度（easy / medium / hard）。

### 正确率与最弱项

- 每个维度项：`{ key, label, total, correct, accuracy }`，`accuracy = correct / total` 保留两位小数，`total = 0` 时为 `null`；另给 `enough: total >= 8`（样本太少不排名）。
- **最弱项** `weakest`：听力、阅读的题型里 `enough` 且 `accuracy < 0.7` 的，按正确率升序取前 3；正确率相同按题数多的在前。每项附：
  - `tip`：一句中文建议（每个题型一句，写在 lib 里）；
  - `knowledgeId`：对应的知识库讲解（下表），前端用来跳转；
  - `practice`：`listening` 或 `reading`（前端「去练 →」的子页）。
- 听力错误原因另给 `topCause`（次数最多的原因，计数 ≥ 3 时才给），也附 `knowledgeId`。

题型 → 知识库文章：

| 题型 | knowledgeId |
|------|-------------|
| 听力 form / note / sentence / summary completion | `st-listening-form-completion` |
| 听力 mcq | `st-listening-mcq` |
| 听力 matching | `st-listening-matching-maps` |
| 阅读 tfng / ynng | `st-reading-tfng` |
| 阅读 matching-headings | `st-reading-matching-headings` |
| 阅读 matching-information | `st-reading-matching-information` |
| 阅读 sentence / summary completion、short-answer | `st-reading-completion` |
| 阅读 mcq | `st-reading-mcq-paraphrase` |

错误原因 → 知识库：`spelling` / `plural` / `number` / `over-limit` → `st-listening-spelling-format`；`choice` → `st-listening-mcq`；`blank` / `other` → `st-listening-prediction`。

知识库文章 id 不存在时（被删或改名），`knowledgeId` 返回 `null`，前端不显示「看讲解」。

## 4. 接口：`routes/ielts-weakness.js`（自动挂载到 `/api`）

`GET /ielts/weakness?days=60` → 400：`days` 不是 7–365 的整数。

```json
{
  "days": 60, "from": "2026-09-28", "to": "2026-11-26",
  "listening": {
    "records": 12, "skipped": 0, "questions": 96,
    "byType":  [{ "key": "form-completion", "label": "表格填空", "total": 30, "correct": 21, "accuracy": 0.7, "enough": true }],
    "byPart":  [{ "key": 1, "label": "Part 1", "total": 40, "correct": 30, "accuracy": 0.75, "enough": true }],
    "causes":  [{ "key": "spelling", "label": "拼写", "count": 5 }],
    "topCause": { "key": "spelling", "label": "拼写", "count": 5, "knowledgeId": "st-listening-spelling-format" }
  },
  "reading": {
    "records": 6, "skipped": 0, "questions": 78,
    "byType": [...], "byDifficulty": [{ "key": "easy", "label": "易", ... }]
  },
  "weakest": [
    { "skill": "reading", "key": "tfng", "label": "判断 T/F/NG", "total": 15, "correct": 7, "accuracy": 0.47,
      "tip": "…", "knowledgeId": "st-reading-tfng", "practice": "reading" }
  ]
}
```

- `byType` / `byPart` / `byDifficulty` 只列有数据的项，按固定顺序（题型按模块常量顺序，Part 1–4，难度 易 → 中 → 难）。
- `causes` 按次数降序，只列出现过的。
- 题型中文标签与前端现有 `TYPE_LABEL` 一致（阅读：判断 T/F/NG、观点 Y/N/NG、段落标题配对、信息定位、单选、句子填空、摘要填空、简答；听力：表格填空、笔记填空、句子填空、摘要填空、单选、匹配）。

## 5. 前端

- 新文件 `public/js/ielts-weakness-ui.js`：`NCE.ielts.registerPage('weakness', { meta: { label: '弱项', icon: '🎯', before: 'history' }, render })`；`public/index.html` 在 `ielts-history-ui.js` 之前加一行 script；`public/sw.js` 的 `PRECACHE_URLS` 加 `/js/ielts-weakness-ui.js`（版本号收尾时统一升级）。
- 页面：
  1. 顶部：时间窗口 30 / 60 / 90 天（chips，默认 60），说明口径（听力练习只算作答的题、阅读只算考试模式）。
  2. 「最需要补的」：`weakest` 每项一张卡——题型、正确率（对 x / y）、建议、「📚 看讲解 →」（有 `knowledgeId` 时）与「去练 →」；`listening.topCause` 单独一行。没有 `weakest` 时：数据不够（全部题型都不到 8 题）提示「再做几组题」，数据够但都 ≥ 70% 时提示「暂时没有明显弱项」。
  3. 听力：按题型、按 Part 的正确率条形（纯 CSS 条，不画 SVG），错误原因列表；阅读：按题型、按难度。样本不足 8 题的项灰显并标「样本少」。
- 「看讲解 →」：写一次性 `sessionStorage['nce-ielts-knowledge-open'] = knowledgeId` 后 `ctx.go('knowledge')`；`public/js/ielts-knowledge-ui.js` 的 `render` 读到这个标记（读完即删，try/catch）就直接 `openArticle(id)`。

## 6. 测试

`scripts/test-ielts-weakness.js`（`npm run test:ielts-weakness`）：

- 纯函数：错误原因各分支（含优先级）、编辑距离与单复数判定、考试 / 练习计数口径、时间窗口、跳过对不上题库的记录、`enough` 阈值、最弱项排序与上限、knowledgeId 映射（含文章不存在时为 null）。
- 接口：临时档案（照 `scripts/test-ielts-external.js` 的写法），布置听力 / 阅读记录后 `GET /ielts/weakness`，以及 `days` 的 400。

## 7. 衡量

- 「🎯 弱项」页的最弱项在两周后是否变化（同一题型正确率提升 ≥ 10 个百分点视为有效）。
- 点「看讲解」后该题型的后续正确率，作为讲解是否有用的参考。

## 8. 进展（2026-11-26）

已按本文实现（worktree 中开发、cherry-pick 合入），变更记录见 [2026-11-26 雅思弱项统计](../changes/2026-11-26-雅思弱项统计.md)。实现时明确下来的细节：

- **时间窗口**含今天共 `days` 天（起始日 = 今天往前 `days - 1` 天）；`?days=` 为空按 60；数组、小数、`1e2` 返回 400。
- **70% 阈值**按保留两位小数后的正确率比较（与页面显示一致，0.695 显示为 70%，不算弱项）；正确率与题数都相同时听力在前、再按题型固定顺序；错误原因次数相同时按 §3 表格顺序。
- **跳过规则**：听力记录没有作答内容也跳过；窗口外的记录、阅读练习模式记录不计入 `skipped`。
- **「未作答」**以去首尾空白后为空为准（与判分一致）；只写了标点、归一化后为空的作答归为「其他」。单复数只认结尾差 s / es（`cities` / `city` 不算）；拼写用标准编辑距离，容错按可接受答案归一化后的长度。
- **子页顺序**：脚本放在 `ielts-mock-ui.js` 之后，导航为 …模考、弱项、记录（原设计「放在 history-ui 之前」会排成 弱项、模考、记录）。
- 「去练 →」按钮写成「去练听力 →」「去练阅读 →」。
- 未测：真机移动端与 390px 宽（无头 Chrome 最窄 500px，500px 与 1000px 无横向滚动）。
