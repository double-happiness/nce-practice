'use strict';
// 同义词 / 近义词 / 相关表达

const path = require('path');
const { readJSON } = require('./store');
const { normKey } = require('./dict');
const { buildLookupDict } = require('./wordlookup');

let LEX = null;

function mergeLexEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    synonyms: [...(a.synonyms || []), ...(b.synonyms || [])],
    related: [...(a.related || []), ...(b.related || [])],
    variants: [...(a.variants || []), ...(b.variants || [])],
  };
}

function loadLexicon() {
  if (LEX) return LEX;
  const base = readJSON(path.join(__dirname, '..', 'data', 'word-lexicon.json'), {});
  const merged = { ...base };
  for (const book of [1, 2, 3, 4]) {
    const extra = readJSON(
      path.join(__dirname, '..', 'data', `word-lexicon-b${book}.json`),
      {}
    );
    for (const [k, v] of Object.entries(extra)) {
      merged[k] = mergeLexEntry(merged[k], v);
    }
  }
  LEX = merged;
  return LEX;
}

function cnSegments(cn) {
  return String(cn || '')
    .split(/[；;，,、/|]/)
    .map((s) => s.replace(/[（(][^）)]*[）)]/g, '').trim())
    .filter(Boolean);
}

function sharedGloss(cn1, cn2) {
  const b = new Set(cnSegments(cn2));
  for (const x of cnSegments(cn1)) {
    if (x.length >= 2 && b.has(x)) return x;
  }
  return null;
}

function entryByKey(key) {
  return buildLookupDict().find((e) => e.key === key) || null;
}

function getLexiconExtras(word, opts) {
  const key = normKey(word);
  if (!key) return { synonyms: [], related: [], variants: [] };

  const manual = loadLexicon()[key] || {};
  const cn = opts && opts.cn ? String(opts.cn) : '';
  const seen = new Set([key]);
  const synonyms = [];
  const related = [];
  const variants = [];

  function addSyn(item) {
    const k = normKey(item.word || item.w);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const hit = entryByKey(k);
    synonyms.push({
      word: (hit && hit.word) || item.word || item.w,
      cn: item.cn || (hit && hit.cn) || '',
      note: item.note || '',
    });
  }

  for (const s of manual.synonyms || []) {
    addSyn(typeof s === 'string' ? { word: s } : s);
  }

  if (cn) {
    for (const e of buildLookupDict()) {
      if (e.key === key) continue;
      if (!sharedGloss(cn, e.cn)) continue;
      addSyn({ word: e.word, cn: e.cn, note: '释义相近' });
      if (synonyms.length >= 8) break;
    }
  }

  for (const r of manual.related || []) {
    const w = typeof r === 'string' ? r : r.word || r.w;
    const k = normKey(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const hit = entryByKey(k);
    related.push({
      word: (hit && hit.word) || w,
      cn: (typeof r === 'object' && r.cn) || (hit && hit.cn) || '',
      note: (typeof r === 'object' && r.note) || '',
    });
  }

  for (const v of manual.variants || []) {
    variants.push(typeof v === 'string' ? { form: v, note: '' } : v);
  }

  return {
    synonyms: synonyms.slice(0, 8),
    related: related.slice(0, 6),
    variants: variants.slice(0, 4),
  };
}

module.exports = { getLexiconExtras, loadLexicon };
