'use strict';
// 扫描情景对话语料，用常见口语变体自动回归，发现未覆盖的判分缺口。
// 用法：node scripts/scan-dialogue-coverage.js

const data = require('../lib/data');
const { normalizeAnswer } = require('../lib/grade');
const { isDialogueTurnCorrect } = require('../lib/dialogue-grade');
const { generateAllVariants } = require('../lib/answer-variant');

// 从标准答案自动派生的「用户可能说法」探测模板
const PROBES = [
  (en) => en.replace(/\bthanks\b/gi, 'thank you'),
  (en) => en.replace(/\bthank you\b/gi, 'thanks'),
  (en) => en.replace(/\bplease\b/gi, 'pls'),
  (en) => en.replace(/^can i /i, 'could i '),
  (en) => en.replace(/^can i /i, 'may i '),
  (en) => en.replace(/^could i /i, 'can i '),
  (en) => en.replace(/\bdo you have\b/gi, 'have you got'),
  (en) => en.replace(/\bi'd like\b/gi, 'I would like'),
  (en) => en.replace(/\bi'd like\b/gi, 'I want'),
  (en) => en.replace(/\byou're\b/gi, 'you are'),
  (en) => en.replace(/\bdon't\b/gi, 'do not'),
  (en) => en.replace(/\bcan't\b/gi, 'cannot'),
  (en) => en.replace(/^how much is /i, 'How much does '),
  (en) => en.replace(/^where is /i, 'Where can I find '),
];

function primaryEn(turn) {
  return Array.isArray(turn.en) ? turn.en[0] : turn.en;
}

const turns = [];
for (const d of data.getDialogues()) {
  for (let i = 0; i < d.turns.length; i++) {
    const t = d.turns[i];
    if (t.role !== 'You') continue;
    turns.push({ id: d.id, index: i, turn: t, en: primaryEn(t) });
  }
}

let probeTotal = 0;
let probePass = 0;
const failures = [];
const variantStats = { min: Infinity, max: 0, total: 0 };

for (const item of turns) {
  const norm = normalizeAnswer(item.en);
  const variants = generateAllVariants(norm);
  variantStats.total += variants.size;
  variantStats.min = Math.min(variantStats.min, variants.size);
  variantStats.max = Math.max(variantStats.max, variants.size);

  for (const probe of PROBES) {
    const candidate = probe(item.en);
    if (!candidate || normalizeAnswer(candidate) === norm) continue;
    probeTotal++;
    if (isDialogueTurnCorrect(item.turn, candidate)) {
      probePass++;
    } else {
      failures.push({
        id: item.id,
        en: item.en,
        tried: candidate,
      });
    }
  }
}

console.log(`学习者台词：${turns.length} 条`);
console.log(
  `自动变体展开：平均 ${(variantStats.total / turns.length).toFixed(1)} 条/句，` +
  `最少 ${variantStats.min}，最多 ${variantStats.max}`
);
console.log(`口语探测：${probePass}/${probeTotal} 通过 (${probeTotal ? Math.round((probePass / probeTotal) * 100) : 100}%)`);

if (failures.length) {
  console.log(`\n未覆盖样例（前 15 条）：`);
  failures.slice(0, 15).forEach((f) => {
    console.log(`- ${f.id}`);
    console.log(`  标准：${f.en}`);
    console.log(`  探测：${f.tried}`);
  });
  process.exitCode = 1;
} else {
  console.log('\n常见口语变体已全部覆盖。');
}
