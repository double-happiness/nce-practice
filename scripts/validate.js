'use strict';

// 数据校验：题库与课程内容的完整性检查
// 用法： npm run validate   （命令行）
// 服务启动时也会自动调用一次，把问题数量打印出来
const data = require('../lib/data');
const path = require('path');
const { readJSON } = require('../lib/store');

function validate() {
  const errors = [];
  const warnings = [];

  const qs = data.getQuestions();
  const ids = new Set();
  qs.forEach((q, i) => {
    const where = `questions[${i}] id=${q.id || '?'}`;
    if (!q.id) errors.push(`${where}: 缺少 id`);
    else if (ids.has(q.id)) errors.push(`${where}: id 重复`);
    else ids.add(q.id);

    if (q.book == null) warnings.push(`${where}: 缺少 book`);
    if (q.lesson == null) warnings.push(`${where}: 缺少 lesson`);
    if (!q.stem) errors.push(`${where}: 缺少 stem`);
    if (!q.type) errors.push(`${where}: 缺少 type`);

    if (q.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`${where}: 单选题 options 至少 2 个`);
      } else if (!q.options.map(String).includes(String(q.answer))) {
        errors.push(`${where}: 正确答案不在选项内 (answer=${q.answer})`);
      }
    }
    if (q.answer == null || q.answer === '') errors.push(`${where}: 缺少 answer`);
    if (!q.explanation) warnings.push(`${where}: 缺少 explanation（建议补上解析）`);
  });

  // 题干查重（忽略大小写与多余空白），提示可能的重复录入
  const stemOwner = new Map();
  qs.forEach((q) => {
    if (!q.stem) return;
    const key = String(q.stem).toLowerCase().replace(/\s+/g, ' ').trim();
    if (stemOwner.has(key)) warnings.push(`questions id=${q.id}: stem 与 ${stemOwner.get(key)} 重复`);
    else stemOwner.set(key, q.id);
  });

  data.getLessons().forEach((l, i) => {
    const where = `lessons[${i}] L${l.lesson}`;
    if (l.lesson == null) errors.push(`${where}: 缺少 lesson`);
    if (!l.title) warnings.push(`${where}: 缺少 title`);
    if (!Array.isArray(l.words) || !l.words.length) warnings.push(`${where}: 缺少 words`);
    (l.words || []).forEach((w, j) => {
      if (!w.word) errors.push(`${where}.words[${j}]: 缺少 word`);
    });
  });

  // 句型转换练习：id 唯一、步骤完整、每步答案非空
  const TF_KINDS = new Set(require('../lib/transform-util').KINDS);
  const tfIds = new Set();
  data.getTransforms().forEach((t, i) => {
    const where = `transforms[${i}] id=${t.id || '?'}`;
    if (!t.id) errors.push(`${where}: 缺少 id`);
    else if (tfIds.has(t.id)) errors.push(`${where}: id 重复`);
    else tfIds.add(t.id);

    if (t.book == null) warnings.push(`${where}: 缺少 book`);
    if (t.lesson == null) warnings.push(`${where}: 缺少 lesson`);
    if (!t.cn) errors.push(`${where}: 缺少 cn（中文原句）`);
    if (!t.explanation) warnings.push(`${where}: 缺少 explanation（建议补上转换规则讲解）`);
    if (!Array.isArray(t.steps) || !t.steps.length) {
      errors.push(`${where}: steps 不能为空`);
      return;
    }
    if (t.steps[0].kind !== 'translate') warnings.push(`${where}: 第一步建议为 translate（中译英）`);
    t.steps.forEach((s, j) => {
      const sw = `${where}.steps[${j}]`;
      if (!TF_KINDS.has(s.kind)) errors.push(`${sw}: kind 必须是 ${[...TF_KINDS].join('/')} 之一 (kind=${s.kind})`);
      if (!s.prompt) errors.push(`${sw}: 缺少 prompt`);
      if (!Array.isArray(s.answers) || !s.answers.length || s.answers.some((a) => !String(a || '').trim())) {
        errors.push(`${sw}: answers 必须是非空字符串数组`);
      }
    });
  });

  // 情景对话：id 唯一、轮次完整、学习者台词英文非空
  const dlgIds = new Set();
  const DLG_CATS = new Set(Object.keys(require('../lib/dialogue-meta').CATEGORIES));
  data.getDialogues().forEach((d, i) => {
    const where = `dialogues[${i}] id=${d.id || '?'}`;
    if (!d.id) errors.push(`${where}: 缺少 id`);
    else if (dlgIds.has(d.id)) errors.push(`${where}: id 重复`);
    else dlgIds.add(d.id);

    if (!d.category) errors.push(`${where}: 缺少 category`);
    else if (!DLG_CATS.has(d.category)) warnings.push(`${where}: category=${d.category} 不在预定义分类中`);
    if (!d.title) warnings.push(`${where}: 缺少 title`);
    if (!d.titleCn) warnings.push(`${where}: 缺少 titleCn`);
    if (!d.scene) warnings.push(`${where}: 缺少 scene（情景描述）`);
    if (!Array.isArray(d.turns) || !d.turns.length) {
      errors.push(`${where}: turns 不能为空`);
      return;
    }
    let hasYou = false;
    d.turns.forEach((t, j) => {
      const tw = `${where}.turns[${j}]`;
      if (!t.role) errors.push(`${tw}: 缺少 role`);
      if (!t.cn) errors.push(`${tw}: 缺少 cn`);
      if (t.role === 'You') {
        hasYou = true;
        const enList = Array.isArray(t.en) ? t.en : [t.en];
        if (!enList.some((s) => s && String(s).trim())) errors.push(`${tw}: 学习者台词缺少 en`);
      } else if (!t.en || !String(t.en).trim()) {
        errors.push(`${tw}: 缺少 en`);
      }
      if (t.aliases != null) {
        if (!Array.isArray(t.aliases)) {
          errors.push(`${tw}: aliases 须为字符串数组`);
        } else {
          t.aliases.forEach((a, k) => {
            if (!a || !String(a).trim()) errors.push(`${tw}.aliases[${k}]: 空别名`);
          });
        }
      }
    });
    if (!hasYou) warnings.push(`${where}: 没有 role=You 的练习轮次`);

    if (d.chain != null) {
      const c = d.chain;
      if (!c.id || typeof c.id !== 'string') errors.push(`${where}: chain.id 须为非空字符串`);
      if (!c.titleCn || !c.title) warnings.push(`${where}: chain 建议提供 title 与 titleCn`);
      if (!Number.isInteger(c.part) || !Number.isInteger(c.parts)) {
        errors.push(`${where}: chain.part 与 chain.parts 须为整数`);
      } else if (c.part < 1 || c.part > c.parts) {
        errors.push(`${where}: chain.part 须在 1..parts 范围内`);
      }
    }
  });

  // 对话链：同一 chain.id 的 part 须连续且 parts 一致
  const chainGroups = new Map();
  data.getDialogues().forEach((d) => {
    if (!d.chain || !d.chain.id) return;
    if (!chainGroups.has(d.chain.id)) chainGroups.set(d.chain.id, []);
    chainGroups.get(d.chain.id).push(d);
  });
  chainGroups.forEach((items, chainId) => {
    const partsSet = new Set(items.map((x) => x.chain.parts));
    if (partsSet.size > 1) {
      errors.push(`chain.id=${chainId}: 各环 chain.parts 不一致`);
    }
    const parts = items[0].chain.parts;
    const partNums = items.map((x) => x.chain.part).sort((a, b) => a - b);
    if (partNums.length !== parts) {
      errors.push(`chain.id=${chainId}: 应有 ${parts} 环，实际 ${partNums.length} 篇`);
    }
    for (let i = 1; i <= parts; i++) {
      if (!partNums.includes(i)) errors.push(`chain.id=${chainId}: 缺少第 ${i} 环`);
    }
  });

  // 题目 lessonTitle 与教材 title 不一致（仅提示，不影响判分）
  const lessonTitleMap = new Map(
    data.getLessons().map((l) => [`${l.book}-${l.lesson}`, l.title || ''])
  );
  let titleMismatch = 0;
  qs.forEach((q) => {
    if (!q.lessonTitle || titleMismatch >= 15) return;
    const expected = lessonTitleMap.get(`${q.book}-${q.lesson}`);
    if (expected && q.lessonTitle !== expected) {
      warnings.push(`questions id=${q.id}: lessonTitle「${q.lessonTitle}」与教材「${expected}」不一致`);
      titleMismatch++;
    }
  });
  if (titleMismatch >= 15) {
    warnings.push('questions: 另有 lessonTitle 与教材不一致的题目（已截断显示）');
  }

  // 第一册课文课（奇数课）合并偶数课练习后，建议每课至少 5 题
  const qByBookLesson = new Map();
  qs.forEach((q) => {
    const k = `${q.book}-${q.lesson}`;
    qByBookLesson.set(k, (qByBookLesson.get(k) || 0) + 1);
  });
  data.getLessons()
    .filter((l) => l.book === 1 && l.lesson % 2 === 1)
    .forEach((l) => {
      const n = (qByBookLesson.get(`1-${l.lesson}`) || 0) + (qByBookLesson.get(`1-${l.lesson + 1}`) || 0);
      if (n < 5) warnings.push(`book1 lesson ${l.lesson}: 课文课+配套练习仅 ${n} 题，建议补至 5 题`);
    });

  // 第三、四册：每课文课至少 5 题
  [3, 4].forEach((book) => {
    data.getLessons()
      .filter((l) => l.book === book)
      .forEach((l) => {
        const n = qByBookLesson.get(`${book}-${l.lesson}`) || 0;
        if (n < 5) warnings.push(`book${book} lesson ${l.lesson}: 题量为 ${n}，建议至少 5 题`);
      });
  });

  // 全局词库：结构完整、每段至少 12 词（4 选 1 出题下限）
  const { buildGlobalDict, getVocabInfo } = require('../lib/globalvocab');
  const gvInfo = getVocabInfo();
  if (!gvInfo.dictTotal) {
    errors.push('global-vocab: 词库为空或文件缺失');
  } else if (gvInfo.dictTotal < 500) {
    warnings.push(`global-vocab: 词库仅 ${gvInfo.dictTotal} 词，建议至少 500 词`);
  }
  const gvKeys = new Set();
  buildGlobalDict().forEach((w, i) => {
    const where = `global-vocab[${i}] word=${w.word || '?'}`;
    if (!w.word) errors.push(`${where}: 缺少 word`);
    if (!w.cn) errors.push(`${where}: 缺少 cn`);
    if (gvKeys.has(w.key)) errors.push(`${where}: word 重复 (${w.key})`);
    else gvKeys.add(w.key);
  });
  (gvInfo.bands || []).forEach((b) => {
    if (b.total < 12) warnings.push(`global-vocab band ${b.band}: 仅 ${b.total} 词，抽样可能不均`);
  });

  // 词典 enrich：结构完整、键名归一化
  const { normKey } = require('../lib/dict');
  const enrich = readJSON(path.join(__dirname, '..', 'data', 'word-enrich.json'), null);
  if (!enrich || typeof enrich !== 'object') {
    warnings.push('word-enrich.json: 文件缺失或为空，词典详情将无手工补充');
  } else {
    const enrichKeys = new Set();
    Object.entries(enrich).forEach(([k, v]) => {
      const where = `word-enrich[${k}]`;
      if (normKey(k) !== k) warnings.push(`${where}: 键建议用小写归一化形式`);
      if (enrichKeys.has(k)) errors.push(`${where}: 键重复`);
      else enrichKeys.add(k);
      if (!v || typeof v !== 'object') {
        errors.push(`${where}: 条目必须是对象`);
        return;
      }
      for (const field of ['collocations', 'patterns', 'examples']) {
        if (v[field] != null && !Array.isArray(v[field])) {
          errors.push(`${where}: ${field} 必须是数组`);
        }
      }
      (v.collocations || []).forEach((c, i) => {
        if (!c || !c.en) errors.push(`${where}.collocations[${i}]: 缺少 en`);
      });
      (v.patterns || []).forEach((p, i) => {
        if (!p || !p.title) errors.push(`${where}.patterns[${i}]: 缺少 title`);
      });
    });
    if (enrichKeys.size < 900) {
      warnings.push(`word-enrich: 仅 ${enrichKeys.size} 条，建议覆盖全部教材词条（约 908）`);
    }
  }

  return { errors, warnings };
}

if (require.main === module) {
  data.reload();
  const { errors, warnings } = validate();
  warnings.forEach((w) => console.warn('⚠️  ' + w));
  errors.forEach((e) => console.error('❌ ' + e));
  console.log(`\n校验完成：${errors.length} 个错误，${warnings.length} 个警告`);
  process.exit(errors.length ? 1 : 0);
}

module.exports = { validate };
