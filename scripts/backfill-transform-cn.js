'use strict';

// 为句型转换练习各步骤回填 cn（中文译文），写入 data/transforms/*.json
// 用法：node scripts/backfill-transform-cn.js [--dry-run]

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { answerCn } = require('../lib/transform-cn');

const dryRun = process.argv.includes('--dry-run');
const dir = path.join(data.DATA_DIR, 'transforms');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

let total = 0;
let filled = 0;
let empty = 0;
const missing = [];

for (const file of files) {
  const fp = path.join(dir, file);
  const list = JSON.parse(fs.readFileSync(fp, 'utf8'));
  let changed = false;
  for (const t of list) {
    for (const s of t.steps) {
      total++;
      if (s.cn) {
        filled++;
        continue;
      }
      const cn = answerCn(t, s);
      if (cn) {
        s.cn = cn;
        filled++;
        changed = true;
      } else {
        empty++;
        missing.push({ id: t.id, kind: s.kind, orig: t.cn, prompt: s.prompt });
      }
    }
  }
  if (changed && !dryRun) {
    fs.writeFileSync(fp, JSON.stringify(list, null, 2) + '\n');
  }
}

console.log(`steps: ${total}, with cn: ${filled}, still empty: ${empty}${dryRun ? ' (dry-run)' : ''}`);
if (missing.length) {
  console.log('still missing:');
  missing.slice(0, 20).forEach((m) => console.log(`  ${m.id} ${m.kind} | ${m.prompt}`));
  if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`);
}
