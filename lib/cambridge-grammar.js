'use strict';

// 剑桥语法在用（EGIU / EGIU2）与 NCE 句型转换的对照工具
const path = require('path');
const { readJSON } = require('./store');

const REF_PATH = path.join(__dirname, '..', 'data', 'reference', 'cambridge-grammar.json');
let _ref = null;

function loadRef() {
  if (!_ref) _ref = readJSON(REF_PATH, null);
  if (!_ref || !_ref.levels) throw new Error('cambridge-grammar.json 缺失或格式错误');
  return _ref;
}

function flattenUnits(level) {
  const ref = loadRef();
  const lv = ref.levels[level];
  if (!lv) return [];
  const out = [];
  for (const sec of lv.sections || []) {
    for (const u of sec.units || []) {
      out.push({
        ...u,
        level,
        sectionId: sec.id,
        sectionTitleCn: sec.titleCn,
        levelTitle: lv.title,
        levelSubtitle: lv.subtitle,
      });
    }
  }
  return out;
}

function levelForNceBook(book) {
  const ref = loadRef();
  return ref.nceBookLevel[String(book)] || null;
}

function getSectionsForBook(book) {
  const level = levelForNceBook(book);
  if (!level) return { level: null, levelTitle: '', sections: [] };
  const ref = loadRef();
  const lv = ref.levels[level];
  return {
    level,
    levelTitle: lv.title,
    levelSubtitle: lv.subtitle,
    sections: (lv.sections || []).map((sec) => ({
      id: sec.id,
      titleCn: sec.titleCn,
      units: (sec.units || []).map((u) => ({
        unit: u.unit,
        title: u.title,
        titleCn: u.titleCn,
        grammar: u.grammar || [],
        stepOrder: u.stepOrder || null,
      })),
    })),
  };
}

// 语法标签 → 剑桥单元（可能一对多）
function grammarToUnits(level, grammarTag) {
  return flattenUnits(level).filter((u) => (u.grammar || []).includes(grammarTag));
}

// 为一条句型转换推断最匹配的剑桥单元（取 grammar 交集最大的单元）
function inferCambridge(transform) {
  const level = levelForNceBook(transform.book);
  if (!level) return null;
  const tags = transform.grammar || [];
  if (!tags.length) return null;
  const units = flattenUnits(level);
  let best = null;
  let bestScore = 0;
  for (const u of units) {
    const overlap = (u.grammar || []).filter((g) => tags.includes(g)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = u;
    }
  }
  if (!best) return null;
  return {
    level: best.level,
    unit: best.unit,
    title: best.title,
    titleCn: best.titleCn,
    sectionTitleCn: best.sectionTitleCn,
    levelTitle: best.levelTitle,
  };
}

function transformMatchesUnit(transform, level, unitNum) {
  const u = flattenUnits(level).find((x) => x.unit === Number(unitNum));
  if (!u) return false;
  const tags = transform.grammar || [];
  return (u.grammar || []).some((g) => tags.includes(g));
}

// 某册各剑桥单元已覆盖的句型转换数量
function coverageByBook(transforms, book) {
  const level = levelForNceBook(book);
  if (!level) return [];
  const list = transforms.filter((t) => t.book === Number(book));
  return flattenUnits(level).map((u) => {
    const count = list.filter((t) => transformMatchesUnit(t, level, u.unit)).length;
    return {
      unit: u.unit,
      title: u.title,
      titleCn: u.titleCn,
      sectionTitleCn: u.sectionTitleCn,
      grammar: u.grammar,
      count,
    };
  });
}

// 剑桥单元推荐转换链（与 EGIU 左页讲解顺序一致时可先否定后疑问）
function recommendedStepOrder(level, unitNum) {
  const u = flattenUnits(level).find((x) => x.unit === Number(unitNum));
  return (u && u.stepOrder) || ['translate', 'yesno', 'negative', 'wh'];
}

function cambridgeHint(cambridge) {
  if (!cambridge) return '';
  return `对应《${cambridge.levelTitle}》Unit ${cambridge.unit}：${cambridge.titleCn || cambridge.title}`;
}

module.exports = {
  loadRef,
  levelForNceBook,
  getSectionsForBook,
  flattenUnits,
  grammarToUnits,
  inferCambridge,
  transformMatchesUnit,
  coverageByBook,
  recommendedStepOrder,
  cambridgeHint,
};
