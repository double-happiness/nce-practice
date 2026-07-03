'use strict';
// 扫描 B1+B2 教材，为词典详情生成 word-enrich.json 补充数据

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

function splitEg(eg) {
  if (!eg) return null;
  const s = String(eg).trim();
  const idx = s.search(/\s[\u4e00-\u9fff（(]/);
  if (idx > 0) return { en: s.slice(0, idx).trim(), cn: s.slice(idx).trim() };
  return { en: s, cn: '' };
}

function enFromGrammarExample(ex) {
  return String(ex)
    .replace(/\s*[（(][^）)]+[）)]\s*$/, '')
    .trim();
}

function cnFromGrammarExample(ex) {
  const m = String(ex).match(/[（(]([^）)]+)[）)]\s*$/);
  return m ? m[1].trim() : '';
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

  function addCol(en, cn) {
    const ck = en.toLowerCase();
    if (!en || colSeen.has(ck)) return;
    colSeen.add(ck);
    collocations.push({ en, cn: cn || '' });
  }
  function addEx(en, cn) {
    const ek = en.toLowerCase();
    if (!en || exSeen.has(ek)) return;
    exSeen.add(ek);
    examples.push({ en, cn: cn || '' });
  }

  for (const l of lessonsForKey(key)) {
    for (const w of l.words || []) {
      if (normKey(w.word) !== key) continue;
      const p = splitEg(w.eg);
      if (p) {
        addEx(p.en, p.cn);
        addCol(p.en, p.cn);
      }
    }
    for (const g of l.grammar || []) {
      for (const ex of g.examples || []) {
        const en = enFromGrammarExample(ex);
        const cn = cnFromGrammarExample(ex);
        if (en.toLowerCase().includes(key.split(' ')[0])) {
          addCol(en, cn);
        }
      }
    }
  }
  return { collocations: collocations.slice(0, 8), examples: examples.slice(0, 6) };
}

function mergeEntry(key, manual, fromLessons) {
  const colSeen = new Set();
  const exSeen = new Set();
  const collocations = [];
  const examples = [];
  const patterns = [];

  function addCol(c) {
    const ck = c.en.toLowerCase();
    if (colSeen.has(ck)) return;
    colSeen.add(ck);
    collocations.push(c);
  }
  function addEx(e) {
    const ek = e.en.toLowerCase();
    if (exSeen.has(ek)) return;
    exSeen.add(ek);
    examples.push(e);
  }

  for (const c of fromLessons.collocations) addCol(c);
  for (const c of manual.collocations || []) addCol(c);
  for (const e of fromLessons.examples) addEx(e);
  for (const e of manual.examples || []) addEx(e);
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
