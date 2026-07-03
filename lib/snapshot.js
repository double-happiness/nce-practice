'use strict';
// 学习数据每日滚动快照：把 data/profiles/ 整体复制到 data/backups/YYYY-MM-DD/，
// 保留最近 7 份。误重置/坏导入时可手动把某天的目录拷回 data/profiles/ 恢复。
// 服务启动时执行一次，之后由 server.js 定时触发（当天已有快照则直接返回，代价极低）。

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SRC = path.join(DATA_DIR, 'profiles');
const DEST = path.join(DATA_DIR, 'backups');
const KEEP = 7;

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function snapshotDaily() {
  try {
    if (!fs.existsSync(SRC)) return null;
    const dir = path.join(DEST, today());
    if (fs.existsSync(dir)) return null; // 今天已有快照
    fs.mkdirSync(DEST, { recursive: true });
    // 先复制到临时目录再改名，避免复制中途崩溃留下半份快照
    const tmp = `${dir}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.cpSync(SRC, tmp, {
      recursive: true,
      filter: (src) => !path.basename(src).startsWith('.trash') && !/\.tmp\./.test(src),
    });
    fs.renameSync(tmp, dir);
    // 只保留最近 KEEP 份（目录名即日期，字典序 = 时间序）
    const all = fs
      .readdirSync(DEST)
      .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
      fs.rmSync(path.join(DEST, old), { recursive: true, force: true });
    }
    return dir;
  } catch (e) {
    console.error('每日数据快照失败:', e.message);
    return null;
  }
}

module.exports = { snapshotDaily, DEST, KEEP };
