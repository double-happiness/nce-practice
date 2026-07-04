'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON } = require('./store');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PATHS = {
  questions: path.join(DATA_DIR, 'questions.json'),
  lessons: path.join(DATA_DIR, 'lessons.json'),
  meta: path.join(DATA_DIR, 'meta.json'),
};

let QUESTIONS = [];
let LESSONS = [];
let META = {};
let QMAP = new Map();
let TRANSFORMS = [];
let TRMAP = new Map();
let DIALOGUES = [];
let DLGMAP = new Map();
let OFFICIAL = [];
let OFFMAP = new Map();

// 加载一个目录下所有 .json 分片并拼成数组（内容持续扩充时，一功能/一批一文件，零冲突）
function loadDir(dir) {
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const arr = readJSON(path.join(dir, f), []);
      if (Array.isArray(arr)) out.push(...arr);
    }
  } catch (e) {
    /* 目录不存在则忽略 */
  }
  return out;
}

function reload() {
  QUESTIONS = [...readJSON(PATHS.questions, []), ...loadDir(path.join(DATA_DIR, 'questions'))];
  LESSONS = [...readJSON(PATHS.lessons, []), ...loadDir(path.join(DATA_DIR, 'lessons'))];
  LESSONS.sort((a, b) => (a.book - b.book) || (a.lesson - b.lesson));
  // 原创精读短文（data/articles/*.json 分片，元素形如 {book,lesson,en,cn}）合并到对应课程的 article 字段
  const articleMap = new Map();
  for (const a of loadDir(path.join(DATA_DIR, 'articles'))) {
    if (a && a.book != null && a.lesson != null) articleMap.set(`${a.book}-${a.lesson}`, { en: a.en || '', cn: a.cn || '' });
  }
  for (const l of LESSONS) {
    const a = articleMap.get(`${l.book}-${l.lesson}`);
    if (a && a.en) l.article = a;
  }
  META = readJSON(PATHS.meta, { books: [], units: {} });
  QMAP = new Map(QUESTIONS.map((q) => [q.id, q]));
  // 句型转换练习（data/transforms/*.json 分片，每条含中文原句 + 逐步转换链）
  TRANSFORMS = loadDir(path.join(DATA_DIR, 'transforms'));
  TRANSFORMS.sort((a, b) => (a.book - b.book) || (a.lesson - b.lesson));
  TRMAP = new Map(TRANSFORMS.map((t) => [t.id, t]));
  // 情景对话练习（data/dialogues/*.json 分片，按场景分类）
  DIALOGUES = loadDir(path.join(DATA_DIR, 'dialogues'));
  DLGMAP = new Map(DIALOGUES.map((d) => [d.id, d]));
  OFFICIAL = readJSON(path.join(DATA_DIR, 'official', 'passages.json'), []);
  OFFMAP = new Map(OFFICIAL.map((o) => [`${o.book}-${o.lesson}`, o]));
}
reload();

// 下发题目前去掉答案/解析并打乱选项顺序。
// 题库源文件中答案绝大多数排在第一个选项，不打乱会被「永远选A」破解。
function publicQuestion(q) {
  const { answer, explanation, ...safe } = q;
  if (Array.isArray(safe.options) && safe.options.length > 1) {
    const a = safe.options.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    safe.options = a;
  }
  return safe;
}

module.exports = {
  DATA_DIR,
  PATHS,
  reload,
  getQuestions: () => QUESTIONS,
  getLessons: () => LESSONS,
  getMeta: () => META,
  getQMAP: () => QMAP,
  getTransforms: () => TRANSFORMS,
  getTRMAP: () => TRMAP,
  getDialogues: () => DIALOGUES,
  getDLGMAP: () => DLGMAP,
  getOfficialPassage: (book, lesson) => OFFMAP.get(`${book}-${lesson}`) || null,
  getOfficialPassages: () => OFFICIAL,
  publicQuestion,
};
