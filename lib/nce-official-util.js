'use strict';

// 解析 LRC 字幕，提取英文台词与时间轴
function parseLrc(content) {
  const lines = [];
  let title = '';
  let skipNextQuestion = false;
  for (const raw of String(content || '').split(/\r?\n/)) {
    const ti = /^\[ti:(.+)\]/i.exec(raw.trim());
    if (ti) {
      title = ti[1].trim();
      continue;
    }
    const m = /^\[(\d{2}):(\d{2})\.(\d{2})\](.*)$/.exec(raw.trim());
    if (!m) continue;
    const t = Number(m[1]) * 60 + Number(`${m[2]}.${m[3]}`);
    const en = m[4].trim();
    if (!en) continue;
    if (/^https?:\/\//i.test(en)) continue;
    if (/tysoft\.net|学习软件|新概念英语.*软件/i.test(en)) continue;
    if (/^Listen to the tape/i.test(en)) {
      skipNextQuestion = true;
      continue;
    }
    if (skipNextQuestion) {
      skipNextQuestion = false;
      continue;
    }
    if (/^Lesson \d+$/i.test(en)) continue;
    // 跳过纯非拉丁字符行（乱码元数据）
    if (!/[a-zA-Z]/.test(en)) continue;
    lines.push({ t, en });
  }
  return {
    title,
    lines,
    en: lines.map((l) => l.en).join('\n'),
  };
}

// 从文件名解析册/课
function parseFileBase(book, base) {
  if (book === 1) {
    const m = /^(\d{3})-(\d{3})/.exec(base);
    if (!m) return null;
    return { lesson: Number(m[1]) };
  }
  const m = /^(\d+)\s*[－\-—]/.exec(base) || /^(\d+)\s/.exec(base);
  if (!m) return null;
  return { lesson: Number(m[1]) };
}

const BOOK_DIRS = {
  1: '新概念英语第1册MP3(英音+LRC）',
  2: '新概念英语第2册MP3(英音+歌词LRC）',
  3: '新概念英语第3册MP3(英音+歌词LRC）',
  4: '新概念英语第4册MP3(英音+歌词LRC）',
};

// 与前端 speak 匹配用：去中文/标点，小写
function normSpeakLine(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[一-鿿]/g, ' ')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { parseLrc, parseFileBase, BOOK_DIRS, normSpeakLine };
