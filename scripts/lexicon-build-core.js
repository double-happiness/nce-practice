'use strict';

const path = require('path');
const data = require('../lib/data');
const { normKey } = require('../lib/dict');
const { writeJSONAtomic } = require('../lib/store');

function getBookKeys(book) {
  const keys = new Set();
  for (const l of data.getLessons()) {
    if (l.book !== book) continue;
    for (const w of l.words || []) {
      const k = normKey(w.word);
      if (k && !k.includes(' ')) keys.add(k);
    }
  }
  return keys;
}

function buildBookLexicon(book, { synPairs = [], clusterGroups = [], manual = {} } = {}) {
  const BOOK_KEYS = getBookKeys(book);
  const lex = {};

  function addSyn(a, b, note) {
    if (!BOOK_KEYS.has(a) || !BOOK_KEYS.has(b) || a === b) return false;
    if (!lex[a]) lex[a] = {};
    if (!lex[a].synonyms) lex[a].synonyms = [];
    if (!lex[a].synonyms.some((s) => (s.w || s) === b)) {
      lex[a].synonyms.push({ w: b, note: note || '' });
    }
    return true;
  }

  function applyClusters(groups) {
    let n = 0;
    for (const group of groups) {
      const hit = group.filter((w) => BOOK_KEYS.has(w));
      if (hit.length < 2) continue;
      for (const a of hit) {
        let added = 0;
        for (const b of hit) {
          if (a === b || added >= 4) continue;
          if (addSyn(a, b, '同类词')) {
            added++;
            n++;
          }
        }
      }
    }
    return n;
  }

  function mergeManual(key, entry) {
    if (!BOOK_KEYS.has(key)) return;
    if (!lex[key]) lex[key] = {};
    if (entry.synonyms) {
      for (const s of entry.synonyms) {
        const w = typeof s === 'string' ? s : s.w;
        const note = typeof s === 'string' ? '' : s.note || '';
        addSyn(key, w, note);
      }
    }
    if (entry.related) {
      lex[key].related = [
        ...(lex[key].related || []),
        ...entry.related.filter((r) => {
          const w = typeof r === 'string' ? r : r.word || r.w;
          const first = normKey(String(w).split(/\s+/)[0]);
          return BOOK_KEYS.has(first) || String(w).includes(' ');
        }),
      ];
    }
    if (entry.variants) {
      lex[key].variants = [...(lex[key].variants || []), ...entry.variants];
    }
  }

  let pairOk = 0;
  let pairSkip = 0;
  for (const [a, b, note] of synPairs) {
    if (addSyn(a, b, note)) pairOk++;
    else pairSkip++;
  }
  const clusterOk = applyClusters(clusterGroups);
  for (const [key, entry] of Object.entries(manual)) {
    mergeManual(key, entry);
  }

  const out = {};
  for (const [key, entry] of Object.entries(lex)) {
    const cleaned = {};
    if (entry.synonyms && entry.synonyms.length) cleaned.synonyms = entry.synonyms.slice(0, 6);
    if (entry.related && entry.related.length) cleaned.related = [...new Set(entry.related)];
    if (entry.variants && entry.variants.length) cleaned.variants = entry.variants;
    if (Object.keys(cleaned).length) out[key] = cleaned;
  }

  const dest = path.join(__dirname, '..', 'data', `word-lexicon-b${book}.json`);
  writeJSONAtomic(dest, out);
  return { dest, count: Object.keys(out).length, pairOk, pairSkip, clusterOk, vocab: BOOK_KEYS.size };
}

module.exports = { buildBookLexicon, getBookKeys };
