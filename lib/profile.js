'use strict';

// 多用户档案：学习数据（progress/srs/plan/exams/vocab/words）按档案目录隔离，
// 题库与教材内容仍为全局共享。档案元信息存 data/profiles/profiles.json。
const fs = require('fs');
const path = require('path');
const { readJSON, writeJSONAtomic } = require('./store');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const META_FILE = path.join(PROFILES_DIR, 'profiles.json');

// 按档案隔离的运行时数据文件
const USER_FILES = ['progress.json', 'srs.json', 'plan.json', 'exams.json', 'vocab.json', 'words.json'];

const DEFAULT_META = {
  current: 'default',
  profiles: [{ id: 'default', name: '默认档案', emoji: '👤', createdAt: 0 }],
};

function loadMeta() {
  const m = readJSON(META_FILE, null);
  if (!m || !Array.isArray(m.profiles) || !m.profiles.length) return JSON.parse(JSON.stringify(DEFAULT_META));
  if (!m.profiles.some((p) => p.id === m.current)) m.current = m.profiles[0].id;
  return m;
}
function saveMeta(m) {
  writeJSONAtomic(META_FILE, m);
}

// 首次启动：建目录，并把 data/ 根下的旧数据迁移为 default 档案（向后兼容）
function ensureInit() {
  if (fs.existsSync(META_FILE)) return;
  fs.mkdirSync(path.join(PROFILES_DIR, 'default'), { recursive: true });
  for (const f of USER_FILES) {
    const legacy = path.join(DATA_DIR, f);
    const dest = path.join(PROFILES_DIR, 'default', f);
    if (fs.existsSync(legacy) && !fs.existsSync(dest)) fs.renameSync(legacy, dest);
  }
  saveMeta(DEFAULT_META);
  console.log('档案系统初始化：已将现有学习数据迁移到 data/profiles/default/');
}

function list() {
  return loadMeta();
}
function currentId() {
  return loadMeta().current;
}
// 当前档案下某数据文件的绝对路径（目录随用随建，防止手工删目录后写入失败）
function file(name) {
  const dir = path.join(PROFILES_DIR, currentId());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

function switchTo(id) {
  const m = loadMeta();
  if (!m.profiles.some((p) => p.id === id)) return { error: '档案不存在' };
  m.current = id;
  saveMeta(m);
  return { ok: true, current: id };
}

function create(name, emoji) {
  const nm = String(name || '').trim().slice(0, 20);
  if (!nm) return { error: '档案名不能为空' };
  const m = loadMeta();
  if (m.profiles.some((p) => p.name === nm)) return { error: '已有同名档案' };
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  m.profiles.push({ id, name: nm, emoji: String(emoji || '🙂').slice(0, 4), createdAt: Date.now() });
  m.current = id; // 新建后直接切换过去
  saveMeta(m);
  fs.mkdirSync(path.join(PROFILES_DIR, id), { recursive: true });
  return { ok: true, id };
}

function rename(id, name) {
  const nm = String(name || '').trim().slice(0, 20);
  if (!nm) return { error: '档案名不能为空' };
  const m = loadMeta();
  const p = m.profiles.find((x) => x.id === id);
  if (!p) return { error: '档案不存在' };
  p.name = nm;
  saveMeta(m);
  return { ok: true };
}

function remove(id) {
  const m = loadMeta();
  if (m.profiles.length <= 1) return { error: '至少保留一个档案' };
  if (m.current === id) return { error: '不能删除当前使用中的档案，请先切换' };
  const idx = m.profiles.findIndex((p) => p.id === id);
  if (idx < 0) return { error: '档案不存在' };
  m.profiles.splice(idx, 1);
  saveMeta(m);
  // 数据目录移入回收位而不是直接删除，防误删（可手工清理 data/profiles/.trash/）
  const dir = path.join(PROFILES_DIR, id);
  if (fs.existsSync(dir)) {
    const trash = path.join(PROFILES_DIR, '.trash');
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(dir, path.join(trash, `${id}-${Date.now()}`));
  }
  return { ok: true };
}

ensureInit();

module.exports = { USER_FILES, list, currentId, file, switchTo, create, rename, remove };
