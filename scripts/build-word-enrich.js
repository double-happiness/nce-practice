'use strict';
// 扫描 B1+B2 教材，为词典详情生成 word-enrich.json 补充数据
// collocations 只收「真正的短语」：目标词 ±2~3 个搭配词，绝不放整句（整句在 examples 区）。

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { normKey } = require('../lib/dict');

const OUT = path.join(__dirname, '..', 'data', 'word-enrich.json');
const MANUAL = {
  ...require('../data/word-enrich-manual.json'),
  ...require('../data/word-enrich-manual-batch3.json'),
  ...require('../data/word-enrich-manual-batch2.json'),
};

// ---------- 词类表（封闭类，用于短语边界判断） ----------

const AUX = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'done',
  'have', 'has', 'had', 'having',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'ought', 'cannot',
]);

const PRON = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'us', 'them',
  'who', 'whom', 'whose', 'which', 'what', 'that',
  'there', 'here', 'one', 'ones',
  'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything',
  'everyone', 'everybody', 'everything', 'nothing', 'nobody', 'none',
]);

const DET = new Set(['a', 'an', 'the', 'some', 'any', 'no', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);

// 指示/遍历限定词：右侧遇到通常是新的状语（this year 等），直接截断
const DEMO = new Set(['this', 'these', 'those', 'last', 'next', 'every', 'each', 'another', 'other', 'such']);

const PREP = new Set([
  'in', 'on', 'at', 'of', 'for', 'with', 'to', 'from', 'by', 'about',
  'into', 'over', 'under', 'after', 'before', 'between', 'through', 'during',
  'without', 'against', 'around', 'across', 'along', 'behind', 'beside', 'near',
  'off', 'out', 'up', 'down', 'inside', 'outside', 'onto', 'towards', 'toward', 'upon',
  'than', 'as', 'like',
]);

const CONJ = new Set([
  'and', 'or', 'but', 'so', 'because', 'if', 'when', 'while',
  'although', 'though', 'unless', 'until', 'since', 'where', 'why', 'how',
  'then', 'however', 'therefore',
]);

// 句子级副词：出现即视为短语边界
const ADV_STOP = new Set([
  'not', 'never', 'always', 'often', 'usually', 'sometimes', 'already',
  'just', 'ever', 'also', 'too', 'still', 'even', 'only', 'again', 'soon',
  'now', 'yesterday', 'today', 'tomorrow', 'tonight', 'yet', 'please',
  'almost', 'nearly', 'perhaps', 'maybe', 'probably', 'certainly', 'definitely',
  'finally', 'suddenly',
]);

const IRREGULAR = {
  took: 'take', taken: 'take', went: 'go', gone: 'go', made: 'make',
  gave: 'give', given: 'give', got: 'get', gotten: 'get', ran: 'run',
  came: 'come', saw: 'see', seen: 'see', bought: 'buy', brought: 'bring',
  thought: 'think', said: 'say', told: 'tell', found: 'find', left: 'leave',
  met: 'meet', sat: 'sit', stood: 'stand', spoke: 'speak', spoken: 'speak',
  wrote: 'write', written: 'write', drove: 'drive', driven: 'drive',
  ate: 'eat', eaten: 'eat', flew: 'fly', flown: 'fly', drank: 'drink',
  sang: 'sing', swam: 'swim', wore: 'wear', worn: 'wear', won: 'win',
  sent: 'send', spent: 'spend', lost: 'lose', paid: 'pay', heard: 'hear',
  held: 'hold', kept: 'keep', felt: 'feel', built: 'build', caught: 'catch',
  taught: 'teach', sold: 'sell', slept: 'sleep', broke: 'break', broken: 'break',
  chose: 'choose', chosen: 'choose', fell: 'fall', fallen: 'fall',
  forgot: 'forget', forgotten: 'forget', grew: 'grow', grown: 'grow',
  knew: 'know', known: 'know', threw: 'throw', thrown: 'throw',
  understood: 'understand', woke: 'wake', woken: 'wake', began: 'begin', begun: 'begin',
  became: 'become', hung: 'hang', hid: 'hide', rang: 'ring', blew: 'blow',
  drew: 'draw', led: 'lead', meant: 'mean', shook: 'shake', fled: 'flee',
  fought: 'fight', froze: 'freeze', dug: 'dig', laid: 'lay', lit: 'light',
  rode: 'ride', lent: 'lend', dealt: 'deal', bent: 'bend', swept: 'sweep',
  struck: 'strike',
};

// 以 -ing 结尾但不是动词进行时的常见词，禁止还原（morning → morn 之类）
const NO_LEMMA = new Set([
  'morning', 'evening', 'nothing', 'something', 'anything', 'everything',
  'during', 'interesting', 'boring', 'exciting', 'amazing', 'surprising',
  'wedding', 'ceiling', 'king', 'ring', 'spring', 'string', 'thing', 'wing',
  'pudding', 'building', 'feeling', 'meeting', 'shopping', 'swimming',
  'skating', 'sightseeing', 'clothing', 'painting', 'drawing',
]);

// 教材/全局词表都不收录的常见动词原形，补充给还原查表用
const BASE_VERB_SUPPLEMENT = [
  'study', 'live', 'stay', 'work', 'play', 'walk', 'talk', 'watch', 'listen',
  'learn', 'read', 'write', 'cook', 'clean', 'visit', 'help', 'open', 'close',
  'start', 'finish', 'wait', 'ask', 'answer', 'call', 'move', 'turn', 'stop',
  'rain', 'snow', 'smile', 'laugh', 'cry', 'dance', 'jump', 'wash', 'brush',
  'change', 'arrive', 'return', 'travel', 'marry', 'drink', 'eat', 'want',
  'need', 'like', 'love', 'try', 'use', 'wear', 'carry', 'drive', 'fly',
];

// ---------- 词表（用于还原动词原形、识别专有名词） ----------

let VOCAB = null;
function vocab() {
  if (VOCAB) return VOCAB;
  VOCAB = new Set(BASE_VERB_SUPPLEMENT);
  for (const l of data.getLessons()) {
    for (const w of l.words || []) {
      for (const part of normKey(w.word).split(/\s+/)) VOCAB.add(part);
    }
  }
  try {
    const { buildGlobalDict } = require('../lib/globalvocab');
    for (const e of buildGlobalDict()) {
      for (const part of String(e.key || '').split(/\s+/)) VOCAB.add(part);
    }
  } catch (err) {
    console.warn('global vocab 不可用，动词原形还原仅用教材词表：', err.message);
  }
  for (const base of Object.values(IRREGULAR)) VOCAB.add(base);
  return VOCAB;
}

// 词典中词性含 v./phr. 的键，用于「动词 + 介词」短语动词判定
let VERB_KEYS = null;
function verbKeys() {
  if (VERB_KEYS) return VERB_KEYS;
  VERB_KEYS = new Set();
  for (const l of data.getLessons()) {
    for (const w of l.words || []) {
      // 按词性记号精确匹配，避免 adv. 被 v. 误伤
      const posTokens = String(w.pos || '').toLowerCase().split(/[^a-z]+/);
      if (posTokens.some((t) => ['v', 'vt', 'vi', 'verb', 'phr'].includes(t))) {
        VERB_KEYS.add(normKey(w.word));
      }
    }
  }
  return VERB_KEYS;
}

/**
 * 尝试把屈折形式还原为词表里的原形；还原不了返回 null。
 * allowPlural 控制是否尝试 -s/-es（名词复数误还原风险高，只在紧邻目标词时开启）。
 */
function lemmatize(tokenLower, allowPlural) {
  const v = vocab();
  if (NO_LEMMA.has(tokenLower)) return null;
  if (IRREGULAR[tokenLower]) return IRREGULAR[tokenLower];
  const candidates = [];
  if (tokenLower.endsWith('ing') && tokenLower.length > 4) {
    const stem = tokenLower.slice(0, -3);
    candidates.push(stem, stem + 'e');
    if (/(.)\1$/.test(stem)) candidates.push(stem.slice(0, -1)); // running → run
  }
  if (tokenLower.endsWith('ied') && tokenLower.length > 4) {
    candidates.push(tokenLower.slice(0, -3) + 'y'); // studied → study
  }
  if (tokenLower.endsWith('ed') && tokenLower.length > 3) {
    const stem = tokenLower.slice(0, -2);
    candidates.push(stem, stem + 'e');
    if (/(.)\1$/.test(stem)) candidates.push(stem.slice(0, -1)); // stopped → stop
    candidates.push(tokenLower.slice(0, -1)); // lived → live
  }
  if (allowPlural) {
    if (tokenLower.endsWith('ies') && tokenLower.length > 4) {
      candidates.push(tokenLower.slice(0, -3) + 'y'); // studies → study
    }
    if (tokenLower.endsWith('es') && tokenLower.length > 3) candidates.push(tokenLower.slice(0, -2));
    // 词干至少 3 个字母，避免 his → hi 这类误还原
    if (tokenLower.endsWith('s') && tokenLower.length > 3) candidates.push(tokenLower.slice(0, -1));
  }
  for (const c of candidates) {
    if (c !== tokenLower && v.has(c)) return c;
  }
  return null;
}

// ---------- 短语提取 ----------

function tokenize(en) {
  // 单词与标点分开成 token，标点作为短语边界
  return String(en).match(/[A-Za-z][A-Za-z''-]*|[^\sA-Za-z]+/g) || [];
}

function isWordToken(t) {
  return /^[A-Za-z]/.test(t);
}

/** 缩写形式（it's / don't / I'm …）一律视为短语边界，不进入搭配 */
function isContraction(t) {
  return /['']/.test(t);
}

function classOf(tokenLower) {
  if (AUX.has(tokenLower)) return 'aux';
  if (PRON.has(tokenLower)) return 'pron';
  if (DET.has(tokenLower)) return 'det';
  if (DEMO.has(tokenLower)) return 'demo';
  if (PREP.has(tokenLower)) return 'prep';
  if (CONJ.has(tokenLower)) return 'conj';
  if (ADV_STOP.has(tokenLower)) return 'advstop';
  return 'content';
}

/** 在 token 流中找目标词（key 可为多词短语；首词允许屈折形式），返回 [start, end) 或 null */
function findTargetSpan(tokens, key) {
  const parts = key.split(/\s+/).filter(Boolean);
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length; j++) {
      const tok = tokens[i + j];
      if (!isWordToken(tok)) { ok = false; break; }
      const low = tok.toLowerCase();
      if (low === parts[j]) continue;
      // 仅短语首词允许屈折（looked after → look after）
      if (j === 0 && lemmatize(low, true) === parts[j]) continue;
      ok = false;
      break;
    }
    if (ok) return [i, i + parts.length];
  }
  return null;
}

/** 判断 token 是否疑似专有名词：句中大写开头且小写形式不在词表 */
function isProperNoun(token, index) {
  if (!/^[A-Z]/.test(token)) return false;
  const low = token.toLowerCase();
  if (index === 0) return !vocab().has(low) && classOf(low) === 'content';
  return true;
}

/**
 * 从整句中提取包含目标词的核心短语（目标词 ±2~3 个搭配词）。
 * 提不出合格短语返回 null，宁缺毋滥。
 */
function extractPhrase(en, key) {
  const tokens = tokenize(en);
  const span = findTargetSpan(tokens, key);
  if (!span) return null;
  const [ts, te] = span;

  // 向左扩展：吸收介词/限定词/内容词，遇到助动词、代词、连词、副词、缩写、标点、专有名词即停
  let start = ts;
  let budget = 3;
  while (start > 0 && budget > 0) {
    const tok = tokens[start - 1];
    if (!isWordToken(tok) || isContraction(tok)) break;
    if (isProperNoun(tok, start - 1)) break;
    const cls = classOf(tok.toLowerCase());
    if (cls === 'aux' || cls === 'pron' || cls === 'conj' || cls === 'advstop') break;
    start--;
    budget--;
  }

  // 向右扩展：介词可延续，冠词后必须紧跟内容词（冠词不占词数预算，避免名词短语被截半）；
  // 指示词/助动词/代词等即停
  let end = te;
  budget = 3;
  while (end < tokens.length && budget > 0) {
    const tok = tokens[end];
    if (!isWordToken(tok) || isContraction(tok)) break;
    if (isProperNoun(tok, end)) break;
    const cls = classOf(tok.toLowerCase());
    if (cls === 'aux' || cls === 'pron' || cls === 'conj' || cls === 'advstop' || cls === 'demo') break;
    if (cls === 'det') {
      const next = tokens[end + 1];
      const nextOk = next && isWordToken(next) &&
        !isProperNoun(next, end + 1) && classOf(next.toLowerCase()) === 'content';
      if (!nextOk) break;
      end++;
      continue; // 冠词免预算
    }
    end++;
    budget--;
  }

  let phrase = tokens.slice(start, end);
  const targetOffset = () => ts - start;
  const keyIsVerb = verbKeys().has(key);

  // 动词目标词左侧若是「限定词 + 名词」，视为主语整体裁掉（the man collect tickets → collect tickets）
  if (keyIsVerb && targetOffset() > 0) {
    const firstCls = classOf(phrase[0].toLowerCase());
    if (firstCls === 'det' || firstCls === 'demo') {
      phrase = phrase.slice(targetOffset());
      start = ts;
    }
  }

  // 去掉结尾残渣：限定词/连词/助动词等一律裁掉；
  // 结尾介词只有「动词 + 紧邻介词」时保留（look at），其余悬空介词裁掉（arrive at six in / sweater with →）；
  // 非动词目标词后面挂着的过去式谓语裁掉（customer started → customer）
  function looksLikePastVerb(tokLower) {
    if (IRREGULAR[tokLower]) return true;
    return tokLower.endsWith('ed') && !!lemmatize(tokLower, false);
  }
  function trimTrailing() {
    while (phrase.length > 1) {
      const lastIdx = phrase.length - 1;
      const low = phrase[lastIdx].toLowerCase();
      const cls = classOf(low);
      const tOffNow = targetOffset();
      const targetEnd = tOffNow + (te - ts);
      // 目标词前面紧跟限定词 ⇒ 本句中作名词用（a picnic by …），不适用短语动词的结尾介词豁免
      const usedAsNoun = tOffNow > 0 &&
        ['det', 'demo'].includes(classOf(phrase[tOffNow - 1].toLowerCase()));
      const dangling =
        cls === 'det' || cls === 'demo' || cls === 'conj' || cls === 'aux' ||
        cls === 'pron' || cls === 'advstop' ||
        (cls === 'prep' && !(keyIsVerb && !usedAsNoun && lastIdx === targetEnd)) ||
        (!keyIsVerb && lastIdx >= targetEnd && looksLikePastVerb(low));
      if (dangling) phrase.pop();
      else break;
    }
  }
  trimTrailing();
  // 超长先从右截到 6 词，再清一次结尾残渣
  while (phrase.length > 6 && phrase.length - 1 >= targetOffset() + (te - ts)) phrase.pop();
  trimTrailing();
  // 目标词必须还在短语里
  if (targetOffset() < 0 || targetOffset() + (te - ts) > phrase.length) return null;

  // 统一小写（专有名词已在扩展阶段挡掉）
  phrase = phrase.map((t) => t.toLowerCase());

  // 动词目标词还原为原形（takes time → take time）；
  // 名词等保留句面形式，避免复数被强改成单数破坏语法（some beans on the plate）
  const tOff = targetOffset();
  const keyParts = key.split(/\s+/).filter(Boolean);
  if (keyIsVerb) {
    for (let j = 0; j < keyParts.length; j++) phrase[tOff + j] = keyParts[j];
  }

  // 首词若是动词屈折形式则还原原形（drinks coffee → drink coffee）
  if (tOff > 0 || keyParts.length > 1) {
    const first = phrase[0];
    if (classOf(first) === 'content') {
      const allowPlural = tOff === 1; // -s 还原只在紧邻目标词（动宾结构）时启用
      const base = lemmatize(first, allowPlural);
      if (base) phrase[0] = base;
    }
  }

  // 硬性过滤：2~6 词、含目标词、无句末标点（构造保证）、除目标词外至少一个搭配词
  if (phrase.length < 2 || phrase.length > 6) return null;
  const isMultiwordKey = keyParts.length > 1;
  if (!isMultiwordKey || phrase.length > keyParts.length) {
    let hasCollocate = false;
    let phrasalVerb = false;
    let prepNoun = false;
    for (let i = 0; i < phrase.length; i++) {
      if (i >= tOff && i < tOff + keyParts.length) continue;
      const cls = classOf(phrase[i]);
      if (cls === 'content') hasCollocate = true;
      // 「动词 + 紧邻介词」才算短语动词（look at）；副词/名词 + 介词不算（abroad before）
      if (cls === 'prep' && i === tOff + keyParts.length && keyIsVerb) phrasalVerb = true;
      // 「介词 + 名词」介词搭配（in spring / by bus），动词前的介词不算
      if (cls === 'prep' && i === tOff - 1 && !keyIsVerb) prepNoun = true;
    }
    const twoWordOk = (phrasalVerb || prepNoun) && phrase.length === keyParts.length + 1;
    if (!hasCollocate && !twoWordOk) return null;
  }
  if (!isMultiwordKey && phrase.length === 1) return null;

  return phrase.join(' ');
}

// ---------- 教材扫描 ----------

function splitEg(eg) {
  if (!eg) return null;
  const s = String(eg).trim();
  const idx = s.search(/\s[一-鿿（(]/);
  if (idx > 0) return { en: s.slice(0, idx).trim(), cn: s.slice(idx).trim() };
  return { en: s, cn: '' };
}

function enFromGrammarExample(ex) {
  return String(ex)
    .replace(/\s*[（(][^）)]+[）)]\s*$/, '')
    .trim();
}

/** 全部教材词条 + 手工表中的语法短语 */
function buildPriorityKeys() {
  const keys = new Set(Object.keys(MANUAL).map(normKey));
  for (const l of data.getLessons()) {
    for (const w of l.words || []) {
      keys.add(normKey(w.word));
    }
  }
  return keys;
}

function lessonsForKey(key) {
  const out = [];
  for (const l of data.getLessons()) {
    if ((l.words || []).some((w) => normKey(w.word) === key)) out.push(l);
  }
  return out;
}

function buildFromLessons(key) {
  const collocations = [];
  const examples = [];
  const colSeen = new Set();
  const exSeen = new Set();

  // 短语中文：短语级中文难以从整句可靠截取，回退用词义（人工表里有精修的短语中文）
  let wordCn = '';

  function addCol(en, cn) {
    if (!en) return;
    const ck = en.toLowerCase();
    if (colSeen.has(ck)) return;
    colSeen.add(ck);
    collocations.push({ en, cn: cn || '' });
  }
  function addEx(en, cn) {
    if (!en) return;
    const ek = en.toLowerCase();
    if (exSeen.has(ek)) return;
    exSeen.add(ek);
    examples.push({ en, cn: cn || '' });
  }

  for (const l of lessonsForKey(key)) {
    for (const w of l.words || []) {
      if (normKey(w.word) !== key) continue;
      if (!wordCn && w.cn) wordCn = String(w.cn).trim();
      const p = splitEg(w.eg);
      if (p) {
        addEx(p.en, p.cn);
        const phrase = extractPhrase(p.en, key);
        if (phrase) addCol(phrase, wordCn);
      }
    }
    for (const g of l.grammar || []) {
      for (const ex of g.examples || []) {
        const en = enFromGrammarExample(ex);
        const phrase = extractPhrase(en, key);
        if (phrase) addCol(phrase, wordCn);
      }
    }
  }
  return { collocations: collocations.slice(0, 6), examples: examples.slice(0, 6) };
}

// ---------- 合并（人工表优先、原样保留） ----------

function colKey(en) {
  return String(en).toLowerCase().replace(/[.!?]+$/, '').trim();
}

function mergeEntry(key, manual, fromLessons) {
  const colSeen = new Set();
  const exSeen = new Set();
  const collocations = [];
  const examples = [];
  const patterns = [];

  function addCol(c) {
    const ck = colKey(c.en);
    if (!ck || colSeen.has(ck)) return;
    colSeen.add(ck);
    collocations.push(c);
  }
  function addEx(e) {
    const ek = e.en.toLowerCase();
    if (exSeen.has(ek)) return;
    exSeen.add(ek);
    examples.push(e);
  }

  // 人工表先入队：条目原样保留、去重时以人工表为准；
  // 自动短语若已被某条人工搭配完整包含（turn left ⊂ turn left / turn right），不再重复收录
  const manualEns = (manual.collocations || []).map((c) => colKey(c.en));
  for (const c of manual.collocations || []) addCol(c);
  for (const c of fromLessons.collocations) {
    const ck = colKey(c.en);
    if (manualEns.some((m) => m.includes(ck))) continue;
    addCol(c);
  }
  for (const e of manual.examples || []) addEx(e);
  for (const e of fromLessons.examples) addEx(e);
  for (const p of manual.patterns || []) patterns.push(p);

  const entry = {};
  if (collocations.length) entry.collocations = collocations.slice(0, 10);
  if (patterns.length) entry.patterns = patterns.slice(0, 4);
  if (examples.length) entry.examples = examples.slice(0, 8);
  return Object.keys(entry).length ? entry : null;
}

function main() {
  const out = {};
  const keys = buildPriorityKeys();

  for (const key of [...keys].sort()) {
    const manual = MANUAL[key] || MANUAL[Object.keys(MANUAL).find((k) => normKey(k) === key)] || {};
    const fromLessons = buildFromLessons(key);
    const entry = mergeEntry(key, manual, fromLessons);
    if (entry) out[key] = entry;
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${Object.keys(out).length} entries → ${OUT}`);
}

main();
