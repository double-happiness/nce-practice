'use strict';

const fs = require('fs');

// 读 JSON：区分「文件不存在」（首次运行的正常路径，静默用默认值）与「文件存在但 JSON 损坏」。
// 后者若也静默返回默认值，紧接着的一次 save() 会把损坏文件覆盖成空数据、真实学习记录永久丢失；
// 因此先把损坏文件另存为 .corrupt.<pid>.<n> 备查，再返回默认值，保证原始内容不被静默清空。
let corruptCounter = 0;
function readJSON(file, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`[store] 读取失败 ${file}: ${e.message}`);
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    const bak = `${file}.corrupt.${process.pid}.${corruptCounter++}`;
    try { fs.copyFileSync(file, bak); } catch (_) { /* 备份失败也不阻断读取 */ }
    console.error(`[store] JSON 解析失败 ${file}: ${e.message}；已备份损坏文件到 ${bak}，本次返回默认值`);
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
