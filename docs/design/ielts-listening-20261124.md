# 雅思听力模块技术方案（2026-11-24）

> 雅思备考 MVP（`docs/design/ielts-prep-mvp-20261124.md`）的二期补充：新增「🎧 听力」子页。
> 系统只给本人自学用，不考虑多用户、账号和分享。

## 1. 目标与非目标

**目标**
1. 8 个原创 section（Part 1–4 各 2 个），每个 10 题，模仿雅思听力四个部分的文体与题型。
2. 浏览器 `speechSynthesis` 朗读原创脚本，**不做任何音频文件**。
3. 考试模式（读题 30 秒 → 整段只播一次 → 检查 30 秒 → 自动交卷）与练习模式（暂停、逐段重播、调语速）。
4. 服务端判分（规则与雅思一致）+ 估算 band；交卷后逐题复盘，脚本高亮答案所在段，点任意段重听。
5. 作答记录存进当前档案的 `ielts.json`，学习活动来源记 `ielts-listening`。

**非目标**：真人录音或音频文件；剑桥真题；多选题（Choose TWO）、地图 / 流程图标注题；语音识别；把听力并入总分估算（由协调方决定是否接入 `/ielts/summary`）。

## 2. 音频方案（TTS）

| 项 | 做法 |
|---|---|
| 引擎 | `window.speechSynthesis` + `SpeechSynthesisUtterance`，零依赖 |
| 声音挑选 | 只用英文声音（`lang` 以 `en` 开头），排除 macOS 趣味声音（与 `app.js` 的 `NOVELTY_VOICE` 同一份名单）；排序优先 **en-GB**，其次高质量声音名（Daniel / Serena / Kate / Google UK…），离线时优先本地声音 |
| 说话人 | 每个说话人按 `gender` 分配**不同的 voice**：先找同性别且未被占用的声音，再找性别未知且未被占用的；声音不够时复用，用 **pitch** 区分（性别不符：男 0.7 / 女 1.35；同一声音被多人复用时再乘 1 / 1.18 / 0.86 / 1.32） |
| 旁白 | 考试模式的开场介绍、读题提示、结束提示由旁白朗读，优先用未被说话人占用的声音 |
| voices 异步 | `getVoices()` 首次常为空：用 `addEventListener('voiceschanged')`（**不覆盖** `app.js` 的 `onvoiceschanged`）+ 250ms 轮询，最多等 2.5 秒 |
| 语速 | 练习模式 0.85–1.15，步长 0.05，存 localStorage（按档案前缀）；考试模式固定 1.0 |
| 分段与停顿 | 按 `segments` 逐段播放；同一人连续两段间隔 350ms，换人间隔 650ms。每段再按句切成 ≤200 字符的小块逐块朗读（规避 Chrome 长句朗读约 15 秒被截断的问题），每块带看门狗，`onend` 不触发时按估算时长兜底继续 |
| 打断 | 每次开始 / 停止朗读都递增 token，旧回调一律作废；暂停 = `cancel()`，继续时从**本段开头**重播（`speechSynthesis.pause/resume` 在 Chrome / Android 上不可靠） |
| 不可用 | 浏览器不支持 TTS，或一个英文声音都没有：页面明确提示，**考试模式禁用**，练习模式默认展开脚本，可以直接看脚本做题 |

## 3. 内容数据 `data/ielts/listening/*.json`

- 每个文件是 **JSON 数组**，元素为一个 section；目录下 `*.json` 自动合并，另读 `data/ielts/local/listening/`（不入库，schema 相同）。
- 目录跟随 `lib/ielts.js` 的 `dataDir()`，测试可用 `IELTS_DATA_DIR` 覆盖。
- 英文中的引号一律用直引号；脚本、题目、解析全部原创，不照搬剑桥真题。

```jsonc
{
  "id": "l1-sports-centre",            // 全局唯一，小写字母 / 数字 / 连字符，2–64 位
  "part": 1,                           // 1–4
  "title": "Joining a sports centre",
  "titleCn": "加入社区运动中心",
  "intro": "You will hear a man phoning a sports centre to join as a new member.",  // 考试模式开场旁白
  "speakers": [                        // 用于选择声音
    { "id": "rec",  "name": "Receptionist", "gender": "female" },   // gender: female | male
    { "id": "mark", "name": "Mark",         "gender": "male" }
  ],
  "segments": [                        // 逐段播放；下标从 0 起
    { "speaker": "rec", "text": "Good morning, Riverside Sports Centre..." }
  ],
  "groups": [
    {
      "type": "form-completion",       // 见题型枚举
      "from": 0,                       // 本组音频从第几段开始；第一组必须为 0，之后严格递增
                                       // 本组音频范围 = [from, 下一组 from − 1]，考试模式按组「读题 → 播放」
      "instruction": "Complete the form below.",
      "wordLimit": "ONE WORD AND/OR A NUMBER",   // 填空类必填，见字数限制枚举
      "title": "Riverside Sports Centre - New member form",  // 可选：表格 / 笔记 / 摘要标题
      "options": [ { "key": "A", "text": "..." } ],         // 仅 matching：本组共享选项
      "optionsTitle": "Features",                           // 可选：matching 选项框标题
      "questions": [
        { "no": 1,                     // 题号，全 section 按顺序连续；Part p 一般从 (p−1)×10+1 开始
          "heading": "Personal details",               // 可选：笔记 / 表格内的小标题
          "prompt": "Surname: ___",                    // 填空题恰好包含一个 ___（三个及以上下划线）
          "answer": ["Brennan"],                       // 可接受写法；数字的不同写法都要列，如 ["3", "three"]
          "explanation": "……（中文解析）",
          "segment": 5 },                              // 答案出现在第几段（0 起），复盘时高亮
        { "no": 11, "prompt": "Why was the castle built?",
          "options": [ { "key": "A", "text": "..." }, { "key": "B", "text": "..." }, { "key": "C", "text": "..." } ],  // 仅 mcq
          "answer": ["C"],
          "evidence": "to control the crossing over the River Tane",   // 选择 / 匹配题必填：原文依据，必须出现在 segment 文本里
          "explanation": "……", "segment": 1 }
      ]
    }
  ]
}
```

**题型枚举**（`groups[].type`）与各部分的约定：

| 部分 | 文体 | 题型 |
|---|---|---|
| Part 1 | 两人日常对话 | `form-completion`、`note-completion`（含拼写人名、数字、日期、地址） |
| Part 2 | 日常独白 | `mcq`、`matching` |
| Part 3 | 2–3 人学术讨论 | `mcq`、`matching`、`sentence-completion` |
| Part 4 | 学术讲座 | `note-completion`、`summary-completion` |

填空类 = `form-completion` / `note-completion` / `sentence-completion` / `summary-completion`；选择类 = `mcq` / `matching`。

**字数限制枚举**（`wordLimit`，即题目中显示的 "Write ... for each answer."）：

| wordLimit | 词数上限 | 另可带 1 个数字 |
|---|---|---|
| `ONE WORD ONLY` | 1 | 否 |
| `ONE WORD AND/OR A NUMBER` | 1 | 是 |
| `NO MORE THAN TWO WORDS` | 2 | 否 |
| `NO MORE THAN TWO WORDS AND/OR A NUMBER` | 2 | 是 |
| `NO MORE THAN THREE WORDS` | 3 | 否 |
| `NO MORE THAN THREE WORDS AND/OR A NUMBER` | 3 | 是 |

计数口径：按空白切分；连字符词算 1 个词（`off-peak`、`twenty-eight`）；**数字**指以数字为主体的记号，可带货币符号、千分位、小数点 / 冒号 / 斜杠和后缀（`15`、`1,500`、`7:45`、`£32`、`15th`、`25%`、`3pm`）。「不带数字」的限制里，数字按词计；拼写出来的数字（`fifteen`）按词计。

### 3.1 内容校验 `validateListeningContent(items)` → `{ errors, warnings }`

**errors**（有 error 的 section 在运行时被跳过，不下发）
- schema：`id` / `part` / `title` / `speakers` / `segments` / `groups` / `instruction` / `prompt` / `answer` / `explanation` / `segment` 齐全且类型正确；`gender` 只能是 female / male
- id 全局唯一；说话人 id 在 section 内唯一；`segments[].speaker` 必须在 `speakers` 里
- 题号不重复且按顺序连续
- `from`：第一组为 0，严格递增，在段下标范围内
- `segment` 下标有效，且落在本组音频范围内（考试模式按组播放，答案不能在别的组的音频里）
- 填空题：`prompt` 恰好一个 `___`；`wordLimit` 合法；**每个可接受答案都不超过字数限制**；**至少一个可接受写法出现在对应 segment 的文本里**（忽略大小写、多余空白；`32` 能匹配 `£32`；按词边界比较，`art` 不会匹配 `start`；再按去掉全部空白比一次）
- 选择题：选项为 `{ key: 单个大写字母, text }` 且字母不重复（mcq 每题至少 3 个，matching 每组至少 3 个）；`answer` 恰好 1 个且在选项里；`evidence` 必填且出现在对应 segment 的文本里

**warnings**：缺 `titleCn` / `intro`；每个 section 不是 10 题；Part 的题型、人数不符合上表约定（Part 1 两人、Part 2 / 4 独白、Part 3 两到三人）；题号起点不是 (part−1)×10+1；答案出现顺序早于上一题；单段超过 700 字符；说话人没有台词；同一题有重复写法。

## 4. 判分与 band

**判分规则**（`gradeQuestion`，与雅思一致）
1. 空答案判错。
2. 填空题先查字数：**超过 wordLimit 判错**（返回 `overLimit: true`）。
3. 归一化后与可接受写法表逐个比较，相等即对：NFKC（全角转半角）→ 弯引号转直引号、各种破折号转 `-` → 小写 → 去千分位逗号（`1,500` = `1500`）→ 货币符号后的空格去掉（`£ 32` = `£32`）→ 多个空白合成一个 → 去掉首尾空白和首尾标点（`. , ; : ! ? " ' ( )`）。
4. **拼写必须正确**：不做模糊匹配、不做词形还原，单复数不同即判错（与雅思一致）；数字与英文写法互认只靠可接受写法表（如 `["28", "twenty-eight"]`）。
5. 选择题：字母不区分大小写，须与答案字母一致。

**band 估算**：原始分按比例折算到 40 题（`round(raw / total × 40)`），再查下表（雅思听力常见的近似换算表，**只是近似值**；10 题样本小，单次估算波动大，仅供参考）。

| 40 题原始分 | band | 40 题原始分 | band |
|---|---|---|---|
| 39–40 | 9.0 | 16–17 | 5.0 |
| 37–38 | 8.5 | 13–15 | 4.5 |
| 35–36 | 8.0 | 10–12 | 4.0 |
| 32–34 | 7.5 | 8–9 | 3.5 |
| 30–31 | 7.0 | 6–7 | 3.0 |
| 26–29 | 6.5 | 4–5 | 2.5 |
| 23–25 | 6.0 | 2–3 | 2.0 |
| 18–22 | 5.5 | 0–1 | 1.0（雅思 0 分表示缺考，这里最低记 1.0） |

10 题时可能的折算值：0→1.0、4→2.5、8→3.5、12→4.0、16→5.0、20→5.5、24→6.0、28→6.5、32→7.5、36→8.0、40→9.0。

## 5. 后端 API（`routes/ielts-listening.js`，自动挂载到 `/api`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ielts/listening` | `{ total, items: [ { id, part, title, titleCn, questionCount, types, speakerCount, segmentCount, scriptWords, attempts, best: { raw, total, band, mode, ts } \| null, lastTs } ], skipped, bandNote }`；`best` 取正确率最高的一次，同分取最近一次；`skipped` 为数据有误被跳过的 section 数 |
| GET | `/ielts/listening/:id` | 题目 + 脚本（`speakers`、`segments`、`groups`），**不含** `answer` / `explanation` / `segment` / `evidence` |
| POST | `/ielts/listening/:id/submit` | body `{ answers: { "1": "Brennan", "11": "C" }, durationSec, mode: "exam" \| "practice" }` → `{ ok, entry, raw, total, raw40, band, bandNote, mode, durationSec, isBest（严格高于此前最好成绩才为 true）, results: [ { no, correct, yours, overLimit, answer: [可接受写法], explanation, segment, evidence? } ] }` |

**输入校验**（非法返回 400 `{ error }`，未知 id 返回 404）
- `:id` 须匹配 `^[A-Za-z0-9_-]{1,64}$`，否则 400
- body 必须是对象；`mode` 必填，只能是 `exam` / `practice`
- `answers` 必填，必须是对象；键只能是本 section 的题号（字符串），值为字符串或 null，单个答案最长 100 字符
- `durationSec` 可省略（记 0），否则须是 0–7200 的整数

**脚本随题目下发**：前端要用脚本做 TTS，所以 `GET /:id` 必须带 `segments`，懂行的人在开发者工具里能看到原文。本系统只给本人自学用，这一点可以接受；答案、解析、答案段落仍只在交卷后由服务端返回。

**学习活动**：交卷落盘后记一次 `activity.record(raw/total ≥ 0.6, 'ielts-listening')`，用 try/catch 包住，失败只打日志，不影响已成功的提交。

## 6. 用户数据（`data/profiles/<id>/ielts.json` 的 `listenings` 数组）

```jsonc
{ "listenings": [
    { "id": "uuid", "sectionId": "l1-sports-centre", "part": 1, "mode": "exam",
      "raw": 8, "total": 10, "band": 7.5, "durationSec": 412,
      "answers": { "1": "Brennan", "2": "July" }, "ts": 1764000000000 } ] }
```
- 读写走 `lib/ielts.js` 的 `loadUser` / `saveUser`（`loadUser` 保留未知顶层字段，其他模块保存时不会丢 `listenings`）。
- 读取时自行校验：`sectionId` / `mode` / `raw` / `total` / `band` / `ts` 任一不合法的记录丢弃。
- 最多保留最近 **300** 条。
- `ielts.json` 已在备份范围内（`routes/backup.js` 的 `KEYS`），无需额外接入。

## 7. 前端（`public/js/ielts-listening-ui.js`）

注册：`NCE.ielts.registerPage('listening', { meta: { label: '听力', icon: '🎧', before: 'writing' }, render, resume, pause, leave })`；`index.html` 在 `ielts-history-ui.js` 后加载，早于 `feat-level.js`（壳层首次渲染前注册）。

| 阶段 | 内容 |
|---|---|
| 列表 | 顶部 TTS 状态（英文声音数 / 英音数，或不可用提示 + 重新检测）；按 Part 1–4 分组，每条显示题型、脚本词数、做过几次、最好成绩 |
| 准备页 | 题目信息、说话人和分配到的声音、两种模式说明；没有 TTS 时考试模式按钮禁用并说明原因 |
| 考试模式 | 旁白读开场 → 每组题前 30 秒读题（倒计时）→ 本组音频只播一次，不能暂停回放，边听边作答（当前组高亮）→ 下一组前旁白提示再读题 30 秒 → 全部播完旁白提示 → 30 秒检查（可提前交卷）→ 自动交卷 |
| 练习模式 | 播放 / 暂停、上一段 / 重播本段 / 下一段、段号条（点哪段从哪段播）、语速 0.85–1.15（播放中改语速从本段重播）、脚本显示开关（当前段高亮，点段落播放）；交卷前有空题时提示再点一次 |
| 复盘 | 原始分、40 题折算分、估算 band（标注近似值）；逐题对错、你的答案（超字数单独标出）、正确答案及其他可接受写法、中文解析、「原文」定位；脚本展开，答案所在段高亮并标题号，答案词用 `<mark>` 标出，点任意段重听 |

**朗读失败**：`not-allowed`（浏览器自动播放策略，页面还没有用户点击）单独提示「请再点一次播放」；其他错误提示检查系统英文语音或打开脚本。

**生命周期**（不能留下还在朗读的声音）
- `leave()`（切走子页）：`speechSynthesis.cancel()` + 清所有定时器，回到列表。
- `pause()`（切到别的标签，壳层通过 MutationObserver 调用）、`document.visibilitychange` 变为隐藏、`pagehide`：同样 cancel + 清定时器；练习模式变为「已暂停」；考试模式变为「已中断」——音频只能播一次，回来后可选「转为练习模式继续」或「放弃本次」；检查阶段被打断则停在检查阶段，手动交卷。
- `resume()`：做题 / 复盘中回到页面保留现场（返回 true），列表页重新渲染。

**安全与适配**：所有动态内容经 `NCE.escapeHtml` 转义（属性一律双引号）；脚本高亮先按原文定位再逐片转义；颜色全部用主题变量（`--card` `--ink` `--muted` `--brand` `--ok` `--bad` `--border`），深色主题下输入框沿用 `ie-input` 的 midnight 样式；380px 宽时选项、输入框、段号条全部可换行，不出现横向滚动。

## 8. 文件清单

| 文件 | 说明 |
|---|---|
| `docs/design/ielts-listening-20261124.md` | 本文 |
| `lib/ielts-listening.js` | 内容加载、`validateListeningContent`、判分、band 估算、作答记录清洗 |
| `data/ielts/listening/part1.json` … `part4.json` | 8 个原创 section |
| `routes/ielts-listening.js` | 3 个接口 |
| `public/js/ielts-listening-ui.js` | 听力子页 |
| `public/index.html` | 只加一行 `<script src="js/ielts-listening-ui.js"></script>` |
| `scripts/test-ielts-listening.js` | 判分、band、内容校验测试（Node 自带 assert） |

## 9. 需要协调方接入（本线不改这些文件）

1. `scripts/validate.js`：在 `validate()` 的雅思校验之后追加
   ```js
   const listening = require('../lib/ielts-listening');
   const lr = listening.validateAll(); // = 读取问题 + validateListeningContent(原始条目)
   errors.push(...lr.errors);
   warnings.push(...lr.warnings);
   ```
2. `package.json`：`"test:ielts-listening": "node scripts/test-ielts-listening.js"`。
3. `routes/plan.js`：`SOURCE_LABEL` 加 `'ielts-listening': '雅思听力'`；「听」技能的 `sources` 改为 `['dictation', 'ielts-listening']`。
4. `scripts/validate.js` 的 `IELTS_PLAN_SOURCES` 加 `ielts-listening`，`IELTS_PLAN_TABS` 加 `ielts:listening`；之后 `data/ielts/plan.json` 才能引用。
5. `data/ielts/plan.json` 可加的任务（示例）：
   - 基础期 W5–8：`{"key":"ielts-listening","label":"雅思听力 Part 1 · 1 个 section（练习模式，错题逐段重听）","kind":"internal","source":["ielts-listening"],"target":2,"unit":"个","per":"week","tab":"ielts:listening","minutes":30}`
   - 专项期 W9–20：`{"key":"ielts-listening","label":"雅思听力 Part 2–4 · 每周 3 个 section（先考试模式，再练习模式复盘）","kind":"internal","source":["ielts-listening"],"target":3,"unit":"个","per":"week","tab":"ielts:listening","minutes":60}`
   - 冲刺期 W21–26：`{"key":"ielts-listening","label":"雅思听力考试模式 · 每周 4 个 section（只听一遍）","kind":"internal","source":["ielts-listening"],"target":4,"unit":"个","per":"week","tab":"ielts:listening","minutes":60}`
6. `public/sw.js`：`PRECACHE_URLS` 加 `'/js/ielts-listening-ui.js'`，`SW_VERSION` +1。
7. 可选：`/ielts/history`、`/ielts/summary`、记录子页接入 `listenings`（本线只在听力列表显示最好成绩）。

## 10. 任务拆解

- T1 设计文档与数据结构（本文）
- T2 `lib/ielts-listening.js`：内容加载、校验、判分、band 估算、记录清洗
  - [x] 已实现 2026-11-24
- T3 原创内容：Part 1–2（4 个 section）
  - [x] 已实现 2026-11-24
- T4 原创内容：Part 3–4（4 个 section）
  - [x] 已实现 2026-11-25
- T5 `routes/ielts-listening.js`：列表、题目、交卷
  - [x] 已实现 2026-11-25
- T6 `public/js/ielts-listening-ui.js` + `index.html` 一行 script
  - [x] 已实现 2026-11-25
- T7 `scripts/test-ielts-listening.js`
  - [x] 已实现 2026-11-25
