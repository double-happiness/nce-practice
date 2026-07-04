'use strict';
// 词典检索回归：防止子串/例句译文/括号标注等误匹配

const { search, buildLookupDict, normKey } = require('../lib/wordlookup');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  }
}

function words(q, book) {
  return search({ q, book: book || '', scope: 'all' }).map((e) => e.word);
}

// 英文整词
assert(words('me').join() === 'me', 'me 应只命中 me');
assert(words('some').join() === 'some', 'some 应只命中 some');
assert(!words('me').includes('some'), 'me 不应命中 some');

// 中文：例句译文不应参与
assert(words('你好', '1').includes('hello'), '你好 应命中 hello');
assert(words('你好', '1').includes('hi'), '你好 应命中 hi');
assert(!words('你好', '1').includes('speaking'), '你好 不应因例句译文命中 speaking');

// 中文：括号标注不应模糊命中
assert(!words('电话', '1').includes('speaking'), '电话 不应仅因括号标注命中 speaking');

// 中文：合理义项匹配
assert(words('原谅').includes('excuse'), '原谅 应命中 excuse');
assert(words('一下').includes('excuse'), '一下 应命中 excuse（打扰一下）');

// 单字不应泛滥
assert(words('的').length < 50, '单字「的」结果应明显收敛（<50）');

// 英文短语：短碎片不按短语搜
assert(words('is a').length < 10, 'is a 不应返回大量例句碎片匹配');

// 英文短语：正常短语
assert(words('excuse me').includes('excuse'), 'excuse me 应命中 excuse');

// 全库扫描：例句译文里的中文词不在释义里时，不应搜到该英文词
const dict = buildLookupDict();
let egFalsePos = 0;
for (const e of dict) {
  const eg = String(e.eg || '');
  const idx = eg.search(/\s[\u4e00-\u9fff（(]/);
  if (idx < 0) continue;
  const cnPart = eg.slice(idx).trim();
  const tokens = cnPart
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .split(/[，。！？、；;：:\s]+/)
    .filter((p) => p.length >= 2);
  for (const p of tokens) {
    if (String(e.cn || '').includes(p)) continue;
    if (normKey(p) === e.key) continue; // 例句中的英文专名不算误匹配
    if (words(p).includes(e.word)) egFalsePos++;
  }
}

assert(egFalsePos === 0, `例句译文诱发误匹配 ${egFalsePos} 条（应为 0）`);

if (failed) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('wordlookup 检索回归：全部通过');
