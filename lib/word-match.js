'use strict';
// 词条在句中匹配：严格整词 / 屈折还原（loose）

const { normKey } = require('./dict');

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

const NO_LEMMA = new Set([
  'morning', 'evening', 'nothing', 'something', 'anything', 'everything',
  'during', 'interesting', 'boring', 'exciting', 'amazing', 'surprising',
  'wedding', 'ceiling', 'king', 'ring', 'spring', 'string', 'thing', 'wing',
  'pudding', 'building', 'feeling', 'meeting', 'shopping', 'swimming',
  'skating', 'sightseeing', 'clothing', 'painting', 'drawing',
]);

const BASE_VERB_SUPPLEMENT = [
  'study', 'live', 'stay', 'work', 'play', 'walk', 'talk', 'watch', 'listen',
  'learn', 'read', 'write', 'cook', 'clean', 'visit', 'help', 'open', 'close',
  'start', 'finish', 'wait', 'ask', 'answer', 'call', 'move', 'turn', 'stop',
  'rain', 'snow', 'smile', 'laugh', 'cry', 'dance', 'jump', 'wash', 'brush',
  'change', 'arrive', 'return', 'travel', 'marry', 'drink', 'eat', 'want',
  'need', 'like', 'love', 'try', 'use', 'wear', 'carry', 'drive', 'fly',
];

let VOCAB = null;

function vocab() {
  if (VOCAB) return VOCAB;
  VOCAB = new Set(BASE_VERB_SUPPLEMENT);
  try {
    const data = require('./data');
    for (const l of data.getLessons()) {
      for (const w of l.words || []) {
        for (const part of normKey(w.word).split(/\s+/)) VOCAB.add(part);
      }
    }
  } catch (_) { /* data 未就绪时仅用补充表 */ }
  try {
    const { buildGlobalDict } = require('./globalvocab');
    for (const e of buildGlobalDict()) {
      for (const part of String(e.key || '').split(/\s+/)) VOCAB.add(part);
    }
  } catch (_) { /* */ }
  for (const base of Object.values(IRREGULAR)) VOCAB.add(base);
  return VOCAB;
}

function invalidateWordMatchCache() {
  VOCAB = null;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 尝试把屈折形式还原为词表里的原形；还原不了返回 null。
 */
function lemmatize(tokenLower, allowPlural) {
  const v = vocab();
  if (NO_LEMMA.has(tokenLower)) return null;
  if (IRREGULAR[tokenLower]) return IRREGULAR[tokenLower];
  const candidates = [];
  if (tokenLower.endsWith('ing') && tokenLower.length > 4) {
    const stem = tokenLower.slice(0, -3);
    candidates.push(stem, stem + 'e');
    if (/(.)\1$/.test(stem)) candidates.push(stem.slice(0, -1));
  }
  if (tokenLower.endsWith('ied') && tokenLower.length > 4) {
    candidates.push(tokenLower.slice(0, -3) + 'y');
  }
  if (tokenLower.endsWith('ed') && tokenLower.length > 3) {
    const stem = tokenLower.slice(0, -2);
    candidates.push(stem, stem + 'e');
    if (/(.)\1$/.test(stem)) candidates.push(stem.slice(0, -1));
    candidates.push(tokenLower.slice(0, -1));
  }
  if (allowPlural) {
    if (tokenLower.endsWith('ies') && tokenLower.length > 4) {
      candidates.push(tokenLower.slice(0, -3) + 'y');
    }
    if (tokenLower.endsWith('es') && tokenLower.length > 3) candidates.push(tokenLower.slice(0, -2));
    if (tokenLower.endsWith('s') && tokenLower.length > 3) candidates.push(tokenLower.slice(0, -1));
  }
  for (const c of candidates) {
    if (c !== tokenLower && v.has(c)) return c;
  }
  return null;
}

function tokenize(en) {
  return String(en).match(/[A-Za-z][A-Za-z''-]*|[^\sA-Za-z]+/g) || [];
}

function isWordToken(t) {
  return /^[A-Za-z]/.test(t);
}

/** 在 token 流中找目标词（首词允许屈折），返回 [start, end) 或 null */
function findTargetSpan(tokens, key) {
  const parts = key.split(/\s+/).filter(Boolean);
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length; j++) {
      const tok = tokens[i + j];
      if (!isWordToken(tok)) { ok = false; break; }
      const low = tok.toLowerCase();
      if (low === parts[j]) continue;
      if (j === 0 && lemmatize(low, true) === parts[j]) continue;
      ok = false;
      break;
    }
    if (ok) return [i, i + parts.length];
  }
  return null;
}

function strictWordRe(word) {
  const key = normKey(word);
  if (!key) return null;
  const body = key.split(/\s+/).map(escapeRe).join('\\s+');
  return new RegExp(`\\b${body}\\b`, 'i');
}

/** 判断一行英文是否含目标词；loose 时首词允许屈折还原 */
function lineMatchesWord(word, line, loose = false) {
  const key = normKey(word);
  if (!key || !line) return false;
  if (!loose) {
    const re = strictWordRe(word);
    return re ? re.test(line) : false;
  }
  return findTargetSpan(tokenize(line), key) !== null;
}

module.exports = {
  lemmatize,
  tokenize,
  findTargetSpan,
  lineMatchesWord,
  strictWordRe,
  invalidateWordMatchCache,
};
