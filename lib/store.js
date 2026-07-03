'use strict';

const fs = require('fs');

// 读 JSON，失败返回 fallback
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

// 原子写：先写临时文件再 rename，避免写入中途崩溃导致文件损坏
let counter = 0;
function writeJSONAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}.${counter++}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { readJSON, writeJSONAtomic };
