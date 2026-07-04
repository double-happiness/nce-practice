'use strict';
// 英文词形变化：动词变位、名词复数、形容词比较级等（词典详情用）

const { normKey } = require('./dict');

/** [原形, 三单, 过去式, 过去分词, 现在分词] */
const IRREG_VERBS = [
  ['be', 'is/are', 'was/were', 'been', 'being'],
  ['have', 'has', 'had', 'had', 'having'],
  ['do', 'does', 'did', 'done', 'doing'],
  ['go', 'goes', 'went', 'gone', 'going'],
  ['come', 'comes', 'came', 'come', 'coming'],
  ['see', 'sees', 'saw', 'seen', 'seeing'],
  ['make', 'makes', 'made', 'made', 'making'],
  ['take', 'takes', 'took', 'taken', 'taking'],
  ['get', 'gets', 'got', 'got/gotten', 'getting'],
  ['give', 'gives', 'gave', 'given', 'giving'],
  ['say', 'says', 'said', 'said', 'saying'],
  ['tell', 'tells', 'told', 'told', 'telling'],
  ['know', 'knows', 'knew', 'known', 'knowing'],
  ['think', 'thinks', 'thought', 'thought', 'thinking'],
  ['find', 'finds', 'found', 'found', 'finding'],
  ['leave', 'leaves', 'left', 'left', 'leaving'],
  ['feel', 'feels', 'felt', 'felt', 'feeling'],
  ['keep', 'keeps', 'kept', 'kept', 'keeping'],
  ['let', 'lets', 'let', 'let', 'letting'],
  ['put', 'puts', 'put', 'put', 'putting'],
  ['mean', 'means', 'meant', 'meant', 'meaning'],
  ['meet', 'meets', 'met', 'met', 'meeting'],
  ['run', 'runs', 'ran', 'run', 'running'],
  ['write', 'writes', 'wrote', 'written', 'writing'],
  ['read', 'reads', 'read', 'read', 'reading'],
  ['speak', 'speaks', 'spoke', 'spoken', 'speaking'],
  ['buy', 'buys', 'bought', 'bought', 'buying'],
  ['bring', 'brings', 'brought', 'brought', 'bringing'],
  ['build', 'builds', 'built', 'built', 'building'],
  ['catch', 'catches', 'caught', 'caught', 'catching'],
  ['choose', 'chooses', 'chose', 'chosen', 'choosing'],
  ['cut', 'cuts', 'cut', 'cut', 'cutting'],
  ['draw', 'draws', 'drew', 'drawn', 'drawing'],
  ['drink', 'drinks', 'drank', 'drunk', 'drinking'],
  ['drive', 'drives', 'drove', 'driven', 'driving'],
  ['eat', 'eats', 'ate', 'eaten', 'eating'],
  ['fall', 'falls', 'fell', 'fallen', 'falling'],
  ['fly', 'flies', 'flew', 'flown', 'flying'],
  ['forget', 'forgets', 'forgot', 'forgotten', 'forgetting'],
  ['grow', 'grows', 'grew', 'grown', 'growing'],
  ['hang', 'hangs', 'hung', 'hung', 'hanging'],
  ['hear', 'hears', 'heard', 'heard', 'hearing'],
  ['hide', 'hides', 'hid', 'hidden', 'hiding'],
  ['hold', 'holds', 'held', 'held', 'holding'],
  ['hurt', 'hurts', 'hurt', 'hurt', 'hurting'],
  ['lay', 'lays', 'laid', 'laid', 'laying'],
  ['lead', 'leads', 'led', 'led', 'leading'],
  ['learn', 'learns', 'learnt/learned', 'learnt/learned', 'learning'],
  ['lend', 'lends', 'lent', 'lent', 'lending'],
  ['lie', 'lies', 'lay', 'lain', 'lying'],
  ['lose', 'loses', 'lost', 'lost', 'losing'],
  ['pay', 'pays', 'paid', 'paid', 'paying'],
  ['ride', 'rides', 'rode', 'ridden', 'riding'],
  ['ring', 'rings', 'rang', 'rung', 'ringing'],
  ['rise', 'rises', 'rose', 'risen', 'rising'],
  ['sell', 'sells', 'sold', 'sold', 'selling'],
  ['send', 'sends', 'sent', 'sent', 'sending'],
  ['set', 'sets', 'set', 'set', 'setting'],
  ['shake', 'shakes', 'shook', 'shaken', 'shaking'],
  ['shine', 'shines', 'shone', 'shone', 'shining'],
  ['show', 'shows', 'showed', 'shown', 'showing'],
  ['shut', 'shuts', 'shut', 'shut', 'shutting'],
  ['sing', 'sings', 'sang', 'sung', 'singing'],
  ['sit', 'sits', 'sat', 'sat', 'sitting'],
  ['sleep', 'sleeps', 'slept', 'slept', 'sleeping'],
  ['spend', 'spends', 'spent', 'spent', 'spending'],
  ['stand', 'stands', 'stood', 'stood', 'standing'],
  ['steal', 'steals', 'stole', 'stolen', 'stealing'],
  ['swim', 'swims', 'swam', 'swum', 'swimming'],
  ['teach', 'teaches', 'taught', 'taught', 'teaching'],
  ['throw', 'throws', 'threw', 'thrown', 'throwing'],
  ['understand', 'understands', 'understood', 'understood', 'understanding'],
  ['wake', 'wakes', 'woke', 'woken', 'waking'],
  ['wear', 'wears', 'wore', 'worn', 'wearing'],
  ['win', 'wins', 'won', 'won', 'winning'],
  ['break', 'breaks', 'broke', 'broken', 'breaking'],
  ['begin', 'begins', 'began', 'begun', 'beginning'],
  ['become', 'becomes', 'became', 'become', 'becoming'],
];

const IRREG_VERB_MAP = new Map();
for (const row of IRREG_VERBS) {
  IRREG_VERB_MAP.set(normKey(row[0]), row);
}

const IRREG_NOUNS = {
  child: 'children',
  man: 'men',
  woman: 'women',
  person: 'people',
  foot: 'feet',
  tooth: 'teeth',
  mouse: 'mice',
  goose: 'geese',
  ox: 'oxen',
  knife: 'knives',
  wife: 'wives',
  life: 'lives',
  leaf: 'leaves',
  shelf: 'shelves',
  wolf: 'wolves',
  half: 'halves',
  thief: 'thieves',
  loaf: 'loaves',
  potato: 'potatoes',
  tomato: 'tomatoes',
  hero: 'heroes',
  echo: 'echoes',
  volcano: 'volcanoes',
  sheep: 'sheep',
  fish: 'fish',
  deer: 'deer',
  aircraft: 'aircraft',
  series: 'series',
  species: 'species',
};

const IRREG_ADJ = {
  good: { comp: 'better', supOnly: 'best' },
  bad: { comp: 'worse', supOnly: 'worst' },
  far: { comp: 'farther/further', supOnly: 'farthest/furthest' },
  little: { comp: 'less', supOnly: 'least' },
  many: { comp: 'more', supOnly: 'most' },
  much: { comp: 'more', supOnly: 'most' },
  old: { comp: 'older/elder', supOnly: 'oldest/eldest' },
  late: { comp: 'later', supOnly: 'latest/last' },
};

const NO_CONJUGATE = new Set([
  'morning', 'evening', 'building', 'feeling', 'meeting', 'shopping', 'swimming',
  'clothing', 'ceiling', 'nothing', 'something', 'during', 'interesting',
]);

function parsePos(posStr) {
  const p = String(posStr || '').toLowerCase();
  if (/\b(v|vt|vi|verb)\b|\.v\b|phr\.?\s*v|v\.phr/.test(p)) return 'verb';
  if (/\b(n|noun)\b|\.n\b/.test(p)) return 'noun';
  if (/\b(adj|a)\b|\.adj\b|\.a\b/.test(p)) return 'adj';
  if (/\b(adv|ad)\b|\.adv\b/.test(p)) return 'adv';
  return 'other';
}

function endsWithConsonantY(w) {
  return w.length > 2 && w.endsWith('y') && !'aeiou'.includes(w[w.length - 2]);
}

function shortStem(w) {
  if (w.length >= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
    return w + w.slice(-1);
  }
  return w;
}

function thirdPerson(w) {
  const key = normKey(w);
  if (IRREG_VERB_MAP.has(key)) return IRREG_VERB_MAP.get(key)[1];
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  if (endsWithConsonantY(w)) return w.slice(0, -1) + 'ies';
  if (w.endsWith('o') && w.length > 2) return w + 'es';
  return w + 's';
}

function pastTense(w) {
  const key = normKey(w);
  if (IRREG_VERB_MAP.has(key)) return IRREG_VERB_MAP.get(key)[2];
  if (w.endsWith('e')) return w + 'd';
  if (endsWithConsonantY(w)) return w.slice(0, -1) + 'ied';
  if (w.length >= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
    return w + w.slice(-1) + 'ed';
  }
  return w + 'ed';
}

function pastParticiple(w) {
  const key = normKey(w);
  if (IRREG_VERB_MAP.has(key)) return IRREG_VERB_MAP.get(key)[3];
  return pastTense(w);
}

function presentParticiple(w) {
  const key = normKey(w);
  if (IRREG_VERB_MAP.has(key)) return IRREG_VERB_MAP.get(key)[4];
  if (w.endsWith('ie')) return w.slice(0, -2) + 'ying';
  if (endsWithConsonantY(w)) return w.slice(0, -1) + 'ying';
  if (w.endsWith('e') && !w.endsWith('ee')) return w.slice(0, -1) + 'ing';
  if (w.length >= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
    return w + w.slice(-1) + 'ing';
  }
  return w + 'ing';
}

function pluralNoun(w) {
  const key = normKey(w);
  if (IRREG_NOUNS[key]) return IRREG_NOUNS[key];
  if (endsWithConsonantY(w)) return w.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  if (w.endsWith('f')) return w.slice(0, -1) + 'ves';
  if (w.endsWith('fe')) return w.slice(0, -2) + 'ves';
  if (w.endsWith('o') && w.length > 2) return w + 'es';
  return w + 's';
}

function adjectiveForms(w) {
  const key = normKey(w);
  if (IRREG_ADJ[key]) {
    const r = IRREG_ADJ[key];
    return [
      { label: '比较级', form: r.comp },
      { label: '最高级', form: r.supOnly },
    ];
  }
  if (endsWithConsonantY(w)) {
    const stem = w.slice(0, -1);
    return [
      { label: '比较级', form: stem + 'ier' },
      { label: '最高级', form: stem + 'iest' },
    ];
  }
  const stem = shortStem(w);
  if (w.length <= 6) {
    return [
      { label: '比较级', form: stem + 'er' },
      { label: '最高级', form: stem + 'est' },
    ];
  }
  return [
    { label: '比较级', form: 'more ' + w },
    { label: '最高级', form: 'most ' + w },
  ];
}

function adverbForms(w) {
  if (w.length <= 4 && !w.endsWith('ly')) return [];
  if (w.endsWith('ly')) {
    return [{ label: '形容词形式', form: w.slice(0, -2) }];
  }
  if (endsWithConsonantY(w)) {
    return [{ label: '副词形式', form: w.slice(0, -1) + 'ily' }];
  }
  return [{ label: '副词形式', form: w + 'ly' }];
}

function getWordForms(word, posStr) {
  const raw = String(word || '').trim();
  if (!raw || raw.includes(' ')) return [];
  const key = normKey(raw);
  if (NO_CONJUGATE.has(key)) return [];

  const pos = parsePos(posStr);
  const w = raw.toLowerCase();
  const groups = [];

  if (pos === 'verb') {
    const items = [
      { label: '第三人称单数', form: thirdPerson(w) },
      { label: '过去式', form: pastTense(w) },
      { label: '过去分词', form: pastParticiple(w) },
      { label: '现在分词', form: presentParticiple(w) },
    ];
    const dedup = [];
    const seen = new Set([w]);
    for (const it of items) {
      const f = it.form.split('/')[0].trim();
      if (seen.has(f)) continue;
      seen.add(f);
      dedup.push(it);
    }
    if (dedup.length) groups.push({ group: '动词变化', items: dedup });
  }

  if (pos === 'noun') {
    const pl = pluralNoun(w);
    if (pl && pl.toLowerCase() !== w) {
      groups.push({ group: '名词变化', items: [{ label: '复数', form: pl }] });
    }
  }

  if (pos === 'adj') {
    const items = adjectiveForms(w);
    if (items.length) groups.push({ group: '形容词变化', items });
    const advItems = adverbForms(w);
    if (advItems.length) groups.push({ group: '副词形式', items: advItems });
  }

  return groups;
}

module.exports = { getWordForms, parsePos };
