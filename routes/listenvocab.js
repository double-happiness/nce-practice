'use strict';

// 听力词汇量测试 —— 听发音选中文释义，分层抽样估算「听力词汇量」
const { createRouter } = require('../lib/vocabtest');

module.exports = createRouter({
  dataKey: 'listen-vocab',
  apiPrefix: 'listen-vocab',
  label: '听力',
});
