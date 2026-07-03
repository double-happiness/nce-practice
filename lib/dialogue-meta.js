'use strict';

// 情景对话场景分类元数据
const CATEGORIES = {
  home: { label: '家里', icon: '🏠' },
  shopping: { label: '商场', icon: '🛍️' },
  airport: { label: '机场', icon: '✈️' },
  park: { label: '公园', icon: '🌳' },
  gym: { label: '健身房', icon: '💪' },
  office: { label: '公司', icon: '🏢' },
  restaurant: { label: '吃饭', icon: '🍽️' },
  travel: { label: '旅游', icon: '🗺️' },
  cafe: { label: '咖啡店', icon: '☕' },
};

const LEARNER_ROLE = 'You';

module.exports = { CATEGORIES, LEARNER_ROLE };
