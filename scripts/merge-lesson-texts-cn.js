'use strict';

// 将 data/lesson-texts-cn/*.json 中的中文译文合并进 data/lesson-texts.json
// 分片格式：{ "1-1": "中文…\n每行对应英文一行", "2-3": "…" }
// 用法：node scripts/merge-lesson-texts-cn.js [--dry-run]

const fs = require('fs');
const path = require('path');
const data = require('../lib/data');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const dryRun = process.argv.includes('--dry-run');
const OUT = path.join(data.DATA_DIR, 'lesson-texts.json');
const CN_DIR = path.join(data.DATA_DIR, 'lesson-texts-cn');

function main() {
  const store = readJSON(OUT, { texts: {} });
  if (!store.texts) store.texts = {};

  let merged = 0;
  let missing = 0;
  if (!fs.existsSync(CN_DIR)) {
    console.log('目录不存在:', CN_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(CN_DIR).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    const shard = readJSON(path.join(CN_DIR, file), {});
    for (const [key, cn] of Object.entries(shard)) {
      const text = String(cn || '').trim();
      if (!text) continue;
      if (!store.texts[key]) {
        console.warn('  未知课时键:', key, 'in', file);
        missing++;
        continue;
      }
      store.texts[key].cn = text;
      store.texts[key].ts = Date.now();
      merged++;
    }
  }
  if (!dryRun && merged) writeJSONAtomic(OUT, store);
  const stillEmpty = Object.values(store.texts).filter((t) => !t.cn || !t.cn.trim()).length;
  console.log(`合并 ${merged} 条（来自 ${files.length} 个分片）${dryRun ? ' (dry-run)' : ''}`);
  if (missing) console.log('跳过未知键:', missing);
  console.log('仍缺中文:', stillEmpty);
}

main();
