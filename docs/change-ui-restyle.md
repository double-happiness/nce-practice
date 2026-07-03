# 变更文档 · 多主题配色系统

## 背景
用户反馈页面单调，先做过一版蓝紫美化后仍觉不够好看。最终确定方向：**不锁定单一风格，而是提供多套可切换主题，由用户自行选择配色**，以适配不同偏好。

## 关键约束
- `styles.css` 当时正被用户实时手工重构（新增了「今日学习」首页、学/练/复习/我的 tab 分组、书页式教材目录等）。为避免与用户的编辑冲突、避免覆盖其成果，**本次改动不重写 `styles.css`**，全部以新增文件 + 变量覆盖的方式实现。
- 现有 `styles.css` 大量使用 CSS 变量（`--brand`、`--accent-grad`、`--card`、`--bg`、`--bg-tint-*` 等）。主题切换主要靠重定义这些变量即可全局生效。

## 方案
新增两个文件 + `index.html` 两处引用，零改动 `styles.css`：

1. **`public/themes.css`** — 主题定义
   - 通过 `html[data-theme="xxx"]` 覆盖颜色变量；不设或 `aurora` = `styles.css` 默认。
   - 浅色系主题（ocean/rose/paper）仅重定义变量；深色主题（midnight）额外覆盖少量硬编码白底（`.topbar`/`.tabs`/`.chip`/`.btn`/`select`/`.q-card`/`.option`/`.r-card` 等）。
   - 覆盖普通 `.chip`/`.btn` 底色时用 `:not(.active)` / `:not(.primary)`，避免把选中态/主按钮的渐变高亮也刷掉（这是修复选中芯片白字不可读的关键）。
   - 也包含主题切换器 UI 样式（`.theme-switch`/`.theme-dot`）。

2. **`public/theme.js`** — 切换器逻辑
   - 在顶栏 `.stats-mini` 前注入一排色板圆点；点击切换 `data-theme`。
   - `localStorage`（key=`nce-theme`）记忆选择。

3. **`public/index.html`**
   - `<head>` 引入 `themes.css`（在 `styles.css` 之后）+ 一段内联脚本尽早读取 localStorage 设置 `data-theme`，**防止刷新时主题闪烁（FOUC）**。
   - `<body>` 末尾引入 `theme.js`（在 `app.js` 之前）。

## 主题清单（5 套）
| key | 名称 | 说明 |
|---|---|---|
| aurora | 极光紫 | 默认，蓝紫（styles.css 原配色） |
| ocean | 清新青 | 青蓝，明亮干净 |
| rose | 樱粉 | 粉红暖调 |
| paper | 纸质暖 | 米色纸感、金棕强调，呼应书页式教材 |
| midnight | 深色玻璃 | 深蓝黑底 + 毛玻璃 + 青紫霓虹发光 |

## 设计要点
- **书页式教材**（`.book`/`.toc-page`/`.content-page`）使用自身纸色变量，**任何主题下都保持米色纸书原貌**；深色主题下额外加投影，作为「深色桌面上的一本纸书」，风格自洽不割裂。
- 深色主题下所有硬编码浅底元素均已覆盖为玻璃/深色；功能模块（`feat-*.js`）自带浅色设计，未强制深色化。

## 扩展方式
加一套新主题：`themes.css` 增一段 `html[data-theme=xxx]{…}` + 一条 `.theme-dot[data-k=xxx]` 代表色；`theme.js` 的 `THEMES` 数组加一项。

## 验证
本地启动服务，用 puppeteer-core + Chrome 对 midnight / ocean / paper 三套主题在「刷题练习」视图逐一截图核对：切换生效、选中态高亮清晰、白字对比达标（paper 金棕渐变已加深至可读），无布局破损。
