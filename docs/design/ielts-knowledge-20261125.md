# 雅思基础知识库（2026-11-25）

> 多个 agent 并行开发时以本文为共同契约，文章 schema、接口和文件归属以本文为准。系统只给一个人自学用，不考虑多用户。

## 1. 目标

在「🎓 雅思备考」里新增「📚 基础」子页，把 A2 → 7.0 需要的基础知识做成「讲解 + 例句 + 易错点 + 小测」的知识卡片。分五个领域，共约 64 篇：

| domain | track | 内容 | 篇数 | 分片文件 |
|---|---|---|---|---|
| grammar | core | A2→B1 核心语法 | 12 | `grammar-core.json` |
| grammar | advanced | B2→C1 写作进阶语法 | 12 | `grammar-advanced.json` |
| strategy | listening / reading | 听力、阅读题型技巧 | 11 | `strategy-listening-reading.json` |
| strategy | writing / speaking | 写作、口语答题方法 | 11 | `strategy-writing-speaking.json` |
| language | writing / speaking | 功能表达库 | 8 | `language-bank.json` |
| pronunciation / wordform | sounds / stress / connected / affix / root / collocation | 发音与构词 | 10 | `pronunciation-wordform.json` |

## 2. 文章 schema（`data/ielts/knowledge/*.json`，每个文件是 JSON 数组）

```jsonc
{
  "id": "gr-past-simple",          // 前缀：gr- 语法 / st- 题型技巧 / lang- 功能表达 / pron- 发音 / wf- 构词；全局唯一，小写字母、数字、连字符
  "domain": "grammar",             // grammar | strategy | language | pronunciation | wordform
  "track": "core",                 // 见 §1 表格中的 track 取值
  "title": "一般过去时",
  "titleEn": "Past simple",
  "level": "A2",                   // 建议开始学的水平：A2 | B1 | B2 | C1
  "skills": ["writing", "speaking"], // 主要服务的考试技能：listening | reading | writing | speaking，至少 1 个
  "order": 10,                     // 同一 track 内的学习顺序（升序）
  "minutes": 15,                   // 预计学习时长（含小测），5–40
  "summary": "一句话说明学完能做什么（中文）",
  "sections": [                    // 2–6 节
    {
      "heading": "什么时候用",
      "body": "中文讲解；可用 **加粗**；段落之间用 \n\n 分隔；不写 HTML",
      "examples": [ { "en": "I visited my grandparents last weekend.", "cn": "我上周末去看了祖父母。", "note": "可选：点出要点" } ],
      "table": { "head": ["时间词", "例句"], "rows": [["yesterday", "…"]] }   // 可选
    }
  ],
  "pitfalls": [                    // 中国学习者常见错误，语法 / 表达 / 发音类至少 3 条，技巧类可为空数组
    { "wrong": "I go to the park yesterday.", "right": "I went to the park yesterday.", "why": "中文原因" }
  ],
  "exercises": [                   // 3–8 题小测，答案在前端本地判分（单人自学）
    { "id": "gr-past-simple-q1", "type": "mcq", "q": "…", "options": ["…", "…", "…"], "answer": "…", "explain": "中文解析" },
    { "id": "gr-past-simple-q2", "type": "fill", "q": "Yesterday I ___ (go) to the park.", "answer": ["went"], "explain": "…" },
    { "id": "gr-past-simple-q3", "type": "correct", "q": "He go to school yesterday.", "answer": ["He went to school yesterday."], "explain": "…" }
  ],
  "related": {                     // 可选：深链到现有功能
    "grammarTags": ["一般过去时"],  // 必须是题库里已有的语法标签，用于「去刷这个语法」
    "nceLessons": [ { "book": 1, "lesson": 27 } ],
    "tabs": ["transform", "ielts:writing"]
  }
}
```

**规则**

- 判分：`mcq` 的 answer 必须是 options 之一；`fill` / `correct` 的 answer 是可接受写法数组，比较时不区分大小写、合并空格、忽略句末标点。
- 例句和讲解全部原创，不照抄教材或剑桥真题；英文统一英式拼写，不用弯引号。
- `related.grammarTags` 只能用题库已有标签。用 `node -e` 读 `lib/data` 的 `getQuestions()` 汇总 `grammar` 字段得到清单。
- `related.tabs` 可用：`learn practice dictionary dictation exam transform dialogue review words comprehension ielts:plan ielts:vocab ielts:listening ielts:reading ielts:writing ielts:speaking`。

## 3. 接口（`routes/ielts-knowledge.js`，自动挂载到 /api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ielts/knowledge` | 文章目录（不含 sections 和 exercises），按 domain、track、order 排序，每篇带本人进度 `{ readAt, best, total, attempts }` |
| GET | `/api/ielts/knowledge/:id` | 完整文章 |
| POST | `/api/ielts/knowledge/:id/progress` | `{ read: true }` 标记已读，或 `{ score, total }` 提交小测成绩；显式校验；写入 `ielts.json` 的 `knowledge` 对象；提交小测时记学习活动，source 为 `ielts-knowledge` |

用户数据用 `lib/ielts.js` 的 loadUser / saveUser 读写。这两个函数会保留未知的顶层字段，读取时自己校验 `knowledge` 字段。

## 4. 前端（`public/js/ielts-knowledge-ui.js`）

- 注册：`NCE.ielts.registerPage('knowledge', { meta: { label: '基础', icon: '📚', before: 'vocab' }, render, leave })`
- 目录：按领域分组，显示学习进度（已读、小测最好成绩），支持按水平和技能筛选，并给出「下一篇推荐」：按 level 和 order 取第一篇未完成的。
- 文章页：讲解、例句（🔊 用 `NCE.speak`）、表格、易错点、小测（逐题作答、即时反馈、交卷后提交成绩）、相关跳转（`grammarTags` → `NCE.practiceGrammar`，`nceLessons` → `NCE.goToLesson`，`tabs` → `NCE.gotoTab`）。
- 所有内容都要转义；`**加粗**` 先转义再替换成 `<b>`。使用主题变量；在 380px 宽度下不能出现横向滚动。

## 5. 文件归属

| 工作线 | 允许创建或修改的文件 |
|---|---|
| 基础设施 | `lib/ielts-knowledge.js`、`routes/ielts-knowledge.js`、`public/js/ielts-knowledge-ui.js`、`scripts/test-ielts-knowledge.js`、`scripts/fixtures/ielts-knowledge/**`；`public/index.html` 只能加一行 script |
| 内容 ×6 | 只能新建 §1 表格里对应的那一个分片文件 |

以下文件由协调方在合并时接入：`scripts/validate.js`、`package.json`、`routes/plan.js`、`data/ielts/plan.json`、`public/sw.js`，以及文档。
