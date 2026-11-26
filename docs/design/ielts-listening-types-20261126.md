# 雅思听力：补齐多选、地图标注、流程图填空

日期：2026-11-26
状态：已实现（2026-11-26，见文末「进展」）

## 1. 目标

真考听力 Part 2 / 3 / 4 常见、站内还没有的三种题型：

| 题型 | 真考形式 | 常见位置 |
|------|----------|----------|
| 多选（Choose TWO） | 一道题干、5 个选项选 2 个，占 2 个题号，顺序不限 | Part 2、Part 3 |
| 地图 / 平面图标注 | 一张标了字母 A–H 的图，给地点名填字母 | Part 2 |
| 流程图填空 | 方框加箭头的流程，空格处填词 | Part 3、Part 4 |

目标用户：本人（A2 → 7.0）。专项期（约 2027-01-19 起）每周练 Part 2–4，冲刺期每周一套模考，赶在专项期前补齐。

## 2. 原则：尽量复用现有机制

| 新类型 | 归类 | 复用 |
|--------|------|------|
| `flowchart-completion` | 填空类（加入 `COMPLETION_TYPES`） | 判分、字数限制、校验与笔记填空完全相同；只是前端画成方框 + 箭头 |
| `map-labelling` | 选择类（加入 `CHOICE_TYPES`） | 与 `matching` 相同：选项在组上、每题一个字母；多一张图 `figure` |
| `mcq-multi` | 选择类（加入 `CHOICE_TYPES`） | 选项在组上；**判分在组内去重**（见 §3.3） |

作答记录格式不变：`answers: { "题号": string }`，每个题号一个字母或一段文字。

## 3. 数据结构（`data/ielts/listening/*.json` 的题组）

### 3.1 `flowchart-completion`

```json
{
  "type": "flowchart-completion", "from": 0,
  "instruction": "Complete the flow-chart below.",
  "wordLimit": "ONE WORD ONLY",
  "title": "How the samples are processed",
  "flow": [{ "text": "Samples collected from 12 sites" }, { "no": 31 }, { "no": 32 }, { "text": "Results sent to the council" }],
  "questions": [{ "no": 31, "prompt": "Mud is ___ to remove stones", "answer": ["sieved"], "segment": 2, "explanation": "…" }]
}
```

- 题目字段与笔记填空相同（`prompt` 含且仅含一个 `___`，答案须出现在 `segment` 原文里，可选 `heading` 不用）。
- `flow`（可选）：流程框的顺序，元素是 `{ text }`（不含空格的固定步骤）或 `{ no }`（引用本组某题）。有 `flow` 时，本组每道题必须**恰好出现一次**，`text` 非空；没有 `flow` 时按题号顺序每题一个框。

### 3.2 `map-labelling`

```json
{
  "type": "map-labelling", "from": 5,
  "instruction": "Label the map below. Write the correct letter, A-H, next to Questions 16-20.",
  "figure": { "type": "map", "title": "Marsh Lane Wetland Centre", "compass": true,
              "maps": [{ "title": "", "features": [{ "kind": "building", "x": 40, "y": 70, "w": 20, "h": 12, "label": "Visitor centre" },
                                                    { "kind": "label", "x": 20, "y": 30, "label": "A" }] }] },
  "options": [{ "key": "A" }, { "key": "B" }],
  "questions": [{ "no": 16, "prompt": "bird hide", "answer": ["C"], "segment": 7, "evidence": "…", "explanation": "…" }]
}
```

- `figure`：与写作 Task 1 地图同一套格式（前端用 `NCE.ielts.chart.mount` 渲染），但 `maps` 只要 **1 张**；`kind` 取 `building / road / park / water / car-park / label`，坐标 0–100，`x + w`、`y + h` 不超过 100，非 `label` 的 `w`、`h` 大于 0。
- `options`：`[{ key, text? }]`，`key` 为单个大写字母；`text` 可省（地图题的选项就是图上的字母）。**每个 `key` 都必须在图上以 `kind: "label"`、`label` 恰好等于该字母的地物出现**；选项至少比题数多 2 个（真考 8 个字母配 5 题）。
- 题目字段与 `matching` 相同（`prompt` 为地点名，`answer` 一个字母，`evidence` 须出现在 `segment` 原文里）。

### 3.3 `mcq-multi`（Choose TWO）

```json
{
  "type": "mcq-multi", "from": 0,
  "instruction": "Choose TWO letters, A-E.",
  "prompt": "Which TWO problems with the old timetable do the students mention?",
  "options": [{ "key": "A", "text": "…" }, { "key": "B", "text": "…" }, { "key": "C", "text": "…" }, { "key": "D", "text": "…" }, { "key": "E", "text": "…" }],
  "questions": [
    { "no": 21, "answer": ["B", "D"], "segment": 2, "evidence": "…", "explanation": "解释 B 为什么对（以及哪些是干扰项）" },
    { "no": 22, "answer": ["B", "D"], "segment": 4, "evidence": "…", "explanation": "解释 D 为什么对" }
  ]
}
```

- 组上 `prompt`（题干）、`options`（3–7 个，真考 5 个）必填；题目上的 `prompt` 可省。
- 一组题数 = 要选的个数（2 或 3）；**组内每题的 `answer` 完全相同**，就是全部正确字母（个数 = 题数，互不重复，都在 `options` 里）。
- 每题的 `segment` / `evidence` / `explanation` 各对应其中一个正确选项（按 `answer` 的顺序：第 1 题讲 `answer[0]`，第 2 题讲 `answer[1]`）；`evidence` 须出现在该 `segment` 原文里。
- **判分**（`gradeSection`）：按题号顺序逐题看作答字母（大小写不敏感），在正确集合里、且没被本组前面的题用过才算对。两题都填 B → 只得 1 分；填 D、B → 2 分。单题 `gradeQuestion`（错题复习用）只判「是否在正确集合里」。
- 前端：一组画成一道题干 + 复选框（最多选 题数 个），提交时把选中的字母按字母序依次填给本组题号。

### 3.4 题号与 Part 约定

`PART_TYPES`（不符只给 warning）补：Part 2 加 `mcq-multi`、`map-labelling`；Part 3 加 `mcq-multi`、`flowchart-completion`；Part 4 加 `flowchart-completion`。

## 4. 各模块改动（后端）

| 文件 | 改动 |
|------|------|
| `lib/ielts-listening.js` | 类型常量与 `PART_TYPES`；校验（§3 全部规则，错误信息中文）；`gradeQuestion` 支持组上选项与正确集合；`gradeSection` 对 `mcq-multi` 组内去重；导出一个「本组选项从哪取」的小工具（如 `optionsOf(group, question)`），供其他模块复用，避免各处再写 `g.type === 'mcq' ? q.options : g.options` |
| `routes/ielts.js` | `listeningWrongItems` 的 `answerText` 用上面的工具：多选给出全部正确选项文字，地图题没有文字时为 `null` |
| `lib/ielts-mock.js` | 模考听力复盘取选项同上；题干：`mcq-multi` 用组 `prompt` |
| `lib/ielts-srs.js` | 听力错题复习：选项来源同上；`mcq-multi` 题干用组 `prompt`，并提示「本组有 N 个正确选项，选出其中一个」，作答在正确集合里即算对；`map-labelling` 的复习题带上 `figure`，前端据此画图 |
| `lib/ielts-weakness.js` | 题型标签：流程图填空、地图标注、多选；知识库：流程图 → `st-listening-form-completion`，地图 → `st-listening-matching-maps`，多选 → `st-listening-mcq`；各一句建议；两种新选择题的错误原因归为「选项选错」 |
| 测试 | `scripts/test-ielts-listening.js`、`test-ielts-srs.js`、`test-ielts-weakness.js`、`test-ielts-mock.js` 补用例（判分去重、校验各分支、复习、弱项标签） |

## 5. 各模块改动（前端）

| 文件 | 改动 |
|------|------|
| `public/js/ielts-listening-ui.js` | 三种新题组的作答界面（考试 / 练习模式）、交卷复盘的逐题显示（多选显示「B、D（顺序不限）」）；地图用 `NCE.ielts.chart.mount` 画（页面离开时 dispose）；流程图用纯 HTML/CSS 画方框 + 向下箭头，空格处是输入框；题型标签补齐 |
| `public/js/ielts-mock-ui.js` | 模考听力部分同上（作答与复盘） |
| `public/js/feat-review.js` | 雅思听力错题复习：`mcq-multi` 显示组题干与提示；`map-labelling` 有 `figure` 时画图 |

窄屏（390px）下地图按容器宽度出图、流程框占满宽度，不出现横向滚动。

## 6. 内容

新增 3 个 section（`part2-d.json`、`part3-d.json`、`part4-d.json`），每个 10 题、原创，覆盖三种新题型：

| Part | 场景 | 题组 |
|------|------|------|
| 2 | 湿地自然中心的导览介绍 | mcq-multi 2 题 + mcq 3 题 + map-labelling 5 题 |
| 3 | 两名学生讨论小组项目 | mcq 2 题 + mcq-multi 2 组 4 题 + flowchart-completion 4 题 |
| 4 | 讲座 | flowchart-completion 5 题 + note-completion 5 题 |

## 7. 衡量

- 弱项页按新题型分别统计，专项期两周后看「地图标注」「多选」正确率是否 ≥ 70%。

## 8. 测试与验证

- 后端单测见 §4；`npm run validate` 对新内容 0 错误 0 警告。
- 前端：headless Chrome 检查页覆盖三种题组的作答、提交映射（多选按字母序填题号）、复盘显示、窄屏无横向滚动。
- 端到端：临时档案 + 真实服务交卷，判分（含多选去重）与弱项统计结果符合预期。

## 9. 进展（2026-11-26）

已按本文实现：后端、前端分别在两个 worktree 并行开发后 cherry-pick 合入，内容与收尾在主工作区。变更记录见 [2026-11-26 雅思听力三种新题型](../changes/2026-11-26-雅思听力三种新题型.md)。实现时明确下来的细节：

- **地图字母**：`ielts-chart.js` 把单个大写字母的 `label` 画成加粗圆圈标记（写作地图没有单字母标注，不受影响）；区域名改用单独的 `label` 放在区域上方，避免和区域中心的字母重叠。
- **校验补充**：`label` 地物的 `w` / `h` 可省（按 0）；非 `label` 地物的 `label` 可为空串；`figure.title`、`compass` 可省；流程图固定步骤的 `text` 不能含 `___`；`prompt` / `flow` / `figure` 写在不对应的题型上一律报错。
- **接口**：`publicSection` 额外下发多选组的 `prompt`、流程图的 `flow`、地图的 `figure`；新增 `promptOf(group, question)` 与 `optionsOf(group, question)` 两个工具，各模块统一取题干与选项。
- **前端**：多选选第三项时撤销这次勾选并提示，不做「选满即禁用」（避免与模考交卷锁定的禁用状态混淆）；听力复盘里地图题也画地图；模考出分后的错题不画地图（复盘数据不带 `figure`）。
- **记录页**：多选错题在正确答案后注明「（顺序不限）」。
- 建议后续补的校验（本次未做）：图上字母不在选项里 / 重复时警告；图上直接标出某题地点名时报错（等于泄题）；`flow` 里题号非递增时警告。
