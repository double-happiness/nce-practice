'use strict';

// 数据校验：题库与课程内容的完整性检查
// 用法： npm run validate   （命令行）
// 服务启动时也会自动调用一次，把问题数量打印出来
const data = require('../lib/data');
const path = require('path');
const { readJSON } = require('../lib/store');
const { normKey, buildDict } = require('../lib/dict');

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

  let wordPhonEmpty = 0;
  let wordEgEmpty = 0;
  let wordCnEmpty = 0;

  data.getLessons().forEach((l, i) => {
    const where = `lessons[${i}] L${l.lesson}`;
    if (l.lesson == null) errors.push(`${where}: 缺少 lesson`);
    if (!l.title) warnings.push(`${where}: 缺少 title`);
    if (!Array.isArray(l.words) || !l.words.length) warnings.push(`${where}: 缺少 words`);
    (l.words || []).forEach((w, j) => {
      if (!w.word) errors.push(`${where}.words[${j}]: 缺少 word`);
      if (!w.phon) wordPhonEmpty++;
      if (!w.eg) wordEgEmpty++;
      if (!w.cn) wordCnEmpty++;
    });
  });

  // 课内 word 重复（同一课同一词出现多次）
  data.getLessons().forEach((l, i) => {
    const where = `lessons[${i}] L${l.lesson}`;
    const seen = new Map();
    (l.words || []).forEach((w) => {
      const wk = normKey(w.word);
      if (!wk) return;
      seen.set(wk, (seen.get(wk) || 0) + 1);
    });
    seen.forEach((n, wk) => {
      if (n > 1) warnings.push(`${where}: 课内词重复 (${wk} ×${n})`);
    });
  });

  const allWordCount = data.getLessons().reduce((a, l) => a + (l.words || []).length, 0);
  if (allWordCount && wordEgEmpty / allWordCount > 0.4) {
    warnings.push(`lessons: 空 eg 词条 ${wordEgEmpty}/${allWordCount}（${Math.round(100 * wordEgEmpty / allWordCount)}%），建议运行 npm run backfill:words`);
  }
  if (allWordCount && wordPhonEmpty / allWordCount > 0.05) {
    warnings.push(`lessons: 空 phon 词条 ${wordPhonEmpty}/${allWordCount}（${Math.round(100 * wordPhonEmpty / allWordCount)}%）`);
  }
  if (wordCnEmpty > 0) warnings.push(`lessons: 空 cn 词条 ${wordCnEmpty} 条`);

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
    const enrichMin = Math.min(1500, Math.floor(buildDict().length * 0.35));
    if (enrichKeys.size < enrichMin) {
      warnings.push(`word-enrich: 仅 ${enrichKeys.size} 条，建议覆盖至少 ${enrichMin} 个教材词条`);
    }
  }

  // 雅思备考内容（data/ielts/，可用 IELTS_DATA_DIR 覆盖）
  const ieltsResult = validateIelts(require('../lib/ielts').getContent());
  errors.push(...ieltsResult.errors);
  warnings.push(...ieltsResult.warnings);

  // 雅思阅读（data/ielts/reading/，由 lib/ielts-reading 加载与校验）
  const reading = require('../lib/ielts-reading');
  const readingContent = reading.getContent();
  errors.push(...readingContent.issues.map((m) => `ielts/${m}`));
  const readingResult = reading.validateReadingContent(readingContent.passages);
  errors.push(...readingResult.errors);
  warnings.push(...readingResult.warnings);

  return { errors, warnings };
}

// ---------------- 雅思内容校验（设计文档 §3、§7）----------------
const IELTS_TOPICS = new Set(['academic', 'education', 'environment', 'technology', 'health', 'work', 'crime', 'media', 'urban', 'globalization', 'government', 'culture', 'science']);
const IELTS_CEFRS = new Set(['B1', 'B2', 'C1', 'C2']);
const IELTS_QTYPES = new Set(['opinion', 'discussion', 'problem-solution', 'adv-disadv', 'two-part']);
const IELTS_CHART_TYPES = new Set(['bar', 'line', 'pie', 'table', 'process', 'map']);
const IELTS_MAP_KINDS = new Set(['building', 'road', 'park', 'water', 'car-park', 'label']);
const IELTS_TONES = new Set(['formal', 'semi-formal', 'informal']);
const IELTS_CATEGORIES = new Set(['person', 'place', 'object', 'event', 'experience', 'media']);
const IELTS_PLAN_TABS = new Set(['home', 'learn', 'practice', 'dictionary', 'dictation', 'exam', 'transform', 'dialogue', 'review', 'vocab', 'words', 'globalvocab', 'comprehension', 'stats', 'plan', 'level', 'ielts', 'ielts:plan', 'ielts:vocab', 'ielts:writing', 'ielts:speaking', 'ielts:history', 'ielts:reading']);
const IELTS_PLAN_SOURCES = new Set(['quiz', 'transform', 'words', 'vocab', 'dictation', 'dialogue', 'lesson', 'comprehension', 'ielts-writing', 'ielts-speaking', 'ielts-vocab', 'ielts-reading']);
const IELTS_RUBRIC_KEYS = {
  task1A: ['TA', 'CC', 'LR', 'GRA'],
  task1G: ['TA', 'CC', 'LR', 'GRA'],
  task2: ['TR', 'CC', 'LR', 'GRA'],
};
const IELTS_SPEAKING_RUBRIC_KEYS = ['FC', 'LR', 'GRA', 'P'];
const IELTS_MIN_MODEL_WORDS = { 1: 150, 2: 250 };

const isNonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';
const isBandNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 9 && Number.isInteger(v * 2);
const isStrArray = (v) => Array.isArray(v) && v.every(isNonEmptyStr);

/**
 * 校验雅思内容。content 为 lib/ielts.getContent() 的结构；内容目录为空时不报错。
 * 返回 { errors, warnings }，消息统一以 ielts/ 开头便于定位。
 */
function validateIelts(content) {
  const errors = [];
  const warnings = [];
  const { countWords, originOf } = require('../lib/ielts');
  const at = (item) => `ielts/${originOf(item)}`;

  (content.issues || []).forEach((m) => errors.push(`ielts/${m}`));

  // ---- 词汇：必填、枚举、normKey 去重 ----
  const vocabSeen = new Map();
  content.vocab.forEach((v, i) => {
    const where = `${at(v)} vocab[${i}] word=${v.word || '?'}`;
    if (!isNonEmptyStr(v.word)) errors.push(`${where}: 缺少 word`);
    if (!isNonEmptyStr(v.cn)) errors.push(`${where}: 缺少 cn`);
    if (!isNonEmptyStr(v.pos)) warnings.push(`${where}: 缺少 pos`);
    if (!isNonEmptyStr(v.phon)) warnings.push(`${where}: 缺少 phon`);
    if (!IELTS_TOPICS.has(v.topic)) errors.push(`${where}: topic 非法 (${v.topic})`);
    if (!IELTS_CEFRS.has(v.cefr)) errors.push(`${where}: cefr 必须是 B1 / B2 / C1 / C2 (${v.cefr})`);
    if (v.academic != null && typeof v.academic !== 'boolean') errors.push(`${where}: academic 必须是 true / false`);
    if (!isNonEmptyStr(v.eg)) warnings.push(`${where}: 缺少 eg 例句`);
    else if (!isNonEmptyStr(v.egCn)) warnings.push(`${where}: 缺少 egCn 例句译文`);
    if (v.collocations != null && !isStrArray(v.collocations)) errors.push(`${where}: collocations 必须是非空字符串数组`);
    if (v.key) {
      if (vocabSeen.has(v.key)) errors.push(`${where}: 词重复（normKey=${v.key}，首次出现于 ${vocabSeen.get(v.key)}）`);
      else vocabSeen.set(v.key, at(v));
    }
  });

  // ---- 写作与口语：id 全局唯一 ----
  const idSeen = new Map();
  const checkId = (item, where) => {
    if (!isNonEmptyStr(item.id)) {
      errors.push(`${where}: 缺少 id`);
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) errors.push(`${where}: id 只能含字母、数字、- 和 _`);
    if (idSeen.has(item.id)) errors.push(`${where}: id 重复（首次出现于 ${idSeen.get(item.id)}）`);
    else idSeen.set(item.id, at(item));
  };

  content.writing.forEach((w, i) => {
    const where = `${at(w)} writing[${i}] id=${w.id || '?'}`;
    checkId(w, where);
    if (w.task !== 1 && w.task !== 2) {
      errors.push(`${where}: task 必须是 1 或 2`);
      return;
    }
    if (!isNonEmptyStr(w.prompt)) errors.push(`${where}: 缺少 prompt`);
    if (!isNonEmptyStr(w.modelAnswer)) {
      errors.push(`${where}: 缺少 modelAnswer`);
    } else {
      const n = countWords(w.modelAnswer);
      const min = IELTS_MIN_MODEL_WORDS[w.task];
      if (n < min) errors.push(`${where}: 范文仅 ${n} 词，Task ${w.task} 至少 ${min} 词`);
    }
    // JSON 里 7.0 会存成 7，按数值判断即可
    if (!isBandNum(w.modelBand)) errors.push(`${where}: modelBand 必须是 0–9、步长 0.5 的数字`);

    if (w.task === 2) {
      if (!IELTS_TOPICS.has(w.topic)) errors.push(`${where}: topic 非法 (${w.topic})`);
      if (!IELTS_QTYPES.has(w.qtype)) errors.push(`${where}: qtype 必须是 ${[...IELTS_QTYPES].join(' / ')} (${w.qtype})`);
      if (!isNonEmptyStr(w.promptCn)) warnings.push(`${where}: 缺少 promptCn`);
      for (const f of ['ideas', 'outline', 'phrases']) {
        if (w[f] != null && !isStrArray(w[f])) errors.push(`${where}: ${f} 必须是非空字符串数组`);
        else if (w[f] == null) warnings.push(`${where}: 缺少 ${f}`);
      }
      return;
    }

    if (w.variant === 'A') {
      if (w.topic != null && !isNonEmptyStr(w.topic)) errors.push(`${where}: topic 必须是字符串`);
      else if (w.topic == null) warnings.push(`${where}: 缺少 topic`);
      if (w.keyFeatures != null && !isStrArray(w.keyFeatures)) errors.push(`${where}: keyFeatures 必须是非空字符串数组`);
      const c = w.chart;
      if (!c || typeof c !== 'object' || Array.isArray(c)) {
        errors.push(`${where}: 缺少 chart`);
        return;
      }
      if (!IELTS_CHART_TYPES.has(c.type)) errors.push(`${where}: chart.type 必须是 ${[...IELTS_CHART_TYPES].join(' / ')} (${c.type})`);
      if (!isNonEmptyStr(c.title)) warnings.push(`${where}: chart 缺少 title`);
      // 流程图和地图没有 categories / series，各走自己的结构校验
      if (c.type === 'process') {
        validateIeltsProcessChart(c, where, errors, warnings);
        return;
      }
      if (c.type === 'map') {
        validateIeltsMapChart(c, where, errors, warnings);
        return;
      }
      if (!Array.isArray(c.categories) || !c.categories.length) {
        errors.push(`${where}: chart.categories 不能为空`);
        return;
      }
      if (!Array.isArray(c.series) || !c.series.length) {
        errors.push(`${where}: chart.series 不能为空`);
        return;
      }
      if (c.type === 'pie' && c.series.length !== 1) errors.push(`${where}: pie 图只能有 1 个 series（实际 ${c.series.length}）`);
      c.series.forEach((s, j) => {
        const sw = `${where}.chart.series[${j}]`;
        if (!s || !isNonEmptyStr(s.name)) errors.push(`${sw}: 缺少 name`);
        if (!s || !Array.isArray(s.values)) {
          errors.push(`${sw}: 缺少 values`);
          return;
        }
        if (s.values.length !== c.categories.length) {
          errors.push(`${sw}: values 长度 ${s.values.length} 与 categories 长度 ${c.categories.length} 不一致`);
        }
        if (s.values.some((x) => typeof x !== 'number' || !Number.isFinite(x))) errors.push(`${sw}: values 必须全是数字`);
      });
    } else if (w.variant === 'G') {
      // G 类书信没有 topic 字段
      if (!IELTS_TONES.has(w.tone)) errors.push(`${where}: tone 必须是 formal / semi-formal / informal (${w.tone})`);
      if (!isStrArray(w.bullets) || !w.bullets.length) errors.push(`${where}: bullets 必须是非空字符串数组`);
    } else {
      errors.push(`${where}: Task 1 的 variant 必须是 A 或 G (${w.variant})`);
    }
  });

  const checkQA = (list, where, field) => {
    if (!Array.isArray(list) || !list.length) {
      errors.push(`${where}: ${field} 不能为空`);
      return;
    }
    list.forEach((x, j) => {
      if (!x || !isNonEmptyStr(x.q)) errors.push(`${where}.${field}[${j}]: 缺少 q`);
      if (!x || !isNonEmptyStr(x.sample)) errors.push(`${where}.${field}[${j}]: 缺少 sample`);
    });
  };

  content.speaking.forEach((s, i) => {
    const where = `${at(s)} speaking[${i}] id=${s.id || '?'}`;
    checkId(s, where);
    if (s.part === 1) {
      if (!isNonEmptyStr(s.topic)) errors.push(`${where}: 缺少 topic`);
      if (!isNonEmptyStr(s.topicCn)) warnings.push(`${where}: 缺少 topicCn`);
      checkQA(s.questions, where, 'questions');
    } else if (s.part === 2) {
      if (!IELTS_CATEGORIES.has(s.category)) errors.push(`${where}: category 必须是 ${[...IELTS_CATEGORIES].join(' / ')} (${s.category})`);
      const cc = s.cueCard;
      if (!cc || !isNonEmptyStr(cc.title) || !isStrArray(cc.points) || !cc.points.length || !isNonEmptyStr(cc.final)) {
        errors.push(`${where}: cueCard 须含 title、非空 points 与 final`);
      }
      if (!isNonEmptyStr(s.sample)) errors.push(`${where}: 缺少 sample`);
      checkQA(s.part3, where, 'part3');
    } else {
      errors.push(`${where}: part 必须是 1 或 2（Part 3 放在 Part 2 条目的 part3 里）`);
    }
  });

  const hasContent = content.vocab.length || content.writing.length || content.speaking.length;

  // ---- 评分维度：四个维度齐全 ----
  const checkDims = (dims, keys, where) => {
    if (!Array.isArray(dims)) {
      errors.push(`${where}: 必须是数组`);
      return;
    }
    const got = dims.map((d) => d && d.key);
    const missing = keys.filter((k) => !got.includes(k));
    const extra = got.filter((k) => !keys.includes(k));
    if (missing.length) errors.push(`${where}: 缺少维度 ${missing.join(', ')}`);
    if (extra.length) errors.push(`${where}: 多余维度 ${extra.join(', ')}（应为 ${keys.join(' / ')}）`);
    dims.forEach((d, j) => {
      const dw = `${where}[${j}] key=${(d && d.key) || '?'}`;
      if (!d || !isNonEmptyStr(d.name) || !isNonEmptyStr(d.nameCn)) errors.push(`${dw}: 缺少 name 或 nameCn`);
      if (!d || !Array.isArray(d.levels) || !d.levels.length) {
        errors.push(`${dw}: levels 不能为空`);
      } else if (d.levels.some((l) => !l || !isBandNum(l.band) || !isNonEmptyStr(l.desc))) {
        errors.push(`${dw}: levels 每项须有数字 band 和非空 desc`);
      }
      if (d && d.checklist != null && !isStrArray(d.checklist)) errors.push(`${dw}: checklist 必须是非空字符串数组`);
    });
  };
  const r = content.rubrics;
  if (r) {
    if (!r.writing || typeof r.writing !== 'object') errors.push('ielts/rubrics.json: 缺少 writing');
    else for (const [k, keys] of Object.entries(IELTS_RUBRIC_KEYS)) checkDims(r.writing[k], keys, `ielts/rubrics.json writing.${k}`);
    checkDims(r.speaking, IELTS_SPEAKING_RUBRIC_KEYS, 'ielts/rubrics.json speaking');
  } else if (content.writing.length || content.speaking.length) {
    warnings.push('ielts/rubrics.json: 文件缺失，写作 / 口语自评将没有分档描述');
  }

  // ---- 26 周计划 ----
  const plan = content.plan;
  if (plan) validateIeltsPlan(plan, errors, warnings);
  else if (hasContent || r) warnings.push('ielts/plan.json: 文件缺失，/api/ielts/plan 将不可用');

  return { errors, warnings };
}

/**
 * 流程图 chart：{ type: 'process', title, cycle?: boolean, stages: [{ id, label, note? }], links: [{ from, to, label? }] }
 * 规则：stage id 唯一、label 非空；links 的 from / to 必须引用已有 stage，不能自连、不能重复；cycle 时至少 3 个阶段。
 */
function validateIeltsProcessChart(c, where, errors, warnings) {
  if (c.cycle != null && typeof c.cycle !== 'boolean') errors.push(`${where}: chart.cycle 必须是 true / false`);
  if (!Array.isArray(c.stages) || c.stages.length < 2) {
    errors.push(`${where}: chart.stages 至少要有 2 个阶段`);
    return;
  }
  if (c.cycle === true && c.stages.length < 3) errors.push(`${where}: cycle 流程至少要有 3 个阶段`);
  const ids = new Set();
  c.stages.forEach((s, j) => {
    const sw = `${where}.chart.stages[${j}]`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      errors.push(`${sw}: 必须是对象`);
      return;
    }
    if (!isNonEmptyStr(s.id)) errors.push(`${sw}: 缺少 id`);
    else if (ids.has(s.id)) errors.push(`${sw}: stage id 重复 (${s.id})`);
    else ids.add(s.id);
    if (!isNonEmptyStr(s.label)) errors.push(`${sw}: label 不能为空`);
    if (s.note != null && !isNonEmptyStr(s.note)) errors.push(`${sw}: note 必须是非空字符串`);
  });
  if (!Array.isArray(c.links) || !c.links.length) {
    errors.push(`${where}: chart.links 不能为空`);
    return;
  }
  const linked = new Set();
  const pairs = new Set();
  c.links.forEach((l, j) => {
    const lw = `${where}.chart.links[${j}]`;
    if (!l || typeof l !== 'object' || Array.isArray(l)) {
      errors.push(`${lw}: 必须是对象`);
      return;
    }
    for (const end of ['from', 'to']) {
      if (!isNonEmptyStr(l[end])) errors.push(`${lw}: 缺少 ${end}`);
      else if (!ids.has(l[end])) errors.push(`${lw}: ${end} 引用了不存在的 stage id (${l[end]})`);
      else linked.add(l[end]);
    }
    if (isNonEmptyStr(l.from) && l.from === l.to) errors.push(`${lw}: from 和 to 不能是同一个阶段`);
    const key = `${l.from}\u0000${l.to}`;
    if (pairs.has(key)) errors.push(`${lw}: 连线重复 (${l.from} → ${l.to})`);
    pairs.add(key);
    if (l.label != null && !isNonEmptyStr(l.label)) errors.push(`${lw}: label 必须是非空字符串`);
  });
  ids.forEach((id) => {
    if (!linked.has(id)) warnings.push(`${where}: stage ${id} 没有任何连线`);
  });
}

/**
 * 地图 chart：{ type: 'map', title, compass?: boolean, maps: [{ title, features: [{ kind, x, y, w, h, label }] }] }
 * 规则：maps 恰好 2 张且各有 title；kind 合法；x / y / w / h 都是 0–100 的数字，且 x + w、y + h 不超过 100；
 * 除 label（纯文字标注，可 w = h = 0）外 w、h 必须大于 0；label 非空。
 */
function validateIeltsMapChart(c, where, errors, warnings) {
  if (c.compass != null && typeof c.compass !== 'boolean') errors.push(`${where}: chart.compass 必须是 true / false`);
  else if (c.compass !== true) warnings.push(`${where}: 地图建议带 compass: true（方位标）`);
  if (!Array.isArray(c.maps)) {
    errors.push(`${where}: chart.maps 必须是数组，且恰好 2 张`);
    return;
  }
  if (c.maps.length !== 2) errors.push(`${where}: chart.maps 必须恰好 2 张（实际 ${c.maps.length}）`);
  c.maps.forEach((m, j) => {
    const mw = `${where}.chart.maps[${j}]`;
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      errors.push(`${mw}: 必须是对象`);
      return;
    }
    if (!isNonEmptyStr(m.title)) errors.push(`${mw}: 缺少 title`);
    if (!Array.isArray(m.features) || !m.features.length) {
      errors.push(`${mw}: features 不能为空`);
      return;
    }
    m.features.forEach((f, k) => {
      const fw = `${mw}.features[${k}]`;
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        errors.push(`${fw}: 必须是对象`);
        return;
      }
      if (!IELTS_MAP_KINDS.has(f.kind)) errors.push(`${fw}: kind 必须是 ${[...IELTS_MAP_KINDS].join(' / ')} (${f.kind})`);
      if (!isNonEmptyStr(f.label)) errors.push(`${fw}: label 不能为空`);
      const bad = ['x', 'y', 'w', 'h'].filter((p) => typeof f[p] !== 'number' || !Number.isFinite(f[p]) || f[p] < 0 || f[p] > 100);
      if (bad.length) {
        errors.push(`${fw}: ${bad.join(' / ')} 必须是 0–100 的数字`);
        return;
      }
      if (f.x + f.w > 100 || f.y + f.h > 100) errors.push(`${fw}: 超出地图范围（x + w、y + h 不能大于 100）`);
      if (f.kind !== 'label' && (f.w <= 0 || f.h <= 0)) errors.push(`${fw}: ${f.kind} 的 w、h 必须大于 0`);
    });
  });
}

function validateIeltsPlan(plan, errors, warnings) {
  const P = 'ielts/plan.json';
  const N = plan.templateWeeks;
  if (N !== 26) errors.push(`${P}: templateWeeks 必须是 26（实际 ${N}）`);
  const total = Number.isInteger(N) && N > 0 ? N : 26;

  // 阶段：周区间连续覆盖 1..N、互不重叠
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  if (!phases.length) errors.push(`${P}: phases 不能为空`);
  const phaseOfWeek = new Map();
  phases.forEach((p, i) => {
    const where = `${P} phases[${i}] key=${(p && p.key) || '?'}`;
    if (!p || !isNonEmptyStr(p.key) || !isNonEmptyStr(p.name)) errors.push(`${where}: 缺少 key 或 name`);
    if (!p || !Array.isArray(p.weeks) || p.weeks.length !== 2 || !Number.isInteger(p.weeks[0]) || !Number.isInteger(p.weeks[1]) || p.weeks[0] > p.weeks[1]) {
      errors.push(`${where}: weeks 必须是 [起始周, 结束周]`);
      return;
    }
    for (let w = p.weeks[0]; w <= p.weeks[1]; w++) {
      if (phaseOfWeek.has(w)) errors.push(`${where}: 第 ${w} 周与阶段 ${phaseOfWeek.get(w)} 重叠`);
      else phaseOfWeek.set(w, p.key);
    }
  });
  for (let w = 1; w <= total; w++) if (!phaseOfWeek.has(w)) errors.push(`${P}: 第 ${w} 周不属于任何阶段`);

  // 周：共 N 周、编号 1..N 各一次，任务字段合法
  const weeks = Array.isArray(plan.weeks) ? plan.weeks : [];
  if (weeks.length !== total) errors.push(`${P}: weeks 应有 ${total} 周（实际 ${weeks.length}）`);
  const weekSeen = new Set();
  weeks.forEach((wk, i) => {
    const where = `${P} weeks[${i}] week=${(wk && wk.week) || '?'}`;
    if (!wk || !Number.isInteger(wk.week) || wk.week < 1 || wk.week > total) {
      errors.push(`${where}: week 必须是 1–${total} 的整数`);
      return;
    }
    if (weekSeen.has(wk.week)) errors.push(`${where}: week 重复`);
    weekSeen.add(wk.week);
    if (wk.phase !== phaseOfWeek.get(wk.week)) errors.push(`${where}: phase=${wk.phase} 与阶段划分（${phaseOfWeek.get(wk.week)}）不一致`);
    if (!isNonEmptyStr(wk.focus)) errors.push(`${where}: 缺少 focus`);
    if (typeof wk.tips !== 'string') errors.push(`${where}: tips 必须是字符串`);
    const tasks = Array.isArray(wk.tasks) ? wk.tasks : [];
    if (!tasks.length) {
      errors.push(`${where}: tasks 不能为空`);
      return;
    }
    if (tasks.length < 5 || tasks.length > 8) warnings.push(`${where}: 任务 ${tasks.length} 项，建议每周 5–8 项`);
    const keySeen = new Set();
    tasks.forEach((t, j) => {
      const tw = `${where}.tasks[${j}] key=${(t && t.key) || '?'}`;
      if (!t || !/^[A-Za-z0-9_-]{1,40}$/.test(t.key || '')) {
        errors.push(`${tw}: key 只能含字母、数字、- 和 _（1–40 字符）`);
        return;
      }
      if (keySeen.has(t.key)) errors.push(`${tw}: 同一周内 key 重复`);
      keySeen.add(t.key);
      if (!isNonEmptyStr(t.label)) errors.push(`${tw}: 缺少 label`);
      if (t.kind !== 'internal' && t.kind !== 'external') errors.push(`${tw}: kind 必须是 internal 或 external`);
      if (!IELTS_PLAN_TABS.has(t.tab)) errors.push(`${tw}: tab 非法 (${t.tab})`);
      if (t.per != null && t.per !== 'day' && t.per !== 'week') errors.push(`${tw}: per 必须是 day 或 week`);
      if (t.kind === 'internal' && (!Array.isArray(t.source) || !t.source.length)) errors.push(`${tw}: internal 任务必须有非空 source`);
      if (t.source != null) {
        const bad = Array.isArray(t.source) ? t.source.filter((s) => !IELTS_PLAN_SOURCES.has(s)) : ['(非数组)'];
        if (bad.length) errors.push(`${tw}: source 非法 (${bad.join(', ')})`);
      }
      if (t.target != null || t.kind === 'internal') {
        if (!Number.isInteger(t.target) || t.target <= 0) errors.push(`${tw}: target 必须是正整数`);
      }
      if (!isNonEmptyStr(t.unit)) warnings.push(`${tw}: 缺少 unit`);
      if (typeof t.minutes !== 'number' || !Number.isFinite(t.minutes) || t.minutes < 0) errors.push(`${tw}: minutes 必须是非负数字`);
    });
  });

  // 检查点
  (Array.isArray(plan.checkpoints) ? plan.checkpoints : []).forEach((cp, i) => {
    const where = `${P} checkpoints[${i}]`;
    if (!cp || !Number.isInteger(cp.week) || cp.week < 1 || cp.week > total) errors.push(`${where}: week 必须是 1–${total} 的整数`);
    if (!cp || !isNonEmptyStr(cp.name)) errors.push(`${where}: 缺少 name`);
    const c = (cp && cp.criteria) || {};
    if (!['B1', 'B2', 'C1'].includes(c.vocabBand)) errors.push(`${where}: criteria.vocabBand 必须是 B1 / B2 / C1`);
    if (typeof c.vocabCoverageMin !== 'number' || c.vocabCoverageMin < 0 || c.vocabCoverageMin > 100) errors.push(`${where}: criteria.vocabCoverageMin 必须是 0–100`);
    if (!isBandNum(c.writingMin)) errors.push(`${where}: criteria.writingMin 必须是 0–9、步长 0.5`);
    if (!isBandNum(c.speakingMin)) errors.push(`${where}: criteria.speakingMin 必须是 0–9、步长 0.5`);
  });
}

if (require.main === module) {
  data.reload();
  const { errors, warnings } = validate();
  warnings.forEach((w) => console.warn('⚠️  ' + w));
  errors.forEach((e) => console.error('❌ ' + e));
  console.log(`\n校验完成：${errors.length} 个错误，${warnings.length} 个警告`);
  process.exit(errors.length ? 1 : 0);
}

module.exports = { validate, validateIelts };
