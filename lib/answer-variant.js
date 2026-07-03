'use strict';
// 根据标准答案自动展开口语变体，供情景对话判分使用（无需手工维护 aliases）。

const { EQUIV_GROUPS, canonicalize, replaceWholePhrase } = require('./answer-equiv');

const MAX_VARIANTS = 192;

// 句型级替换：从语料高频表达归纳，仅做歧义低的整句/短语变换
const STRUCTURAL_RULES = [
  {
    variants(n) {
      const out = [];
      const modSwaps = [
        [/^can i /, ['could i ', 'may i ']],
        [/^could i /, ['can i ', 'may i ']],
        [/^may i /, ['can i ', 'could i ']],
        [/^can you /, ['could you ', 'would you ']],
        [/^could you /, ['can you ', 'would you ']],
        [/^would you /, ['could you ', 'can you ']],
        [/^will you /, ['would you ', 'could you ']],
      ];
      for (const [re, reps] of modSwaps) {
        if (!re.test(n)) continue;
        for (const rep of reps) out.push(n.replace(re, rep));
      }
      return out;
    },
  },
  {
    variants(n) {
      const m = /^(can|could|may) i (get|have) (.+)$/.exec(n);
      if (!m) return [];
      const [, mod, verb, rest] = m;
      const out = [];
      for (const mo of ['can', 'could', 'may']) {
        for (const ve of ['get', 'have']) {
          if (mo === mod && ve === verb) continue;
          out.push(`${mo} i ${ve} ${rest}`);
        }
      }
      return out;
    },
  },
  {
    variants(n) {
      const out = [];
      if (n.includes('do you have')) out.push(n.replace(/do you have/g, 'have you got'));
      if (n.includes('have you got')) out.push(n.replace(/have you got/g, 'do you have'));
      return out;
    },
  },
  {
    variants(n) {
      const out = [];
      if (/\bi(?:'d| would) like\b/.test(n)) {
        out.push(n.replace(/\bi(?:'d| would) like\b/g, 'i want'));
      }
      if (/\bi want\b/.test(n)) {
        out.push(n.replace(/\bi want\b/g, "i'd like"));
        out.push(n.replace(/\bi want\b/g, 'i would like'));
      }
      return out;
    },
  },
  {
    variants(n) {
      const out = [];
      if (n.includes('thank you for')) out.push(n.replace(/thank you for/g, 'thanks for'));
      if (n.includes('thanks for')) out.push(n.replace(/thanks for/g, 'thank you for'));
      return out;
    },
  },
  {
    variants(n) {
      const out = [];
      if (n.includes('no thank you')) out.push(n.replace(/no thank you/g, 'no thanks'));
      if (n.includes('no thanks')) out.push(n.replace(/no thanks/g, 'no thank you'));
      return out;
    },
  },
  {
    variants(n) {
      const out = [];
      if (n.startsWith('how much is ')) {
        out.push(n.replace(/^how much is /, 'how much does '));
      }
      if (n.startsWith('how much does ')) {
        out.push(n.replace(/^how much does /, 'how much is '));
      }
      if (n.startsWith('where is ')) {
        out.push(n.replace(/^where is /, 'where can i find '));
      }
      if (n.startsWith('where can i find ')) {
        out.push(n.replace(/^where can i find /, 'where is '));
      }
      return out;
    },
  },
];

function pushVariant(set, queue, text, maxSize) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || set.has(t) || set.size >= maxSize) return;
  set.add(t);
  queue.push(t);
}

function expandEquivSwaps(set, queue, cur, maxSize) {
  for (const group of EQUIV_GROUPS) {
    for (let i = 0; i < group.length; i++) {
      for (let j = 0; j < group.length; j++) {
        if (i === j) continue;
        const next = replaceWholePhrase(cur, group[i], group[j]);
        pushVariant(set, queue, next, maxSize);
      }
    }
  }
}

/** 从已 normalize 的标准答案展开可接受变体集合（含原句） */
function generateAllVariants(normalized, maxSize) {
  const limit = maxSize || MAX_VARIANTS;
  const set = new Set();
  const queue = [];
  pushVariant(set, queue, normalized, limit);

  while (queue.length && set.size < limit) {
    const cur = queue.shift();
    expandEquivSwaps(set, queue, cur, limit);
    for (const rule of STRUCTURAL_RULES) {
      for (const v of rule.variants(cur)) {
        pushVariant(set, queue, v, limit);
        expandEquivSwaps(set, queue, v, limit);
      }
    }
  }
  return set;
}

/** 用户输入是否与某一标准答案（含自动变体）等价 */
function matchesDialogueResponse(responseNormalized, answerNormalized) {
  const target = canonicalize(responseNormalized);
  if (!target) return false;
  for (const form of generateAllVariants(answerNormalized)) {
    if (canonicalize(form) === target) return true;
  }
  return false;
}

module.exports = {
  MAX_VARIANTS,
  STRUCTURAL_RULES,
  generateAllVariants,
  matchesDialogueResponse,
};
