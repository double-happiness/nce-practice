'use strict';
// 统一学习活动记录（背单词/听写/词汇测/对话等），供学习计划汇总

const profile = require('./profile');
const { readJSON, writeJSONAtomic } = require('./store');

const MAX = 3000;

function load() {
  const v = readJSON(profile.file('activity.json'), { log: [] });
  if (!v || !Array.isArray(v.log)) return { log: [] };
  return v;
}

function save(v) {
  if (v.log.length > MAX) v.log = v.log.slice(-MAX);
  writeJSONAtomic(profile.file('activity.json'), v);
}

function record(correct, source) {
  const v = load();
  v.log.push({ ts: Date.now(), correct: !!correct, source: source || 'other' });
  save(v);
}

function logBatch(entries) {
  if (!entries || !entries.length) return;
  const v = load();
  const now = Date.now();
  for (const e of entries) {
    v.log.push({
      ts: e.ts != null ? e.ts : now,
      correct: !!e.correct,
      source: e.source || 'other',
    });
  }
  save(v);
}

module.exports = { load, record, logBatch };
