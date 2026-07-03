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

  data.getLessons().forEach((l, i) => {
    const where = `lessons[${i}] L${l.lesson}`;
    if (l.lesson == null) errors.push(`${where}: 缺少 lesson`);
    if (!l.title) warnings.push(`${where}: 缺少 title`);
    if (!Array.isArray(l.words) || !l.words.length) warnings.push(`${where}: 缺少 words`);
    (l.words || []).forEach((w, j) => {
      if (!w.word) errors.push(`${where}.words[${j}]: 缺少 word`);
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
