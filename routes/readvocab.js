'use strict';

// 阅读词汇量测试 —— 看英文单词选中文释义，分层抽样估算「阅读词汇量」
const { createRouter } = require('../lib/vocabtest');

module.exports = createRouter({
  dataKey: 'read-vocab',
  apiPrefix: 'read-vocab',
  label: '阅读',
});
