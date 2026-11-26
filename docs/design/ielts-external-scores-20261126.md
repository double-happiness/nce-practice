# 雅思：剑雅成绩录入与整套成绩估分

日期：2026-11-26
状态：实现中

## 1. 目标

- **剑雅成绩有地方记**：26 周计划专项期每周做剑雅听力、阅读，冲刺期每周一套剑雅全套模考（计划里的外部任务 `cam-lr`、`cam-mock`）。现在做完只能打勾，分数不进系统，趋势和总分估算都看不到最真实的这部分成绩。
- **总分估算优先用整套成绩**：一套站内模考会把听力 4 个 Part、阅读 3 篇、写作 2 篇分别写进各模块记录。`/ielts/summary` 取「最近 3 条」时只会拿到其中 3 个 Part 的分（每个 Part 才 10 题），写作的 Task 2 也没有双倍权重。模考本身已经算好的四项分数（听力 40 题、阅读 39 题折算、写作加权）反而没用上。

目标用户就是本人（A2 → 7.0，A 类，考试约 2027-05-24），单人自用。

## 2. MVP 范围

| 做 | 不做（后续） |
|----|--------------|
| 录入剑雅成绩：日期、书号 / Test 号或自定义标题、四项可选 | 编辑已录成绩（删掉重录即可） |
| 听力、阅读填原始分 /40 自动换算，也可直接填书后换算表的 band | G 类阅读内置换算表（没有可靠的官方逐分表，要求直接填 band） |
| 保存时可顺便在学习计划里打勾当天的剑雅任务 | 删除成绩时自动取消打勾 |
| 记录页「剑雅」标签：录入表单 + 列表 + 删除 | 剑雅成绩的趋势折线（先看列表与概况） |
| `/ielts/summary` 四项按「整套优先」重算，并返回每项的口径说明 | 学习计划检查点（第 8 / 14 / 20 周）改用整套成绩 |

## 3. 数据：`ielts.json` 新增 `externalTests`

```json
{ "externalTests": [
  { "id": "ext-…", "date": "2026-11-26", "ts": 1764140000000, "examType": "A",
    "book": 18, "test": 2, "title": "",
    "listening": { "raw": 31, "band": 7, "bandFrom": "table" },
    "reading":   { "raw": 27, "band": 6.5, "bandFrom": "table" },
    "writing":   { "band": 6 },
    "speaking":  null,
    "notes": "" }
] }
```

- `date` 是做题日期（可以补录过去的），`ts` 是录入时间；排序先按 `date` 再按 `ts`。
- `examType` 取录入时档案的考试类型。
- 听力 / 阅读：`raw` 0–40 的整数或 `null`；`band` 0–9、步长 0.5；`bandFrom` 为 `table`（按原始分查表）或 `manual`（用户填写）。
- 四项至少有一项；`book` 1–30、`test` 1–4 可缺省；`title` 最长 60 字；`notes` 最长 500 字。
- 最多保留 200 条；读取时逐条校验，结构不合法的丢弃（与其他记录的处理一致）。
- 总分不存，视图里四项齐全时按官方规则现算。

## 4. 换算

- 听力：`lib/ielts-listening.js` 的 `bandFrom40`（A / G 通用）。
- 阅读 A 类：`lib/ielts-reading.js` 的 `bandFrom40`（学术类）。
- 阅读 G 类：没有内置表，必须填 `band`，否则 400。
- 同时填了 `raw` 和 `band` 时以 `band` 为准（剑雅每套书后的换算表略有差异）。

## 5. 整套优先的估分口径

「整套成绩点」：

- 站内模考：任一部分 `state === 'done'` 就算一个点（取该部分的 `band` 与 `submittedAt`），不论整套是否出分或放弃。听力、阅读已是 40 题 / 39 题口径，写作已按 Task 2 双倍加权。
- 剑雅成绩：每条记录里填了的那几项各算一个点。

每项的取值规则（`lib/ielts-estimate.js`，纯函数）：

1. 近 **42 天**（6 周）内有整套成绩点 → 取其中最近 ≤ 3 个的平均（`basis: 'full'`）。
2. 否则用单项成绩：听力 / 阅读为考试模式记录最近 3 次，**排除模考写入的记录**（`mockId`，否则一套模考会被拆成多个单项重复计算）；写作 / 口语为自评记录最近 3 次，同样排除模考写入的记录（`basis: 'single'`）。
3. 单项也没有、但有更早的整套成绩点 → 取最近 ≤ 3 个整套的平均，标注已超过 6 周（`basis: 'full'`、`stale: true`）。
4. 都没有 → `null`。

均分保留两位小数；总分仍是四项平均后官方取整（`.25` 进 `.5`、`.75` 进整数），缺项时按已有几项粗估。

## 6. 接口

### 新增（`routes/ielts-external.js`，自动挂载到 `/api`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/ielts/external-tests` | `{ total, items }`，新的在前；每项为视图（含 `displayTitle`、`overall`） |
| POST | `/ielts/external-tests` | body 见下 → `{ ok, item, ticked }`；`ticked` 为顺带打勾的计划任务 key 列表 |
| DELETE | `/ielts/external-tests/:id` | `{ ok, id }`；不存在 404 |

POST body（只允许这些键）：

```json
{ "date": "2026-11-26", "book": 18, "test": 2, "title": "",
  "listening": { "raw": 31 }, "reading": { "raw": 27, "band": 6.5 },
  "writing": { "band": 6 }, "speaking": null,
  "notes": "", "tickPlan": true }
```

- `date`：有效日期，不能是未来，也不能早于 730 天前。
- `tickPlan`（默认 `false`，前端表单默认勾选）：备考已开启、日期不早于开始备考日时，把该日期所在周的外部任务（`kind: external`）在当天打勾，规则同 `POST /ielts/plan/check`；不满足条件时不报错，`ticked` 为空数组。

### 调整：`GET /ielts/summary`

`listening` / `reading` / `writing` / `speaking` 在原字段（`last3Avg`、`count`、`practiceCount`）之外新增：

- `basis`：`full` | `single` | `null`
- `fullCount`：全部整套成绩点个数
- `stale`：整套成绩是否超过 6 周
- `label`：一句话口径，例如「近 2 次整套成绩均分（站内模考 1 次、剑雅 1 次）」

`count` / `practiceCount` 含义不变（全部考试模式 / 练习模式记录数）。`estimate.note` 写明哪几项用了整套成绩。

## 7. 前端

- `public/js/feat-ielts.js`：请求工具加 `del`。
- `public/js/ielts-history-ui.js`：记录页新增「📘 剑雅」标签（表单 + 列表 + 删除）；成绩概况的每项说明改用后端 `label`。
- `public/js/ielts-plan-ui.js`、`public/js/feat-level.js`：成绩概况的每项说明优先用 `label`（没有时退回原文案）。
- 计划：`data/ielts/plan.json` 的 `cam-lr`、`cam-mock` 加 `"tab": "ielts:history"`；外部任务按钮文字为「录成绩 →」，点击后记录页直接打开「剑雅」标签（通过 `sessionStorage` 传一次性标记）。
- `public/sw.js`：`SW_VERSION` +1。

## 8. 衡量

- 剑雅成绩与站内模考的 band 放在一起看：同一项长期相差 0.5 以上，说明站内题偏易或偏难，需要校准题库难度。
- 每周是否按计划录入剑雅成绩（`externalTests` 按周计数），作为外部资料执行率的参考。

## 9. 测试

`scripts/test-ielts-external.js`（`npm run test:ielts-external`）：

- 纯函数：请求体校验（缺项、越界、未知字段、G 类阅读缺 band）、换算、记录清洗、整套成绩点提取、四种口径分支（近 6 周整套、单项、过期整套、无数据）、`label` 文案。
- 接口：临时档案里起只挂 `routes/ielts.js` 与 `routes/ielts-external.js` 的 Express：增删查、400 / 404、`tickPlan` 打勾、`/ielts/summary` 按整套优先计算。
- `scripts/test-ielts-api.js` 里 summary 的断言随新增字段更新。
