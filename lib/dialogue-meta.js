'use strict';

// 情景对话场景分类元数据
const CATEGORIES = {
  home: { label: '家里', icon: '🏠' },
  phone: { label: '打电话', icon: '📞' },
  daily: { label: '日常交流', icon: '💬' },
  directions: { label: '问路', icon: '🧭' },
  neighbor: { label: '邻里', icon: '👋' },
  housing: { label: '租房住房', icon: '🏘️' },
  convenience: { label: '便利店', icon: '🏪' },
  postoffice: { label: '邮局快递', icon: '📦' },
  auto: { label: '用车', icon: '🚗' },
  services: { label: '生活服务', icon: '🔧' },
  delivery: { label: '外卖派送', icon: '🛵' },
  online: { label: '网购', icon: '📱' },
  pet: { label: '宠物', icon: '🐕' },
  parenting: { label: '亲子', icon: '👶' },
  entertainment: { label: '休闲娱乐', icon: '🎬' },
  social: { label: '社交聚会', icon: '🎉' },
  hardware: { label: '家居五金', icon: '🔨' },
  insurance: { label: '保险', icon: '📋' },
  sports: { label: '运动', icon: '⚽' },
  driving: { label: '驾校', icon: '🚦' },
  market: { label: '菜市场', icon: '🥬' },
  property: { label: '物业', icon: '🏛️' },
  complaint: { label: '投诉维权', icon: '⚖️' },
  community: { label: '社区活动', icon: '🤝' },
  moving: { label: '搬家', icon: '📦' },
  warehouse: { label: '仓储超市', icon: '🛒' },
  grocery: { label: '超市', icon: '🥫' },
  itwork: { label: 'IT工作', icon: '🖥️' },
  holiday: { label: '节日', icon: '🎃' },
  fleamarket: { label: '跳蚤市场', icon: '🏷️' },
  tech: { label: '数码维修', icon: '📟' },
  voting: { label: '投票选举', icon: '🗳️' },
  customs: { label: '海关入境', icon: '🛂' },
  recycle: { label: '环保回收', icon: '♻️' },
  nightlife: { label: '夜生活', icon: '🌙' },
  secondhand: { label: '二手交易', icon: '🤝' },
  amusement: { label: '主题乐园', icon: '🎢' },
  campus: { label: '校园生活', icon: '🎓' },
  academic: { label: '学术英语', icon: '📑' },
  camping: { label: '露营徒步', icon: '⛺' },
  fishing: { label: '钓鱼', icon: '🎣' },
  golf: { label: '高尔夫', icon: '⛳' },
  remote: { label: '远程会议', icon: '💻' },
  carwash: { label: '洗车保养', icon: '🧽' },
  garden: { label: '园艺花店', icon: '🌻' },
  laundry: { label: '自助洗衣', icon: '🧺' },
  museum: { label: '博物馆', icon: '🖼️' },
  cleaning: { label: '家政保洁', icon: '🧹' },
  farm: { label: '农场采摘', icon: '🍎' },
  bakery: { label: '烘焙店', icon: '🥐' },
  locksmith: { label: '锁匠开锁', icon: '🔑' },
  inspection: { label: '房屋验房', icon: '🔍' },
  clubhouse: { label: '社区会所', icon: '🏊' },
  storage: { label: '迷你仓储', icon: '🗄️' },
  plumbing: { label: '管道疏通', icon: '🚿' },
  wedding: { label: '婚礼场合', icon: '💒' },
  shopping: { label: '商场', icon: '🛍️' },
  airport: { label: '机场', icon: '✈️' },
  park: { label: '公园', icon: '🌳' },
  gym: { label: '健身房', icon: '💪' },
  office: { label: '公司', icon: '🏢' },
  restaurant: { label: '吃饭', icon: '🍽️' },
  travel: { label: '旅游', icon: '🗺️' },
  cafe: { label: '咖啡店', icon: '☕' },
  hospital: { label: '医院', icon: '🏥' },
  school: { label: '学校', icon: '🏫' },
  bank: { label: '银行', icon: '🏦' },
  pharmacy: { label: '药店', icon: '💊' },
  library: { label: '图书馆', icon: '📚' },
  transit: { label: '公交地铁', icon: '🚇' },
  interview: { label: '面试', icon: '💼' },
  salon: { label: '理发美容', icon: '💇' },
  emergency: { label: '紧急情况', icon: '🚨' },
};

// 二级目录：场景大类（左侧先选大类，再选具体场景）
const GROUPS = {
  home_life: { label: '居家社交', icon: '🏡', order: 1 },
  food_shop: { label: '餐饮购物', icon: '🛒', order: 2 },
  travel: { label: '出行旅游', icon: '✈️', order: 3 },
  work_study: { label: '职场学习', icon: '💼', order: 4 },
  housing: { label: '住房物业', icon: '🏘️', order: 5 },
  health: { label: '健康运动', icon: '🏥', order: 6 },
  life_svc: { label: '生活服务', icon: '🔧', order: 7 },
  leisure: { label: '休闲文娱', icon: '🎬', order: 8 },
};

const CATEGORY_GROUP = {
  home: 'home_life',
  phone: 'home_life',
  daily: 'home_life',
  neighbor: 'home_life',
  parenting: 'home_life',
  social: 'home_life',
  community: 'home_life',
  holiday: 'home_life',
  wedding: 'home_life',
  voting: 'home_life',
  restaurant: 'food_shop',
  cafe: 'food_shop',
  grocery: 'food_shop',
  market: 'food_shop',
  shopping: 'food_shop',
  warehouse: 'food_shop',
  convenience: 'food_shop',
  bakery: 'food_shop',
  fleamarket: 'food_shop',
  secondhand: 'food_shop',
  delivery: 'food_shop',
  online: 'food_shop',
  airport: 'travel',
  travel: 'travel',
  transit: 'travel',
  directions: 'travel',
  driving: 'travel',
  customs: 'travel',
  carwash: 'travel',
  camping: 'travel',
  office: 'work_study',
  interview: 'work_study',
  itwork: 'work_study',
  remote: 'work_study',
  school: 'work_study',
  library: 'work_study',
  campus: 'work_study',
  academic: 'work_study',
  housing: 'housing',
  property: 'housing',
  moving: 'housing',
  inspection: 'housing',
  storage: 'housing',
  clubhouse: 'housing',
  plumbing: 'housing',
  locksmith: 'housing',
  hardware: 'housing',
  hospital: 'health',
  pharmacy: 'health',
  gym: 'health',
  sports: 'health',
  emergency: 'health',
  bank: 'life_svc',
  insurance: 'life_svc',
  postoffice: 'life_svc',
  services: 'life_svc',
  salon: 'life_svc',
  tech: 'life_svc',
  auto: 'life_svc',
  pet: 'life_svc',
  complaint: 'life_svc',
  cleaning: 'life_svc',
  laundry: 'life_svc',
  garden: 'life_svc',
  farm: 'life_svc',
  recycle: 'life_svc',
  entertainment: 'leisure',
  nightlife: 'leisure',
  amusement: 'leisure',
  museum: 'leisure',
  park: 'leisure',
  fishing: 'leisure',
  golf: 'leisure',
};

function categoryGroupId(catKey) {
  return CATEGORY_GROUP[catKey] || 'life_svc';
}

/** 按二级目录聚合场景，供 API / 前端目录树使用 */
function buildGroupTree(byCategory) {
  const buckets = {};
  for (const gid of Object.keys(GROUPS)) {
    buckets[gid] = { id: gid, ...GROUPS[gid], count: 0, categories: [] };
  }
  for (const [catKey, n] of Object.entries(byCategory || {})) {
    if (!n) continue;
    const gid = categoryGroupId(catKey);
    if (!buckets[gid]) {
      buckets[gid] = { id: gid, label: gid, icon: '📁', order: 99, count: 0, categories: [] };
    }
    buckets[gid].categories.push({ id: catKey, count: n });
    buckets[gid].count += n;
  }
  return Object.values(buckets)
    .filter((g) => g.count > 0)
    .map((g) => {
      g.categories.sort((a, b) => {
        const diff = b.count - a.count;
        if (diff) return diff;
        const la = (CATEGORIES[a.id] && CATEGORIES[a.id].label) || a.id;
        const lb = (CATEGORIES[b.id] && CATEGORIES[b.id].label) || b.id;
        return la.localeCompare(lb, 'zh');
      });
      return g;
    })
    .sort((a, b) => (a.order || 99) - (b.order || 99));
}

const LEARNER_ROLE = 'You';

module.exports = {
  CATEGORIES,
  GROUPS,
  CATEGORY_GROUP,
  categoryGroupId,
  buildGroupTree,
  LEARNER_ROLE,
};
