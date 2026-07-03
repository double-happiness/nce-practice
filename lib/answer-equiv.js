'use strict';
// 口语等价写法归一化：在 normalizeAnswer 之后使用，把歧义低的同义表达映射为同一形式再比对。
// 仅用于情景对话等需要容忍礼貌用语/缩写变体的场景；刷题仍走精确匹配。

// 每组第一项为 canonical，其余项归一化后与 canonical 等价。长短语排在前面。
const EQUIV_GROUPS = [
  ['thank you very much', 'thanks very much', 'thanks a lot'],
  ['thank you for', 'thanks for'],
  ['you are welcome', "you're welcome"],
  ['no thank you', 'no thanks'],
  ['no problem', 'not a problem'],
  ['my pleasure', 'with pleasure'],
  ['of course', 'certainly', 'sure'],
  ['sounds good', 'that sounds good', 'that works for me'],
  ['i would like', "i'd like"],
  ['i will have', "i'll have"],
  ['i will need', "i'll need"],
  ['i am', "i'm"],
  ['you are', "you're"],
  ['we are', "we're"],
  ['they are', "they're"],
  ['it is', "it's"],
  ['that is', "that's"],
  ['there is', "there's"],
  ['here is', "here's"],
  ['what is', "what's"],
  ['where is', "where's"],
  ['how is', "how's"],
  ['do not', "don't"],
  ['does not', "doesn't"],
  ['did not', "didn't"],
  ['is not', "isn't"],
  ['are not', "aren't"],
  ['was not', "wasn't"],
  ['were not', "weren't"],
  ['have not', "haven't"],
  ['has not', "hasn't"],
  ['had not', "hadn't"],
  ['will not', "won't"],
  ['would not', "wouldn't"],
  ['could not', "couldn't"],
  ['should not', "shouldn't"],
  ['can not', "can't", 'cannot'],
  ['going to', 'gonna'],
  ['want to', 'wanna'],
  ['give me', 'gimme'],
  ['all right', 'alright'],
  ['excuse me', 'pardon me'],
  ['thank you', 'thanks', 'thank u', 'thx'],
  ['hello', 'hi', 'hey'],
  ['okay', 'ok'],
  ['yes', 'yeah', 'yep'],
  ['no', 'nope', 'nah'],
  ['please', 'pls'],
  ['got it', 'gotcha'],
];

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceWholePhrase(text, from, to) {
  if (!from || from === to) return text;
  const esc = escapeRegExp(from).replace(/ /g, '\\s+');
  const re = new RegExp(`\\b${esc}\\b`, 'g');
  return text.replace(re, to);
}

/** @param {string} normalized 已经过 normalizeAnswer 的字符串 */
function canonicalize(normalized) {
  let s = String(normalized || '');
  if (!s) return '';
  for (const group of EQUIV_GROUPS) {
    const [canon, ...alts] = group;
    for (const alt of alts) {
      s = replaceWholePhrase(s, alt, canon);
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

module.exports = { EQUIV_GROUPS, canonicalize, replaceWholePhrase };
