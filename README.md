# 新概念英语 · 练习题库系统

一个与《新概念英语》1–4 册教材匹配的在线练习系统，支持 **按册 / 按课程进度 / 按语法点** 三维度出题，自动判分、错题本、正确率统计与错题重练。

## 快速开始

```bash
cd nce
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
| 数据校验 | `npm run validate`：检查答案是否在选项内、id 是否重复、字段是否完整；服务启动时自动运行 |

## 架构

```
nce/
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
│   └── progress.js      # 学习进度读写
├── scripts/
│   ├── validate.js      # 数据校验（npm run validate，启动时自动跑）
│   └── import-nce-official.js  # 导入英音 MP3 + LRC（npm run import:official）
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
