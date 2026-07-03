'use strict';

// 数据校验：题库与课程内容的完整性检查
// 用法： npm run validate   （命令行）
// 服务启动时也会自动调用一次，把问题数量打印出来
const data = require('../lib/data');

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
