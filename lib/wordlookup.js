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

function normalizeQuery(q) {
  const raw = String(q == null ? '' : q).trim();
  if (!raw) return '';
  return /[\u4e00-\u9fff]/.test(raw) ? raw : raw.toLowerCase();
}

function charCount(s) {
  return [...String(s)].length;
}

/** 单个英文单词（含撇号缩写，如 don't） */
function isEnglishWordQuery(kw) {
  return /^[a-z]+(?:'[a-z]+)?$/i.test(kw);
}

/** 英文短语（含空格，如 excuse me）；过短短语不按短语检索 */
function isEnglishPhraseQuery(kw) {
  if (!/^[a-z]+(?:'[a-z]+)?(?:\s+[a-z]+(?:'[a-z]+)?)+$/i.test(kw.trim())) return false;
  return kw.replace(/\s+/g, '').length >= 5;
}

function isChineseQuery(kw) {
  return /[\u4e00-\u9fff]/.test(kw);
}

/** 把释义拆成若干义项（按分号、逗号等） */
function cnSegments(cn) {
  return String(cn || '')
    .split(/[；;，,、/|]/)
    .map((s) => s.replace(/[（(][^）)]*[）)]/g, '').trim())
    .filter(Boolean);
}

/** 去掉括号标注后的主释义 */
function cnMainGloss(cn) {
  return String(cn || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .trim();
}

/**
 * 中文查词：只在词条释义中匹配，不用例句译文，不用括号内标注做模糊命中
 */
function matchChineseDefinition(cn, kw) {
  const text = String(cn || '');
  if (!text || !kw) return -1;
  const qlen = charCount(kw);
  let best = -1;

  for (const seg of cnSegments(text)) {
    if (seg === kw) best = Math.max(best, 100);
    else if (qlen >= 2 && seg.startsWith(kw)) best = Math.max(best, 90);
    else if (qlen >= 2 && seg.includes(kw)) best = Math.max(best, 80);
    else if (qlen === 1 && (seg === kw || seg.startsWith(kw))) best = Math.max(best, 75);
  }

  const main = cnMainGloss(text);
  if (main && main !== text) {
    if (main === kw) best = Math.max(best, 100);
    else if (qlen >= 2 && main.startsWith(kw)) best = Math.max(best, 88);
    else if (qlen >= 2 && main.includes(kw)) best = Math.max(best, 78);
    else if (qlen === 1 && main.startsWith(kw)) best = Math.max(best, 75);
  }

  return best;
}

/** 例句中的英文部分（不含中文译文） */
function egEnglishPart(eg) {
  const s = String(eg || '').trim();
  const idx = s.search(/\s[\u4e00-\u9fff（(]/);
  return (idx > 0 ? s.slice(0, idx) : s).trim().toLowerCase();
}

/** 英文短语是否作为完整连续词组出现在文本中 */
function phraseWordMatch(text, phrase) {
  const words = String(phrase || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const parts = String(text || '').toLowerCase().split(/[^a-z']+/).filter(Boolean);
  if (!words.length || parts.length < words.length) return false;
  for (let i = 0; i <= parts.length - words.length; i++) {
    let ok = true;
    for (let j = 0; j < words.length; j++) {
      if (parts[i + j] !== words[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * 词典式匹配：
 * - 英文单词：精确匹配；无精确结果时仅前缀补全
 * - 英文短语（≥5 字母）：仅在例句英文部分做整词短语匹配
 * - 中文：仅在释义义项中匹配
 */
function matchScore(e, kw) {
  if (!kw) return 0;
  if (e.key === kw) return 100;

  if (isEnglishWordQuery(kw)) {
    if (e.key.startsWith(kw)) return 80;
    return -1;
  }

  if (isEnglishPhraseQuery(kw)) {
    const egEn = egEnglishPart(e.eg);
    if (egEn && phraseWordMatch(egEn, kw)) return 70;
    return -1;
  }

  if (isChineseQuery(kw)) {
    return matchChineseDefinition(e.cn, kw);
  }

  const phon = String(e.phon).toLowerCase().replace(/\s/g, '');
  const qPhon = kw.replace(/\s/g, '');
  if (phon && qPhon && phon.includes(qPhon)) return 30;
  if (e.key.startsWith(kw)) return 50;
  return -1;
}

function refineChineseResults(pairs, kw) {
  if (!pairs.length) return pairs;
  const qlen = charCount(kw);
  if (qlen === 1) {
    return pairs.filter((x) => x.score >= 75);
  }
  const top = Math.max(...pairs.map((x) => x.score));
  if (top >= 100) {
    return pairs.filter((x) => x.score >= 80);
  }
  if (top >= 90) {
    return pairs.filter((x) => x.score >= 78);
  }
  return pairs;
}

function search({ q, book, scope }) {
  const kw = normalizeQuery(q);
  let list = buildLookupDict();
  const sc = scope || 'all';
  if (sc === 'textbook') list = list.filter((e) => e.source === 'textbook');
  else if (sc === 'global') list = list.filter((e) => e.source === 'global');
  if (book) list = list.filter((e) => e.source !== 'textbook' || String(e.book) === String(book));
  if (kw) {
    let pairs = list
      .map((e) => ({ e, score: matchScore(e, kw) }))
      .filter((x) => x.score >= 0);

    if (isEnglishWordQuery(kw) && pairs.some((x) => x.score === 100)) {
      pairs = pairs.filter((x) => x.score === 100);
    }
    if (isChineseQuery(kw)) {
      pairs = refineChineseResults(pairs, kw);
    }

    list = pairs
      .sort((a, b) => b.score - a.score || (a.e.lesson || 0) - (b.e.lesson || 0))
      .map((x) => x.e);
  } else {
    list.sort((a, b) => (a.lesson || 999) - (b.lesson || 999) || a.key.localeCompare(b.key));
  }
  return list;
}

module.exports = {
  buildLookupDict,
  findEntry,
  search,
  matchScore,
  normKey,
  isEnglishWordQuery,
  isChineseQuery,
  matchChineseDefinition,
  egEnglishPart,
  phraseWordMatch,
};
