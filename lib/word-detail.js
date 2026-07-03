'use strict';
// 词典词条详情：从教材全册聚合例句、搭配与课内语法句型

const data = require('./data');
const { normKey } = require('./dict');
const { findEntry } = require('./wordlookup');
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

function cnFromGrammarExample(ex) {
  const m = String(ex).match(/[（(]([^）)]+)[）)]\s*$/);
  return m ? m[1].trim() : '';
}

function enFromGrammarExample(ex) {
  return String(ex)
    .replace(/\s*[（(][^）)]+[）)]\s*$/, '')
    .replace(/\s*（[^）]+）\s*$/, '')
    .trim();
}

function getWordDetail(word) {
  const key = normKey(word);
  if (!key) return null;

  const primary = findEntry(key);
  const hits = [];
  const lessonKeys = new Set();

  for (const l of data.getLessons()) {
    for (const w of l.words || []) {
      if (normKey(w.word) !== key) continue;
      hits.push({
        word: w.word,
        phon: w.phon || '',
        pos: w.pos || '',
        cn: w.cn || '',
        eg: w.eg || '',
        book: l.book,
        lesson: l.lesson,
        lessonTitle: l.title || '',
      });
      lessonKeys.add(`${l.book}-${l.lesson}`);
    }
  }

  const patterns = [];
  const patternSeen = new Set();
  for (const l of data.getLessons()) {
    if (!lessonKeys.has(`${l.book}-${l.lesson}`)) continue;
    for (const g of l.grammar || []) {
      const title = g.point || '';
      if (!title || patternSeen.has(title)) continue;
      patternSeen.add(title);
      patterns.push({
        title,
        explain: g.explain || '',
        examples: (g.examples || []).slice(0, 4),
      });
    }
  }

  const examples = [];
  const exSeen = new Set();
  const colMap = new Map();

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
    const ck = en.toLowerCase();
    if (colMap.has(ck)) {
      if (!colMap.get(ck).cn && cn) colMap.get(ck).cn = cn;
      return;
    }
    colMap.set(ck, { en, cn: cn || '' });
  }

  for (const h of hits) {
    const parsed = splitEg(h.eg);
    if (parsed) {
      addExample(parsed.en, parsed.cn, h);
      for (const col of extractCollocations(parsed.en, key)) {
        addCollocation(col, parsed.cn);
      }
    }
  }

  for (const p of patterns) {
    for (const ex of p.examples) {
      const en = enFromGrammarExample(ex);
      const cn = cnFromGrammarExample(ex);
      if (en.toLowerCase().includes(key)) {
        for (const col of extractCollocations(en, key)) {
          addCollocation(col, cn);
        }
      }
    }
  }

  const enrich = loadEnrich()[key];
  if (enrich) {
    for (const c of enrich.collocations || []) {
      addCollocation(c.en, c.cn || '');
    }
    for (const p of enrich.patterns || []) {
      if (!patternSeen.has(p.title)) {
        patternSeen.add(p.title);
        patterns.unshift(p);
      }
    }
    for (const ex of enrich.examples || []) {
      addExample(ex.en, ex.cn || '', {});
    }
  }

  const sources = [...lessonKeys].map((lk) => {
    const [book, lesson] = lk.split('-');
    const l = data.getLessons().find(
      (x) => String(x.book) === book && String(x.lesson) === lesson
    );
    return { book: Number(book), lesson: Number(lesson), title: l?.title || '' };
  });

  return {
    word: primary?.word || hits[0]?.word || word,
    phon: primary?.phon || hits[0]?.phon || '',
    pos: primary?.pos || hits[0]?.pos || '',
    cn: primary?.cn || hits[0]?.cn || '',
    collocations: [...colMap.values()].slice(0, 10),
    patterns: patterns.slice(0, 6),
    examples: examples.slice(0, 12),
    sources,
  };
}

module.exports = { getWordDetail, splitEg, extractCollocations };
