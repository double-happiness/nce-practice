'use strict';

const { readJSON, writeJSONAtomic } = require('./store');
const profile = require('./profile');

const DEFAULT = { attempts: [], wrong: {}, perQuestion: {} };

// 进度按当前档案隔离存储（data/profiles/<id>/progress.json）
function load() {
  return readJSON(profile.file('progress.json'), JSON.parse(JSON.stringify(DEFAULT)));
}
function save(p) {
  writeJSONAtomic(profile.file('progress.json'), p);
}

module.exports = { load, save, DEFAULT };
