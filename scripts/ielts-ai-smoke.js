'use strict';
// 写作 AI 批改冒烟：配置好 ANTHROPIC_API_KEY 后，用内置的一篇短作文真实调用一次 Claude API，确认参数组合被接受、返回能通过校验。
// 会产生一次真实调用费用（约 $0.05–0.15）；不读写任何档案。
// 用法：ANTHROPIC_API_KEY=... npm run ai:smoke

const ielts = require('../lib/ielts');
const ai = require('../lib/ielts-ai');

// 按 docs/design/ielts-writing-ai-20261126.md §3 的单价估算（美元 / 百万 token）；只用于提示，不作计费依据
const PRICE = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };

const ESSAY = `Nowadays, many people think that secondary schools should teach more practical skills, like cooking and managing money. I agree with this idea in most part.

Firstly, a lot of young people do not know how to cook or make a budget when they leave home. For example, some students spend all their money in the first week at university. If schools teach these skills, students will be more independent. Also, not every parents have time to teach their children, so school is more fair place to learn.

Secondly, practical skills can help students understand academic subjects. When students calculate the cost of a loan, they use maths in real life, so they will be more interested in maths.

However, academic subjects is still very important for university and jobs. So schools should not reduce them too much.

In conclusion, I think schools should teach practical skills, but they should keep the balance with academic subjects.`;

async function main() {
  const cfg = ai.config();
  if (!cfg.enabled) {
    console.error('AI 批改未开启：请先设置 ANTHROPIC_API_KEY（或 ant auth login 后设 IELTS_AI_ENABLED=1）再运行。');
    process.exit(2);
  }
  const item = ielts.getWriting('w2-edu-01');
  if (!item) throw new Error('题库里找不到 w2-edu-01，请运行 npm run validate');
  const dims = ielts.getRubrics().writing[ai.rubricKey(item)];
  const wordCount = ielts.countWords(ESSAY);
  console.log(`模型 ${cfg.model} · effort ${cfg.effort} · 作文 ${wordCount} 词，正在调用（约 30–90 秒）…`);
  const started = Date.now();
  let response;
  try {
    response = await ai.getClient().beta.messages.create(ai.buildRequest(item, { text: ESSAY }, dims, cfg, wordCount));
  } catch (e) {
    const m = ai.mapError(e);
    console.error(`调用失败（映射为 HTTP ${m.status}）：${m.error}\n原始错误：${e && e.message}`);
    process.exit(1);
  }
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`返回：stop_reason=${response.stop_reason} · 实际模型 ${response.model} · 用时 ${sec} 秒`);
  if (response.stop_reason !== 'end_turn') {
    console.error('没有正常结束，接口会按 502 处理。');
    process.exit(1);
  }
  const parsed = ai.parseReview(ai.extractText(response), item.task, ESSAY);
  if (parsed.error) {
    console.error(`返回校验失败：${parsed.error}`);
    process.exit(1);
  }
  const v = parsed.review;
  console.log(`四项：${Object.entries(v.criteria).map(([k, c]) => `${k} ${c.band}`).join(' · ')} → 总分 ${v.band}`);
  console.log(`总评：${v.summary}`);
  console.log(`问题 ${v.issues.length} 条 · 逐句修改 ${v.corrections.length} 条（在原文中找到 ${v.corrections.filter((c) => c.found).length} 条）· 示范改写 ${v.improvedParagraph ? '有' : '无'}`);
  const u = response.usage || {};
  const price = PRICE[cfg.model];
  const cost = price ? ((u.input_tokens || 0) * price[0] + (u.output_tokens || 0) * price[1]) / 1e6 : null;
  console.log(`用量：输入 ${u.input_tokens} · 输出 ${u.output_tokens} token${cost != null ? ` · 估算 $${cost.toFixed(3)}` : ''}`);
  console.log('冒烟通过。');
}

main().catch((e) => {
  console.error(`冒烟脚本出错：${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
