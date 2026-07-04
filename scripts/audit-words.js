'use strict';
// 词汇数据质量审计
// 用法：npm run audit:words

const data = require('../lib/data');
const { buildDict, normKey } = require('../lib/dict');
const path = require('path');
const { readJSON } = require('../lib/store');

const THRESHOLDS = {
  emptyEgPct: 40,
  emptyPhonPct: 5,
  enrichCoveragePct: 35,
};

function audit() {
  data.reload();
  const lessons = data.getLessons();
  const dict = buildDict();
  const enrich = readJSON(path.join(__dirname, '..', 'data', 'word-enrich.json'), {});
  const enrichKeys = new Set(Object.keys(enrich));
  const enrichHit = dict.filter((w) => enrichKeys.has(w.key)).length;

  let total = 0;
  let emptyEg = 0;
  let emptyPhon = 0;
  let emptyPos = 0;
  let intraDupes = 0;
  const byBook = {};

  for (let b = 1; b <= 4; b++) {
    byBook[b] = { total: 0, emptyEg: 0, emptyPhon: 0, lessons: 0, emptyWords: 0 };
  }

  for (const l of lessons) {
    const b = byBook[l.book];
    if (!b) continue;
    b.lessons++;
    const words = l.words || [];
    if (!words.length) b.emptyWords++;
    const seen = new Set();
    for (const w of words) {
      total++;
      b.total++;
      if (!w.eg) { emptyEg++; b.emptyEg++; }
      if (!w.phon) { emptyPhon++; b.emptyPhon++; }
      if (!w.pos) emptyPos++;
      const k = normKey(w.word);
      if (seen.has(k)) intraDupes++;
      seen.add(k);
    }
  }

  const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : '0.0');

  console.log('=== 词汇数据审计 ===\n');
  console.log(`课程: ${lessons.length}  词条(含重复): ${total}  去重: ${dict.length}`);
  console.log(`空 eg: ${emptyEg} (${pct(emptyEg, total)}%)`);
  console.log(`空 phon: ${emptyPhon} (${pct(emptyPhon, total)}%)`);
  console.log(`空 pos: ${emptyPos}`);
  console.log(`课内重复: ${intraDupes}`);
  console.log(`enrich 覆盖去重词: ${enrichHit}/${dict.length} (${pct(enrichHit, dict.length)}%)\n`);

  const issues = [];
  for (let book = 1; book <= 4; book++) {
    const x = byBook[book];
    const egPct = Number(pct(x.emptyEg, x.total));
    const phonPct = Number(pct(x.emptyPhon, x.total));
    console.log(
      `B${book}: ${x.lessons} 课, 词条 ${x.total}, 空eg ${egPct}%, 空phon ${phonPct}%` +
      (x.emptyWords ? `, 空words课 ${x.emptyWords}` : '')
    );
    if (egPct > THRESHOLDS.emptyEgPct) issues.push(`B${book} 空 eg 比例 ${egPct}% > ${THRESHOLDS.emptyEgPct}%`);
    if (phonPct > THRESHOLDS.emptyPhonPct) issues.push(`B${book} 空 phon 比例 ${phonPct}% > ${THRESHOLDS.emptyPhonPct}%`);
  }

  const enrichPct = Number(pct(enrichHit, dict.length));
  if (enrichPct < THRESHOLDS.enrichCoveragePct) {
    issues.push(`enrich 覆盖率 ${enrichPct}% < ${THRESHOLDS.enrichCoveragePct}%`);
  }

  console.log('');
  if (issues.length) {
    console.log('⚠️  待改进:');
    issues.forEach((i) => console.log('  -', i));
    process.exit(1);
  }
  console.log('✅ 各项指标在阈值内');
}

audit();
