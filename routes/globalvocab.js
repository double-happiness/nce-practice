'use strict';

// 总词汇量测试 —— 基于内置全局词库（频率/CEFR 分级），估算整体英语词汇量
const { createRouter } = require('../lib/vocabtest');
const { buildGlobalDict } = require('../lib/globalvocab');

module.exports = createRouter({
  dataKey: 'global-vocab',
  apiPrefix: 'global-vocab',
  label: '总',
  useBook: false,
  getDict: () => buildGlobalDict(),
  bandMode: 'band',
});
