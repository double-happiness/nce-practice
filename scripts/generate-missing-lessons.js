'use strict';
// 从题库 / 句型 / 中文课文生成缺失的 lessons 分片，再运行 npm run sync:words 补全词表。
// 用法：node scripts/generate-missing-lessons.js [--dry-run]

const fs = require('fs');
const path = require('path');
const { readJSON, writeJSONAtomic } = require('../lib/store');

const ROOT = path.join(__dirname, '..', 'data');
const DRY = process.argv.includes('--dry-run');

const RANGES = [
  { book: 3, from: 13, to: 24, file: 'b3-013-024.json' },
  { book: 3, from: 25, to: 36, file: 'b3-025-036.json' },
  { book: 3, from: 37, to: 48, file: 'b3-037-048.json' },
  { book: 3, from: 49, to: 60, file: 'b3-049-060.json' },
  { book: 4, from: 1, to: 12, file: 'b4-001-012.json' },
  { book: 4, from: 13, to: 24, file: 'b4-013-024.json' },
];

function loadJson(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return [];
  return readJSON(p, []);
}

function indexByLesson(items, book) {
  const map = new Map();
  for (const it of items) {
    if (it.book !== book || it.lesson == null) continue;
    if (!map.has(it.lesson)) map.set(it.lesson, []);
    map.get(it.lesson).push(it);
  }
  return map;
}

function parseCnEntry(raw) {
  const lines = String(raw || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const titleCn = (lines[0] || '').replace(/^["“]|["”]$/g, '').trim();
  const body = lines.slice(1).filter((l) => !l.endsWith('？') && !l.endsWith('?'));
  return { titleCn, body };
}

function buildScene(body, grammarTags) {
  const summary = body.slice(0, 5).join('');
  const tags = (grammarTags || []).join('、');
  const tail = tags ? `本课语法侧重${tags}。` : '';
  const text = (summary + tail).slice(0, 320);
  return text.length < summary.length ? summary.slice(0, 300) + '……' + tail : text;
}

function buildGrammar(tf) {
  if (!tf) return [];
  const examples = (tf.steps || [])
    .filter((s) => s.kind === 'translate' && s.answers && s.answers[0])
    .slice(0, 2)
    .map((s) => `${s.answers[0]}（${s.cn || ''}）`);
  if (!examples.length && tf.steps && tf.steps[0]) {
    const s = tf.steps[0];
    if (s.answers && s.answers[0]) examples.push(`${s.answers[0]}（${s.cn || ''}）`);
  }
  const point = Array.isArray(tf.grammar) ? tf.grammar.join('、') : String(tf.grammar || '本课语法');
  return [{
    point,
    explain: tf.explanation || point,
    examples: examples.length ? examples : [tf.cn || ''],
  }];
}

function buildTips(tf, grammarTags) {
  if (tf && tf.explanation) {
    const s = tf.explanation.split(/[。；]/)[0];
    if (s.length <= 80) return s + '。';
  }
  const tags = (grammarTags || []).join('、');
  return tags ? `复习时重点关注${tags}，结合课文例句反复操练。` : '结合课文反复朗读，注意关键词与句型。';
}

function lessonTitle(book, lesson, qList, cnTitle) {
  if (qList && qList[0] && qList[0].lessonTitle) return qList[0].lessonTitle;
  const texts = readJSON(path.join(ROOT, 'lesson-texts.json'), { texts: {} }).texts || {};
  const en = texts[`${book}-${lesson}`]?.en || '';
  const first = en.split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  return first.replace(/^['']|['']$/g, '') || cnTitle || `Lesson ${lesson}`;
}

function buildLesson(book, lesson, ctx) {
  const { cnMap, qMap, tfMap } = ctx;
  const cnRaw = cnMap[`${book}-${lesson}`];
  const { titleCn, body } = parseCnEntry(cnRaw);
  const qList = qMap.get(lesson) || [];
  const tf = (tfMap.get(lesson) || [])[0];
  const grammarTags = tf && Array.isArray(tf.grammar) ? [...tf.grammar] : (qList[0]?.grammar ? [...qList[0].grammar] : []);

  return {
    book,
    lesson,
    title: lessonTitle(book, lesson, qList, titleCn),
    titleCn: titleCn || `第${lesson}课`,
    scene: buildScene(body, grammarTags),
    grammarTags,
    words: [],
    grammar: buildGrammar(tf),
    tips: buildTips(tf, grammarTags),
  };
}

function main() {
  const cnB3 = readJSON(path.join(ROOT, 'lesson-texts-cn', 'b3.json'), {});
  const cnB4 = readJSON(path.join(ROOT, 'lesson-texts-cn', 'b4.json'), {});
  const cnMap = { ...cnB3, ...cnB4 };

  let created = 0;
  let skipped = 0;

  for (const range of RANGES) {
    const outPath = path.join(ROOT, 'lessons', range.file);
    if (fs.existsSync(outPath)) {
      console.log(`跳过已存在: ${range.file}`);
      skipped++;
      continue;
    }

    const questions = loadJson(path.join('questions', range.file));
    const transforms = loadJson(path.join('transforms', `b${range.book}-batch${Math.ceil(range.from / 12)}.json`));
    const ctx = {
      cnMap,
      qMap: indexByLesson(questions, range.book),
      tfMap: indexByLesson(transforms, range.book),
    };

    const lessons = [];
    for (let lesson = range.from; lesson <= range.to; lesson++) {
      lessons.push(buildLesson(range.book, lesson, ctx));
    }

    console.log(`生成 ${range.file}: L${range.from}–L${range.to}（${lessons.length} 课）`);
    created += lessons.length;
    if (!DRY) writeJSONAtomic(outPath, lessons);
  }

  console.log(DRY ? '[dry-run] ' : '', `共生成 ${created} 课，跳过 ${skipped} 个分片`);
  if (!DRY && created > 0) {
    console.log('请接着运行: npm run sync:words');
  }
}

main();
