'use strict';
// 全局英语词库：按频率/CEFR 分 band，供「总词汇量」测试使用（独立于新概念教材词表）

const path = require('path');
const { readJSON } = require('./store');
const { normKey } = require('./dict');

const VOCAB_PATH = path.join(__dirname, '..', 'data', 'global-vocab.json');

let cached = null;

function loadMeta() {
  if (cached) return cached;
  const raw = readJSON(VOCAB_PATH, null);
  if (!raw || !Array.isArray(raw.bands)) {
    cached = { version: 1, bands: [], bandLabels: [] };
    return cached;
  }
  cached = raw;
  return cached;
}

/** 扁平词表，每项含 band / bandLabel，供 vocabtest 抽样与判分 */
function buildGlobalDict() {
  const meta = loadMeta();
  const out = [];
  for (const b of meta.bands) {
    const band = Number(b.band);
    const bandLabel = b.label || `Band ${band}`;
    for (const w of b.words || []) {
      const key = normKey(w.word);
      if (!key || !w.cn) continue;
      out.push({
        word: w.word,
        key,
        phon: w.phon || '',
        pos: w.pos || '',
        cn: w.cn,
        eg: w.eg || '',
        band,
        bandLabel,
      });
    }
  }
  return out;
}

function getBandMeta() {
  const meta = loadMeta();
  return (meta.bands || []).map((b) => ({
    band: Number(b.band),
    label: b.label || '',
    cefr: b.cefr || '',
    total: (b.words || []).length,
  }));
}

function getVocabInfo() {
  const dict = buildGlobalDict();
  return {
    version: loadMeta().version || 1,
    description: loadMeta().description || '',
    dictTotal: dict.length,
    bands: getBandMeta(),
  };
}

module.exports = { buildGlobalDict, getBandMeta, getVocabInfo, VOCAB_PATH };
