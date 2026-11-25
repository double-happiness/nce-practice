# 新概念英语 · 练习题库系统

一个与《新概念英语》1–4 册教材匹配的在线练习系统，支持 **按册 / 按课程进度 / 按语法点** 三维度出题，自动判分、错题本、正确率统计与错题重练。

## 快速开始

```bash
cd nce-practice
npm install      # 安装依赖（仅 express）
# 首次克隆需 Git LFS（原声 MP3 约 550MB，见 docs/原声与发音.md）
git lfs install && git lfs pull   # 若已 clone 但未拉 LFS
npm start        # 默认 http://localhost:3737
# 或指定端口： PORT=8080 npm start
```

浏览器打开对应地址即可使用。

**使用者**可阅读 [docs/用户指南.md](docs/用户指南.md)，或在应用内首页点击 **📖 使用说明**（`/help.html`）。

## 功能

| 功能 | 说明 |
| --- | --- |
| 今日学习（首页） | 学习调度中心：今日目标（含刷题/句型/背单词/词汇测/听写/对话）进度与打卡、到期错题 + 待巩固单词、薄弱语法/句型/对话提示、词汇量基线、继续上次课程 |
| 三维度出题 | 选择册数 → 课程进度单元 → 语法点，任意组合筛选 |
| 多题型 | 单选题（mcq）、填空题（fill，大小写/空格不敏感，可多个可接受答案） |
| 自动判分 | 答案存于后端、下发题目时隐藏，提交后逐题批改并给出**语法解析**；填空判分做宽容归一化（大小写/弯引号/句尾标点/多余空格不敏感，见 `lib/grade.js`） |
| 错题本 | 做错自动收录，答对后自动移出；支持「错题重练」 |
| 学习统计 | 累计题量、正确率、错题数，顶栏实时显示 |
| 进度持久化 | 记录保存在 `data/progress.json`，无需数据库 |
| 教材学习 | 「📖 教材学习」标签页：第一册逐课的重点单词、语法精讲、原创例句、情景理解与记忆方法，可一键「练本课语法」跳转刷题；含 **🎧 原声课文**（英音 MP3 + LRC 点句播放） |
| 单词发音 | 每个单词/例句旁 🔊：**优先新概念英音原声片段** → 真人单词库 → 浏览器 TTS；另有「全部单词连读」 |
| 间隔复习 | 「🔁 间隔复习」：错题按艾宾浩斯遗忘曲线（1/2/4/7/15…天）自动重现，逐题复习并重排到期时间 |
| 生词本 | 「📇 词表」：浏览教材去重词库，☆ 收藏即生词本；翻背/默写请用「背单词」 |
| 听写 | 「🎧 听写」：选课→放音→打出句子→逐词批改高亮（LCS 对齐，漏词/多词只错一处不整句飘红），记录最好成绩；计入今日目标 |
| 薄弱分析 | 「📊 薄弱分析」：语法热力图 + 按课薄弱 + 词汇量基线 + 句型/对话/测验薄弱项 |
| 学习计划 | 「🎯 学习计划」：连续打卡 + 热力图 + 正确率趋势；今日目标统计刷题/句型/背单词/词汇测/听写/对话 |
| 背单词 | 「🔤 背单词」：卡片背诵（认识/模糊/不认识自评）+ 默写拼写 + 掌握度追踪；查词请用独立「📕 查词典」 |
| 听力词汇量 | 「👂 听力词汇量」：只听发音 4 选 1；错词可生词本/背诵/默写/间隔复习 |
| 阅读词汇量 | 「📖 阅读词汇量」：看英文 4 选 1；与听力对比，历次独立留档 |
| 总词汇量 | 「🌐 总词汇量」：内置约 2600 词 CEFR 分级，估整体阅读词汇量 |
| 词汇趋势 | 「📈 词汇趋势」：听/读/总词汇历次估算折线图 |
| 查词典 | 「📕 查词典」：教材 + 全局词库检索；展开可看**固定搭配、课内句型、教材例句**；掌握度、收藏、深链 `#dictionary?q=…` |
| 情景对话 | 「💬 情景对话」：**8 大类 → 73 场景**二级目录，**1202** 组角色扮演（含 **64** 条多环对话链）；答错台词自动进间隔复习 |
| 数据备份 | 「💾 数据备份」：一键导出所有学习数据为单个 JSON 文件、导入恢复；换设备/防丢失。另有服务端每日自动快照到 `data/backups/`（滚动保留 7 份），误操作可整目录拷回恢复 |
| 阶段测验 | 「📝 阶段测验」：选课程区间→限时组卷→交卷出成绩单（总分/正确率/按语法拆解/逐题回看），保存历次成绩，错题自动进复习队列；**第四册**可按 L1–12 / L13–24 / L25–36 / L37–48 一键模考，或全书 40 题模考 |
| 句型转换 | 「🔀 句型转换」：给出中文→译成英文→依次改一般疑问句、否定句、对句子成分提问（特殊疑问句），另有被动语态、间接引语等高级转换；**可按册 + 语法点或剑桥语法单元（EGIU/EGIU2）筛选**；逐步判分（大小写/标点/缩写不敏感）+ 转换链展示 + 按步骤类型统计；答错的步骤自动进入间隔复习队列，训练量计入每日目标 |
| 雅思备考 | 「🎓 雅思备考」（归入「学」组）：备考档案 + 考试倒计时 + 26 周三阶段计划（基础期 / 专项期 / 冲刺期），今日任务可「去做 →」深链到现有功能或雅思子页，剑雅等外部资料任务手动打勾；第 8 / 14 / 20 周检查点给出达标判定与调整建议。子页：总览计划、雅思词汇（约 1200 词，按话题 / CEFR 浏览、卡片背诵、拼写、**搭配练习**、**例句填空**、词汇诊断）、**听力**（8 个原创 section、80 题，浏览器 TTS 朗读，考试 / 练习模式，按雅思规则判分）、**阅读**（6 篇原创文章、78 题、8 种题型，20 分钟考试模式、选中高亮、交卷后定位原文依据句）、写作（74 题：Task 1 图表 / **流程图** / **地图** / 书信 + Task 2，计时写作、四维自评、范文对照）、口语（Part 1 / 2 / 3 共 64 条，计时、浏览器内录音回听、**可选实时转写与流利度指标**、四维自评、参考答案）、记录。学习计划新增「雅思」预设，雅思听力 / 阅读 / 写作 / 口语 / 背词计入今日目标；「🧭 我的水平」CEFR 补齐 B2 / C1 并粗估雅思分数；自有资料可用 `npm run import:ielts` 导入（见 [docs/雅思自有资料导入.md](docs/雅思自有资料导入.md)） |
| 数据校验 | `npm run validate`：检查答案是否在选项内、id 是否重复、字段是否完整；服务启动时自动运行 |

## 架构

```
nce-practice/
├── server.js            # Express 服务：核心 API + 静态托管 + 自动挂载 routes/*
├── lib/
│   ├── store.js         # JSON 读 + 原子写（防并发损坏）
│   ├── data.js          # 题库/课程/元数据加载与访问
│   ├── grade.js         # 判分统一出口（归一化：大小写/弯引号/句尾标点/空格不敏感）
│   ├── dict.js          # 累计去重词表（背单词 / 听力·阅读词汇量共用口径）
│   ├── vocabtest.js     # 词汇量测试共用逻辑（分层抽样、估算、历史）
│   ├── wordlookup.js    # 教材 + 全局词库统一检索
│   ├── globalvocab.js   # 总词汇量内置词库
│   ├── activity.js      # 学习活动记录（计划统计）
│   ├── snapshot.js      # 学习数据每日滚动快照（data/backups/，保留 7 份）
│   ├── nce-official-util.js  # 原声 LRC 解析与句子归一化
│   ├── ielts.js         # 雅思内容加载（data/ielts/ + local/）与备考数据读写
│   ├── ielts-plan.js    # 雅思 26 周计划：周数映射、今日任务统计、检查点判定
│   ├── ielts-listening.js  # 雅思听力：内容加载与校验、判分（字数限制 / 拼写）、band 估算、作答记录清洗
│   ├── ielts-reading.js    # 雅思阅读：内容加载与校验、8 种题型判分、band 估算、作答记录清洗
│   └── progress.js      # 学习进度读写
├── scripts/
│   ├── validate.js      # 数据校验（npm run validate，启动时自动跑）
│   ├── import-nce-official.js  # 导入英音 MP3 + LRC（npm run import:official）
│   ├── import-ielts-local.js   # 雅思自有资料导入（npm run import:ielts）
│   ├── test-ielts-listening.js # 雅思听力判分与内容校验测试（npm run test:ielts-listening）
│   └── test-ielts-reading.js   # 雅思阅读判分与内容校验测试（npm run test:ielts-reading）
├── routes/              # 功能路由，一功能一文件，自动挂载到 /api
│   ├── srs.js           # 间隔重复复习
│   ├── vocab.js         # 生词本
│   ├── stats.js         # 薄弱点分析
│   ├── plan.js          # 学习计划/打卡
│   ├── words.js         # 背单词词典
│   ├── listenvocab.js # 听力词汇量测试
│   ├── readvocab.js   # 阅读词汇量测试
│   ├── vocaboverview.js # 听/读/总词汇量合并概览与趋势
│   ├── globalvocab.js   # 总词汇量测试 API
│   ├── activity.js      # 学习活动上报
│   ├── dialogue.js      # 情景对话练习
│   ├── transform.js     # 句型转换训练
│   ├── official.js      # 原声课文 API
│   ├── ielts.js         # 雅思备考 API（档案 / 计划 / 词汇 / 写作 / 口语 / 记录）
│   ├── ielts-listening.js  # 雅思听力 API（列表 / 题目与脚本 / 交卷判分）
│   ├── ielts-reading.js    # 雅思阅读 API（列表 / 文章与题目 / 交卷判分）
│   └── backup.js        # 数据备份 导出/导入
├── data/
│   ├── meta.json        # 册、单元(课程进度)定义
│   ├── official/        # 原声课文 LRC 索引（passages.json）
│   ├── questions.json   # 题库基础文件（可持续扩充）
│   ├── lessons.json     # 教材学习基础文件（可持续扩充）
│   ├── questions/       # 题库分片目录（*.json 自动合并，一批一文件）
│   ├── lessons/         # 课程分片目录（*.json 自动合并，一批一文件）
│   ├── articles/          # 精读短文分片（听写/教材「原文」标签）
│   ├── dialogues/       # 情景对话分片（按场景分类）
│   ├── transforms/      # 句型转换练习分片目录（*.json 自动合并）
│   ├── ielts/           # 雅思内容（全局共享、入库，*.json 自动合并）
│   │   ├── vocab/       # 雅思词汇：学术通用 / 社会类话题 / 自然科技类话题，共 7 个分片
│   │   ├── writing/     # 写作题库：Task 2 / Task 1 A 类（图表、流程图、地图）/ Task 1 G 类书信
│   │   ├── speaking/    # 口语题库：Part 1 / Part 2 题卡 + Part 3 追问
│   │   ├── listening/   # 听力：part1–part4.json，每个 section 含说话人、逐段脚本与题组
│   │   ├── reading/     # 阅读：easy / medium / hard.json，每篇 A–G 7 段 + 13 题
│   │   ├── rubrics.json # 写作、口语四维评分说明（4–8 分五档，自行概括）
│   │   ├── plan.json    # 26 周计划模板 + 检查点
│   │   └── local/       # 自有资料（.gitignore，不入库；子目录 vocab / writing / speaking / listening / reading）
│   ├── progress.json    # 学习记录（运行时生成）
│   ├── srs.json         # 间隔复习队列（运行时生成）
│   └── vocab.json       # 收藏生词（运行时生成）
└── public/              # 前端（原生 HTML/CSS/JS，零构建）
    ├── index.html
    ├── styles.css
    ├── app.js           # 核心 + window.NCE（api/speak/registerFeature 等）
    ├── audio/
    │   ├── nce/         # 276 课英音 MP3（Git LFS，见 docs/原声与发音.md）
    │   ├── official-segments.json  # LRC 句子时间轴
    │   └── pronunc/     # Wikimedia 真人单词发音
    └── js/              # 功能模块，一功能一文件，自注册标签页
        ├── feat-dictionary.js  # 教材词典
        ├── feat-review.js     # 间隔复习
        ├── feat-vocab.js      # 生词本
        ├── feat-dictation.js  # 听写
        ├── feat-stats.js      # 薄弱点分析
        ├── feat-plan.js       # 学习计划/打卡
        ├── feat-words.js      # 背单词词典
        ├── feat-listenvocab.js # 听力词汇量测试
        ├── feat-readvocab.js   # 阅读词汇量测试
        ├── feat-globalvocab.js   # 总词汇量测试
        ├── feat-vocabtrend.js    # 词汇趋势
        ├── vocabtest-ui.js     # 听/读/总词汇量共用 UI
        ├── feat-dictionary.js  # 跨册查词典
        ├── feat-dialogue.js    # 情景对话
        ├── feat-transform.js  # 句型转换训练
        ├── feat-ielts.js      # 雅思备考壳层 + 子导航 + 开启引导
        ├── ielts-plan-ui.js   # 雅思总览计划（倒计时 / 今日任务 / 检查点）
        ├── ielts-vocab-ui.js  # 雅思词汇浏览、背诵、拼写、搭配练习、例句填空、诊断
        ├── ielts-listening-ui.js # 雅思听力（TTS 朗读 / 考试与练习模式 / 复盘高亮答案段）
        ├── ielts-reading-ui.js   # 雅思阅读（计时 / 选中高亮 / 草稿 / 原文定位与解析）
        ├── ielts-writing-ui.js  # 雅思写作（计时 / 字数 / 自评 / 范文）
        ├── ielts-chart.js     # Task 1 图表 SVG 渲染（bar / line / pie / table / process 流程图 / map 地图）
        ├── ielts-speaking-ui.js # 雅思口语（Part 1/2/3 / 录音回听 / 可选实时转写与流利度 / 自评）
        ├── ielts-history-ui.js  # 雅思记录（写作、口语历史与趋势；口语记录含转写与指标）
        └── feat-backup.js     # 数据备份
```

技术选型原则：**零构建、无原生依赖**。后端仅依赖 express，存储用 JSON 文件，前端为原生三件套，`npm install && npm start` 即可运行。

### 可扩展的模块化接缝
- **后端**：在 `routes/` 新建 `xxx.js`（导出 Express Router），server.js 启动时自动挂载到 `/api`，无需改动 server.js。
- **前端**：在 `public/js/` 新建 `feat-xxx.js`，调用 `window.NCE.registerFeature({id,label,icon,onShow})` 即自动添加标签页与面板；可用 `NCE.api / speak / enOnly / escapeHtml`。在 index.html 加一行 `<script>` 引入即可。

### 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/meta` | 册/单元/各册语法点/题量分布 |
| GET | `/api/questions?book=&lessonMin=&lessonMax=&grammar=&type=&limit=&random=1&countOnly=1` | 按条件出题（不含答案）；`countOnly=1` 只返回题数 |
| POST | `/api/grade` | 提交 `{answers:[{id,response}]}`，返回逐题判分+解析并记录进度 |
| GET | `/api/progress` | 学习总览统计 |
| GET | `/api/wrong` | 当前错题本题目 |
| POST | `/api/progress/reset` | 清空进度 |

- 所有 `/api` 接口：请求体不是合法 JSON 时返回 **400** `{ "error": "请求体不是合法的 JSON" }`（以前是 500）；请求体超过 10MB 返回 413。

### 雅思备考 API（`routes/ielts.js`）

用户数据按档案隔离，存 `data/profiles/<档案id>/ielts.json`（已纳入档案文件与数据备份）。未开启备考时 `GET /api/ielts/profile` 返回默认档案并带 `active: false`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/ielts/profile` | 备考档案 + 派生信息 `derived: { daysLeft, totalWeeks, currentWeek, phase, templateWeek }` |
| POST | `/api/ielts/profile` | 部分更新 `{ active, examType: A\|G, examDate: YYYY-MM-DD, target, baseline }`，逐字段校验，非法返回 400 `{ error }`；首次激活写入 `startDate` |
| GET | `/api/ielts/plan` | 阶段、当前周（已映射到模板）、今日任务（含 `done` / `met`）、后 2 周概要、检查点状态与建议、时间线说明 |
| POST | `/api/ielts/plan/check` | `{ date, taskKey, done }`，只用于外部资料任务（`kind: external`）手动打勾 |
| GET | `/api/ielts/vocab?topic=&cefr=&q=&limit=&offset=` | 雅思词表分页检索，附话题统计和每词掌握度（来自背单词） |
| GET | `/api/ielts/vocab-check` | 雅思词汇诊断出题：B1 / B2 / C1 各抽 10 词，4 选 1 中文释义；答案留在服务端内存，30 分钟过期 |
| POST | `/api/ielts/vocab-check` | 提交诊断 `{ quizId, answers }` → 各段覆盖率、整体覆盖率、错词；活动来源记 `ielts-vocab` |
| GET | `/api/ielts/writing?task=&variant=&topic=&qtype=` | 写作题目列表（不含范文），每条带本人提交次数和最高分 |
| GET | `/api/ielts/writing/:id` | 完整题目，含范文 |
| POST | `/api/ielts/writing/submit` | `{ promptId, text, durationSec, selfScores }` → 服务端统计字数、计算 band、给出字数不足提示；活动来源记 `ielts-writing` |
| GET | `/api/ielts/speaking?part=` | 口语题目列表（Part 2 条目带 Part 3 题数） |
| GET | `/api/ielts/speaking/:id` | 完整条目（含参考答案） |
| POST | `/api/ielts/speaking/submit` | `{ itemId, part, durationSec, selfScores, notes, transcript?, metrics? }` → band；活动来源记 `ielts-speaking`（不接收录音）。`transcript` 为实时转写文字（≤ 6000 字符），`metrics` 只收 `words` / `wpm` / `fillers` / `repeats` / `longPauses` / `connectives` 六个非负数值字段，非法返回 400 |
| GET | `/api/ielts/rubrics` | 写作 / 口语四维评分说明 |
| GET | `/api/ielts/history?type=writing\|speaking&limit=` | 写作或口语历史记录，倒序 |
| GET | `/api/ielts/summary` | 写作 / 口语近 3 次自评均值、最近一次词汇诊断、雅思分数粗估；供总览、水平页、首页使用 |

- **band 计算**：写作、口语自评取四维平均后**向下取整到 0.5**（自评偏乐观，取保守值）；总分估算按官方规则四舍五入到 0.5（.25 进为 .5，.75 进为整数）。
- **计划周数**：实际周数 = ceil((考试日 − 开始日) / 7)，限制在 4–52 周；第 i 实际周映射到模板第 round((i−1)×26/实际周数)+1 周，改考试日后计划自动压缩或拉伸。
- **今日完成数**：`lib/ielts-plan.js` 读取刷题进度、句型转换记录和活动日志，按任务的 `source` 统计当天次数；`routes/plan.js` 只追加「雅思」预设与 `ielts-writing`、`ielts-speaking` 来源。
- **录音**：只在浏览器内存里（MediaRecorder + blob URL），不上传、不落盘；服务端只存作答时长和自评分。
- **实时转写（可选）**：口语页的「实时转写」默认关闭，勾选后用浏览器 Web Speech API（`en-US`）识别，Chrome 会把作答语音发到 Google 的在线识别服务；录音文件仍只在页面内存里。转写文字和流利度指标随自评提交，存进 `ielts.json` 的口语记录。

### 雅思听力 API（`routes/ielts-listening.js`）

作答记录存在当前档案 `ielts.json` 的 `listenings` 数组（最多保留 300 条）。设计见 [docs/design/ielts-listening-20261124.md](docs/design/ielts-listening-20261124.md)。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/ielts/listening` | section 列表 `{ total, items, skipped, bandNote }`；每条带 Part、题型、题数、说话人数、脚本词数、作答次数和最好成绩；`skipped` 为数据有误被跳过的 section 数 |
| GET | `/api/ielts/listening/:id` | 题目与脚本（`speakers`、`segments`、`groups`），供前端 TTS 朗读；**不含**答案、解析和答案所在段 |
| POST | `/api/ielts/listening/:id/submit` | `{ answers: { "题号": "答案" }, durationSec, mode: exam\|practice }` → 原始分、`raw40`（折算到 40 题）、估算 band、`isBest`、逐题结果（对错、是否超字数、全部可接受写法、中文解析、答案所在段）；活动来源记 `ielts-listening` |

- **输入校验**：`:id` 格式非法 400、不存在 404；`mode` 必填；`answers` 的键只能是本 section 的题号，单个答案最长 100 字符；`durationSec` 为 0–7200 的整数（可省略）。
- **判分**：空答案判错；填空题超过字数限制直接判错；归一化（大小写、全角半角、弯引号、千分位逗号、首尾标点）后与可接受写法逐个比较，**不做拼写纠错**，单复数不同判错；数字的各种写法（如 `28` / `twenty-eight`、`7:45` / `7.45`）由题库逐条列出。
- **band**：原始分按比例折算到 40 题，查雅思听力常见近似换算表；10 题样本小，仅供参考。

### 雅思阅读 API（`routes/ielts-reading.js`）

作答记录存在当前档案 `ielts.json` 的 `readings` 数组（最多保留 300 条）。设计见 [docs/design/ielts-reading-20261124.md](docs/design/ielts-reading-20261124.md)。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/ielts/reading` | 文章列表 `{ total, items, topics, bandNote }`，按易 → 中 → 难排序；每篇带难度、话题、词数、题数、题型、作答次数和最好成绩 |
| GET | `/api/ielts/reading/:id` | 文章段落与题组；**不含** answer / explanation / evidence |
| POST | `/api/ielts/reading/:id/submit` | `{ answers: { [题目 id]: string }, durationSec, mode: exam\|practice }` → 原始分、`scaled40`、估算 band、`bandNote`、逐题结果（对错、是否空答 / 超字数、正确答案、中文解析、原文依据 `{ para, quote }`）；活动来源记 `ielts-reading` |

- **输入校验**：`:id` 格式非法 400、不存在 404；`mode` 必填；`answers` 含本篇不存在的题号、值不是字符串或超过 200 字符、一题都没答，均返回 400；`durationSec` 为 0–14400 的整数（可省略）。
- **判分**：TFNG / YNNG 接受完整词或缩写（`T` / `F` / `NG`、`Y` / `N` / `NG`），两套混用判错；选项类按字母比较；填空类超字数判错，拼写须与可接受写法完全一致（大小写、多余空白不敏感）。
- **band**：按比例折算到 40 题，查学术类阅读常见近似换算表；单篇 13 题，答对或答错一题就差 0.5–1 分，只看趋势。

### 雅思内容与版权

- `data/ielts/` 下的题目、范文、参考答案、例句、听力脚本、阅读文章**全部原创**；评分维度（`rubrics.json`）用自己的话概括，每个维度分 4 / 5 / 6 / 7 / 8 五档（4 分档对应 A2 起步阶段的常见分数），**不收录**官方真题和官方评分标准原文。
- 当前内容规模（以 `data/ielts/` 实际数据为准）：
  - 雅思词汇 **1201 词**，7 个分片：学术通用 421 词；社会类话题 390 词、自然科技类话题 390 词（12 个话题各 65 词）；CEFR 为 B1 313 / B2 539 / C1 304 / C2 45，每词带例句和搭配。
  - 写作 **74 题**，全部带范文：Task 2 共 40 题（5 种题型各 8 题，覆盖 12 个话题）；Task 1 A 类 22 题（柱状 4、折线 4、饼图 3、表格 3、流程图 4、地图 4）；G 类书信 12 封（三种语气各 4）。
  - 口语 **64 条**：Part 1 共 32 个话题 × 4 题；Part 2 题卡 32 张，每张配 Part 3 追问 4 题；全部带参考答案。
  - 听力 **8 个 section、80 题**：Part 1–4 各 2 个，每个 10 题，带中文解析和答案所在段。
  - 阅读 **6 篇、78 题**：易 / 中 / 难各 2 篇，每篇 7 段、13 题，共 8 种题型，带中文解析和原文依据句。
- `data/ielts/local/` 用于放**自有资料**（例如自己整理的题目、范文），已加入 `.gitignore`，**不入库**；按与 `data/ielts/` 相同的 schema 放入 JSON，内容加载器会一并读取（子目录 `vocab` / `writing` / `speaking` / `listening` / `reading`）。剑桥雅思真题等受版权保护的资料不要提交到仓库。
- 词汇、写作、口语可以用导入命令写进 `local/`：`npm run import:ielts -- <文件或目录> --type vocab|writing|speaking`（支持 `--name`、`--dry-run`；词汇另支持 CSV），会先校验字段、与已有内容判重，**不覆盖**已有分片；导入后需重启服务。详见 [docs/雅思自有资料导入.md](docs/雅思自有资料导入.md)。听力、阅读暂无导入命令，按设计文档的 schema 手动放 JSON 后跑 `npm run validate`。
- 扩充或修改雅思内容后运行 `npm run validate`（含雅思内容校验：id 唯一、字段齐全、枚举合法、图表 / 流程图 / 地图数据一致、范文字数、计划 26 周；听力答案与依据须出现在对应段落、可接受写法不超字数；阅读依据句须逐字出现在原文等）；单测：`npm run test:ielts`（计划与评分逻辑）、`npm run test:ielts-listening`、`npm run test:ielts-reading`（判分与内容校验）。
- schema 与工作线划分见 [docs/design/ielts-prep-mvp-20261124.md](docs/design/ielts-prep-mvp-20261124.md)（听力、阅读另见 [ielts-listening-20261124.md](docs/design/ielts-listening-20261124.md)、[ielts-reading-20261124.md](docs/design/ielts-reading-20261124.md)）；变更记录见 [docs/changes/2026-11-24-雅思备考MVP.md](docs/changes/2026-11-24-雅思备考MVP.md)、[docs/changes/2026-11-25-雅思第二批功能.md](docs/changes/2026-11-25-雅思第二批功能.md)。

### 原声课文与 Git LFS

276 课新概念 **英音** MP3 已随仓库分发（`public/audio/nce/`，约 550MB，**Git LFS** 托管）。

```bash
git lfs install          # 本机首次启用 LFS
git clone <repo>         # 或 clone 后 git lfs pull
npm install && npm start
```

- **使用者**：教材页 **🎧 原声课文** 整课播放；全站 🔊 能匹配 LRC 时优先原声。详见 [docs/原声与发音.md](docs/原声与发音.md)。  
- **维护者**：从本地英音包更新时运行 `npm run import:official -- --source "/path/to/英音"`，见同上文档第三节。

## 题库数据结构

`data/questions.json` 是一个题目数组，每题字段：

```jsonc
{
  "id": "b1-001",            // 唯一 ID，建议 b<册>-<序号>
  "book": 1,                  // 册数 1-4
  "lesson": 2,                // 对应课次（用于按课程进度筛选）
  "lessonTitle": "Is this your...?",
  "grammar": ["be动词", "疑问句"], // 语法标签，可多个（用于按语法点筛选）
  "type": "mcq",              // mcq 单选 | fill 填空
  "stem": "___ this your umbrella?",
  "options": ["Is", "Are", "Am", "Do"], // mcq 必填；fill 不需要
  "answer": "Is",             // fill 可为数组 ["was written"] 表示多个可接受答案
  "explanation": "……语法解析……"
}
```

### 如何扩充题库

1. 直接向 `data/questions.json` 追加题目对象即可，`grammar` 标签会自动出现在对应册的语法筛选中，单元筛选依据 `lesson` 落点。
2. 保存后重启服务（`npm start`）生效。
3. 无需改动任何前后端代码。

## 内容覆盖现状（诚实说明）

当前为**四册全书对齐题库**（`npm run validate` 校验通过）：

新概念第一册共 144 课，其中**奇数课为课文、偶数课为练习**；本系统教材学习与题库均按课文课（奇数课）收录，第一册 **72 课已全部完成**。第二册 **96 课全书已完成**（每课 5 题 + 教材学习页）。

| 册 | 教材课（已收录 / 全书） | 题库题量 | 句型转换 | 精读全文 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 第 1 册 | **72 / 72 课文课**（L1–143 奇数课） | 424 | 87 | 72 | 教材 + 题库 + 听写精读全文完成 |
| 第 2 册 | **96 / 96** | 499 | 119 | 96 | 教材 + 题库 + 精读短文全文完成；听写/背单词/词汇量测试已支持 |
| 第 3 册 | **60 / 60** | **310** | **97** | **60** | 教材 + 题库 + 精读 + 句型转换全书完成 |
| 第 4 册 | **48 / 48** | **240** | **70** | **48** | 教材 + 题库 + 精读 + 句型转换 + 官方词表同步完成 |
| **合计** | **276 课** | **1473 题** | **373** | **276** | |

> **情景对话**为跨册的生活与学术场景内容，不按册划分；左侧 **8 大类** 二级目录，共 **73 类场景 / 1202 组 / 64 条对话链**（`data/dialogues/`）。

新概念全 4 册 300+ 课，题库与教材均设计为**分片可持续扩充**结构 —— 向 `data/questions/`、`data/lessons/` 追加 JSON 分片即可，无需改代码。素材可参考同目录 `../New_Concept_English/` 中的课文 PDF 与音频。

> 内容覆盖以实际数据为准（`npm run validate` 校验通过）：第 1、2、3、4 册全书已收官。
