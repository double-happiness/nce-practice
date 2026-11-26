# nce-practice · 新概念英语练习题库系统

## 技术栈
- Node.js 20（CommonJS，`'use strict'`）+ Express 4，包管理器 npm；另有 `@anthropic-ai/sdk`（纯 JS，只给写作 AI 批改用，未配 `ANTHROPIC_API_KEY` 时不调用）
- 存储：JSON 文件（`lib/store.js` 原子写），无数据库
- 前端：原生 HTML/CSS/JS，零构建；PWA（`public/sw.js`、`manifest.json`）
- 原声 MP3：`public/audio/nce/*.mp3` 由 Git LFS 托管（约 550MB）

## 目录结构
```
server.js        核心 API + 静态托管 + 自动挂载 routes/*.js 到 /api
lib/             业务逻辑（data 加载、grade 判分、store 读写、profile 档案、srs 等）
routes/          功能路由，一功能一文件，导出 Express Router，启动时自动挂载
public/          前端；public/js/feat-*.js 通过 NCE.registerFeature 自注册标签页
data/            题库/课程/对话/句型转换等内容分片（questions/、lessons/、dialogues/、transforms/ 下 *.json 自动合并）
scripts/         数据校验、导入、词库构建、测试脚本
docs/            用户指南、原声说明；docs/changes/ 为按日期的变更记录
```

## 常用命令
```bash
npm install                 # 安装依赖（express、@anthropic-ai/sdk）
git lfs install && git lfs pull   # 首次 clone 后拉原声 MP3
npm start                   # 启动，默认 http://localhost:3737；PORT=8080 npm start 换端口
npm run start:env           # 读取 .env（ANTHROPIC_API_KEY 等，模板见 .env.example）后启动
npm run validate            # 数据校验（启动时也会自动跑）
npm run test:equiv          # 判分等价引擎测试
npm run test:wordlookup     # 查词检索测试
npm run build:offline       # 重建离线词库/对话包并审计
```

## 编码约定
- 新后端功能：`routes/xxx.js` 导出 Router，无需改 server.js
- 新前端功能：`public/js/feat-xxx.js` 调 `window.NCE.registerFeature`，并在 `index.html` 加 `<script>`
- 扩充内容：向 `data/*/` 追加 JSON 分片，改完跑 `npm run validate`
- 读写 JSON 一律走 `lib/store.js` 的 `readJSON` / `writeJSONAtomic`
- API 错误返回 JSON `{ error }`，不要返回 HTML
- 注释、提交说明用中文；commit 遵循 Conventional Commits

## 禁止改动
- `data/profiles/`、`data/backups/`：用户运行时学习数据（已 gitignore）
- `public/audio/nce/*.mp3`：LFS 原声，只能通过 `npm run import:official` 更新
- 不要引入构建工具或原生依赖（项目原则：零构建）

## 当前阶段
- 第 1–4 册教材、题库、精读、句型转换已全书收官；近期重点为词汇体系与句型转换剑桥语法对照
