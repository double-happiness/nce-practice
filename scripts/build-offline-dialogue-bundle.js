'use strict';
// 生成 public/data/dialogue-bundle.json —— 情景对话离线包（目录 + 练习正文 + 判分键）

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { CATEGORIES, buildGroupTree } = require('../lib/dialogue-meta');
const { collectTurnAnswers } = require('../lib/dialogue-grade');
const { publicDialogue, publicSummary, buildMeta, isLearnerTurn } = require('../lib/dialogue-public');

const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const OUT = path.join(OUT_DIR, 'dialogue-bundle.json');
const pkg = require('../package.json');

function buildGradeKeys(d) {
  const keys = {};
  d.turns.forEach((t, i) => {
    if (isLearnerTurn(t)) keys[String(i)] = collectTurnAnswers(t);
  });
  return keys;
}

function main() {
  const dialogues = data.getDialogues();
  const meta = buildMeta(dialogues, CATEGORIES, buildGroupTree);
  const summaries = dialogues.map((d) => publicSummary(d, dialogues));
  const details = {};
  const gradeKeys = {};

  for (const d of dialogues) {
    details[d.id] = publicDialogue(d, dialogues);
    const gk = buildGradeKeys(d);
    if (Object.keys(gk).length) gradeKeys[d.id] = gk;
  }

  const bundle = {
    version: pkg.version || '1.0.0',
    generatedAt: new Date().toISOString(),
    count: dialogues.length,
    meta,
    summaries,
    details,
    gradeKeys,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bundle));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`Wrote ${dialogues.length} dialogues → ${OUT} (${kb} KB)`);
}

main();
