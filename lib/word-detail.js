'use strict';
// 词典词条详情：从教材全册聚合例句、搭配与课内语法句型

const { normKey } = require('./dict');
const { findEntry } = require('./wordlookup');
const { buildGlobalDict } = require('./globalvocab');
const { getWordForms } = require('./word-forms');
const { getLexiconExtras } = require('./word-lexicon');
const { getHits, getLesson } = require('./word-index');
const { readJSON } = require('./store');
const path = require('path');

let ENRICH = null;

function loadEnrich() {
  if (ENRICH) return ENRICH;
  ENRICH = readJSON(path.join(__dirname, '..', 'data', 'word-enrich.json'), {});
  return ENRICH;
}

/** 例句字段拆成英文 + 中文（教材 eg 多为「英文句 + 空格 + 中文」） */
function splitEg(eg) {
  if (!eg) return null;
  const s = String(eg).trim();
  const idx = s.search(/\s[\u4e00-\u9fff（(]/);
  if (idx > 0) {
    return { en: s.slice(0, idx).trim(), cn: s.slice(idx).trim() };
  }
  return { en: s, cn: '' };
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 从英文句中提取含目标词的短语搭配（前后各留 0–2 个词） */
function extractCollocations(en, key) {
  if (!en || !key) return [];
  const lower = en.toLowerCase();
  const k = key.toLowerCase();
  if (!lower.includes(k)) return [];

  const out = new Set();
  const trimmed = en.replace(/[.!?]+$/, '').trim();
  if (trimmed.length <= 72) out.add(trimmed);

  const parts = k.split(/\s+/).filter(Boolean);
  const re = new RegExp(
    `(?:[\\w'-]+\\s+){0,3}${parts.map(escapeRe).join('\\s+')}(?:\\s+[\\w'-]+){0,2}`,
    'i'
  );
  const m = en.match(re);
  if (m) {
    const phrase = m[0].trim();
    if (phrase.length > key.length + 1) out.add(phrase);
  }
  return [...out];
}

function resolveCollocationCn(en, key, wordCn, parentEn, parentCn) {
  const enLow = String(en || '').trim().toLowerCase();
  const keyLow = String(key || '').toLowerCase();
  const parentLow = String(parentEn || '').trim().toLowerCase();

  if (!enLow) return '';
  if (enLow === keyLow) return wordCn || '';
  if (parentLow && enLow === parentLow) return parentCn || '';

  // 从句中提取的短搭配，不用整句中文释义
  const mePhrase = `${keyLow} me`;
  if (enLow === mePhrase && wordCn) {
    const parts = String(wordCn).split(/[；;]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
  }

  return '';
}

function normalizePatternExample(ex) {
  if (ex == null) return { en: '', cn: '' };
  if (typeof ex === 'string') {
    return { en: enFromGrammarExample(ex), cn: cnFromGrammarExample(ex) };
  }
  if (typeof ex === 'object') {
    let en = ex.en != null ? ex.en : (ex.text || ex.english || '');
    let cn = ex.cn != null ? ex.cn : (ex.zh || ex.chinese || '');
    if (en && typeof en === 'object') {
      cn = cn || en.cn || '';
      en = en.en || en.text || '';
    }
    en = String(en || '').trim();
    cn = String(cn || '').trim();
    if (!en || en === '[object Object]') return { en: '', cn: '' };
    return { en, cn };
  }
  const raw = String(ex);
  return { en: enFromGrammarExample(raw), cn: cnFromGrammarExample(raw) };
}

function enFromGrammarExample(ex) {
  return String(ex)
    .replace(/\s*[（(][^）)]+[）)]\s*$/, '')
    .replace(/\s*（[^）]+）\s*$/, '')
    .trim();
}

function cnFromGrammarExample(ex) {
  const m = String(ex).match(/[（(]([^）)]+)[）)]\s*$/);
  return m ? m[1].trim() : '';
}

function attachLexExtras(detail) {
  if (!detail || !detail.word) return detail;
  const { synonyms, related, variants } = getLexiconExtras(detail.word, { cn: detail.cn || '' });
  detail.forms = getWordForms(detail.word, detail.pos || '');
  detail.synonyms = synonyms;
  detail.related = related;
  detail.variants = variants;
  return detail;
}

function hasDetailContent(detail) {
  if (!detail) return false;
  return !!(
    detail.cn ||
    (detail.collocations && detail.collocations.length) ||
    (detail.patterns && detail.patterns.length) ||
    (detail.examples && detail.examples.length) ||
    (detail.sources && detail.sources.length) ||
    (detail.forms && detail.forms.length) ||
    (detail.synonyms && detail.synonyms.length) ||
    (detail.related && detail.related.length) ||
    (detail.variants && detail.variants.length)
  );
}

function getWordDetail(word) {
  const key = normKey(word);
  if (!key) return null;

  const primary = findEntry(key);
  const enrich = loadEnrich()[key] || null;
  const hits = getHits(key);
  const lessonKeys = new Set(hits.map((h) => `${h.book}-${h.lesson}`));

  if (!hits.length && !enrich && primary && primary.source === 'global') {
    const detail = attachLexExtras({
      word: primary.word,
      phon: primary.phon || '',
      pos: primary.pos || '',
      cn: primary.cn || '',
      collocations: primary.cn ? [{ en: primary.word, cn: primary.cn }] : [],
      patterns: [],
      examples: [],
      sources: [],
      source: 'global',
      bandLabel: primary.bandLabel || '',
    });
    return hasDetailContent(detail) ? detail : null;
  }

  if (!primary && !hits.length && !enrich) {
    const global = buildGlobalDict().find((e) => e.key === key);
    if (!global) return null;
    const detail = attachLexExtras({
      word: global.word,
      phon: global.phon || '',
      pos: global.pos || '',
      cn: global.cn || '',
      collocations: global.cn ? [{ en: global.word, cn: global.cn }] : [],
      patterns: [],
      examples: [],
      sources: [],
      source: 'global',
      bandLabel: global.bandLabel || '',
    });
    return hasDetailContent(detail) ? detail : null;
  }

  const patterns = [];
  const patternSeen = new Set();
  const examples = [];
  const exSeen = new Set();
  const colMap = new Map();

  function addPattern(p) {
    const title = p.title || '';
    if (!title || patternSeen.has(title)) return;
    patternSeen.add(title);
    patterns.push({
      title,
      explain: p.explain || '',
      examples: (p.examples || []).map(normalizePatternExample),
    });
  }

  function addExample(en, cn, meta) {
    if (!en) return;
    const sig = en.toLowerCase();
    if (exSeen.has(sig)) return;
    exSeen.add(sig);
    examples.push({
      en,
      cn: cn || '',
      book: meta.book,
      lesson: meta.lesson,
      lessonTitle: meta.lessonTitle || '',
    });
  }

  function addCollocation(en, cn) {
    if (!en) return;
    const ck = String(en).trim().toLowerCase().replace(/[.!?]+$/, '');
    if (colMap.has(ck)) {
      if (!colMap.get(ck).cn && cn) colMap.get(ck).cn = cn;
      return;
    }
    colMap.set(ck, { en: String(en).trim(), cn: cn || '' });
  }

  // 1. 手工 enrich 优先（固定搭配与句型讲解）
  if (enrich) {
    for (const c of enrich.collocations || []) addCollocation(c.en, c.cn || '');
    for (const p of enrich.patterns || []) addPattern(p);
    for (const ex of enrich.examples || []) addExample(ex.en, ex.cn || '', {});
  }

  // 2. 教材例句与课内语法
  for (const h of hits) {
    const parsed = splitEg(h.eg);
    if (parsed) {
      addExample(parsed.en, parsed.cn, h);
      for (const col of extractCollocations(parsed.en, key)) {
        addCollocation(
          col,
          resolveCollocationCn(col, key, h.cn, parsed.en, parsed.cn)
        );
      }
    }
  }

  for (const lk of lessonKeys) {
    const [book, lesson] = lk.split('-');
    const l = getLesson(Number(book), Number(lesson));
    if (!l) continue;
    for (const g of l.grammar || []) {
      addPattern({
        title: g.point || '',
        explain: g.explain || '',
        examples: (g.examples || []).slice(0, 4),
      });
    }
  }

  for (const lk of lessonKeys) {
    const [book, lesson] = lk.split('-');
    const l = getLesson(Number(book), Number(lesson));
    if (!l) continue;
    for (const g of l.grammar || []) {
      for (const ex of (g.examples || []).slice(0, 4)) {
        const en = enFromGrammarExample(ex);
        const cn = cnFromGrammarExample(ex);
        if (en.toLowerCase().includes(key)) {
          for (const col of extractCollocations(en, key)) {
            addCollocation(col, resolveCollocationCn(col, key, primary?.cn || hits[0]?.cn || '', en, cn));
          }
        }
      }
    }
  }

  const sources = [...lessonKeys].map((lk) => {
    const [book, lesson] = lk.split('-');
    const l = getLesson(Number(book), Number(lesson));
    return { book: Number(book), lesson: Number(lesson), title: l?.title || '' };
  });

  const collocations = [...colMap.values()];
  const detail = attachLexExtras({
    word: primary?.word || hits[0]?.word || word,
    phon: primary?.phon || hits[0]?.phon || enrich?.phon || '',
    pos: primary?.pos || hits[0]?.pos || enrich?.pos || '',
    cn: primary?.cn || hits[0]?.cn || enrich?.cn || '',
    collocations: collocations.slice(0, 12),
    patterns: patterns.slice(0, 6),
    examples: examples.slice(0, 12),
    sources,
  });
  return hasDetailContent(detail) ? detail : null;
}

module.exports = { getWordDetail, splitEg, extractCollocations };
