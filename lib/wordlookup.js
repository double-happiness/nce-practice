'use strict';
// 教材词表 + 全局词库 + 用户 extras 统一检索

const { buildDict, normKey } = require('./dict');
const { buildGlobalDict } = require('./globalvocab');
const profile = require('./profile');
const { readJSON } = require('./store');

function loadExtras() {
  const v = readJSON(profile.file('words.json'), { states: {}, extras: {} });
  const ex = v && v.extras && typeof v.extras === 'object' ? v.extras : {};
  return ex;
}

/** 合并词表：教材优先，其次 extras，再全局词库 */
function buildLookupDict() {
  const seen = new Set();
  const out = [];
  for (const e of buildDict()) {
    seen.add(e.key);
    out.push({ ...e, source: 'textbook' });
  }
  for (const [key, meta] of Object.entries(loadExtras())) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      word: meta.word || key,
      key,
      phon: meta.phon || '',
      pos: meta.pos || '',
      cn: meta.cn || '',
      eg: meta.eg || '',
      book: meta.book,
      lesson: meta.lesson,
      lessonTitle: meta.lessonTitle || '',
      band: meta.band,
      bandLabel: meta.bandLabel || '',
      source: meta.source || 'extra',
    });
  }
  for (const e of buildGlobalDict()) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    out.push({
      ...e,
      source: 'global',
    });
  }
  return out;
}

function findEntry(key) {
  const k = normKey(key);
  if (!k) return null;
  return buildLookupDict().find((e) => e.key === k) || null;
}

function matchScore(e, kw) {
  if (!kw) return 0;
  if (e.key === kw) return 100;
  if (e.key.startsWith(kw)) return 80;
  if (e.key.includes(kw)) return 60;
  const cn = String(e.cn).toLowerCase();
  if (cn.includes(kw)) return 40;
  const eg = String(e.eg).toLowerCase();
  if (eg.includes(kw)) return 20;
  const phon = String(e.phon).toLowerCase();
  if (phon.includes(kw)) return 10;
  return -1;
}

function search({ q, book, scope }) {
  const kw = q ? String(q).trim().toLowerCase() : '';
  let list = buildLookupDict();
  const sc = scope || 'all';
  if (sc === 'textbook') list = list.filter((e) => e.source === 'textbook');
  else if (sc === 'global') list = list.filter((e) => e.source === 'global');
  if (book) list = list.filter((e) => e.source !== 'textbook' || String(e.book) === String(book));
  if (kw) {
    list = list
      .map((e) => ({ e, score: matchScore(e, kw) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || (a.e.lesson || 0) - (b.e.lesson || 0))
      .map((x) => x.e);
  } else {
    list.sort((a, b) => (a.lesson || 999) - (b.lesson || 999) || a.key.localeCompare(b.key));
  }
  return list;
}

module.exports = { buildLookupDict, findEntry, search, matchScore, normKey };
