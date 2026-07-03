'use strict';
// 生成 data/global-vocab.json —— 按词频/CEFR 分 5 段通用英语词库
// 用法：node scripts/build-global-vocab.js
// 扩展：在 BANDS 各段 words 数组中追加 [word, pos, cn] 三元组后重新运行

const fs = require('fs');
const path = require('path');
const { buildDict } = require('../lib/dict');
const SUPPLEMENT = require('./global-vocab-supplement');

// [word, pos, cn] —— pos 可为空字符串
const BANDS = [
  {
    band: 0,
    label: '基础（A1）',
    cefr: 'A1',
    words: [
      ['the', 'art.', '这/那'], ['be', 'v.', '是'], ['to', 'prep.', '到/向'], ['of', 'prep.', '…的'],
      ['and', 'conj.', '和'], ['a', 'art.', '一个'], ['in', 'prep.', '在…里'], ['that', 'conj.', '那/那个'],
      ['have', 'v.', '有'], ['I', 'pron.', '我'], ['it', 'pron.', '它'], ['for', 'prep.', '为了/给'],
      ['not', 'adv.', '不'], ['on', 'prep.', '在…上'], ['with', 'prep.', '和/用'], ['he', 'pron.', '他'],
      ['as', 'conj.', '作为/当'], ['you', 'pron.', '你/你们'], ['do', 'v.', '做'], ['at', 'prep.', '在'],
      ['this', 'pron.', '这个'], ['but', 'conj.', '但是'], ['his', 'pron.', '他的'], ['by', 'prep.', '被/通过'],
      ['from', 'prep.', '从'], ['they', 'pron.', '他们'], ['we', 'pron.', '我们'], ['say', 'v.', '说'],
      ['her', 'pron.', '她的/她'], ['she', 'pron.', '她'], ['or', 'conj.', '或者'], ['an', 'art.', '一个'],
      ['will', 'v.', '将/会'], ['my', 'pron.', '我的'], ['one', 'num.', '一/一个'], ['all', 'adj.', '全部'],
      ['would', 'v.', '会/愿意'], ['there', 'adv.', '那里'], ['their', 'pron.', '他们的'], ['what', 'pron.', '什么'],
      ['so', 'adv.', '所以/如此'], ['up', 'adv.', '向上'], ['out', 'adv.', '出去'], ['if', 'conj.', '如果'],
      ['about', 'prep.', '关于'], ['who', 'pron.', '谁'], ['get', 'v.', '得到'], ['which', 'pron.', '哪个'],
      ['go', 'v.', '去'], ['me', 'pron.', '我'], ['when', 'adv.', '当…时'], ['make', 'v.', '制作/使'],
      ['can', 'v.', '能'], ['like', 'v.', '喜欢/像'], ['time', 'n.', '时间'], ['no', 'adv.', '不/没有'],
      ['just', 'adv.', '仅仅/刚才'], ['him', 'pron.', '他'], ['know', 'v.', '知道'], ['take', 'v.', '拿/带'],
      ['people', 'n.', '人们'], ['into', 'prep.', '进入'], ['year', 'n.', '年'], ['your', 'pron.', '你的'],
      ['good', 'adj.', '好的'], ['some', 'adj.', '一些'], ['could', 'v.', '能够'], ['them', 'pron.', '他们'],
      ['see', 'v.', '看见'], ['other', 'adj.', '其他的'], ['than', 'conj.', '比'], ['then', 'adv.', '然后'],
      ['now', 'adv.', '现在'], ['look', 'v.', '看'], ['only', 'adv.', '仅仅'], ['come', 'v.', '来'],
      ['its', 'pron.', '它的'], ['over', 'prep.', '在…上方/结束'], ['think', 'v.', '想/认为'], ['also', 'adv.', '也'],
      ['back', 'adv.', '回来'], ['after', 'prep.', '在…之后'], ['use', 'v.', '使用'], ['two', 'num.', '二'],
      ['how', 'adv.', '如何'], ['our', 'pron.', '我们的'], ['work', 'v.', '工作'], ['first', 'adj.', '第一'],
      ['well', 'adv.', '好'], ['way', 'n.', '方式/路'], ['even', 'adv.', '甚至'], ['new', 'adj.', '新的'],
      ['want', 'v.', '想要'], ['because', 'conj.', '因为'], ['any', 'adj.', '任何'], ['these', 'pron.', '这些'],
      ['give', 'v.', '给'], ['day', 'n.', '天'], ['most', 'adv.', '最/大多数'], ['us', 'pron.', '我们'],
      ['man', 'n.', '男人'], ['find', 'v.', '找到'], ['here', 'adv.', '这里'], ['thing', 'n.', '东西'],
      ['many', 'adj.', '许多'], ['tell', 'v.', '告诉'], ['very', 'adv.', '非常'], ['when', 'adv.', '何时'],
      ['before', 'prep.', '在…之前'], ['move', 'v.', '移动'], ['right', 'adj.', '正确的/右边'], ['boy', 'n.', '男孩'],
      ['old', 'adj.', '老的'], ['too', 'adv.', '也/太'], ['same', 'adj.', '相同的'], ['water', 'n.', '水'],
      ['long', 'adj.', '长的'], ['little', 'adj.', '小的/少的'], ['where', 'adv.', '哪里'], ['help', 'v.', '帮助'],
      ['big', 'adj.', '大的'], ['own', 'adj.', '自己的'], ['every', 'adj.', '每个'], ['name', 'n.', '名字'],
      ['place', 'n.', '地方'], ['home', 'n.', '家'], ['hand', 'n.', '手'], ['part', 'n.', '部分'],
      ['child', 'n.', '孩子'], ['eye', 'n.', '眼睛'], ['woman', 'n.', '女人'], ['life', 'n.', '生活/生命'],
      ['world', 'n.', '世界'], ['school', 'n.', '学校'], ['family', 'n.', '家庭'], ['friend', 'n.', '朋友'],
      ['food', 'n.', '食物'], ['house', 'n.', '房子'], ['book', 'n.', '书'], ['car', 'n.', '汽车'],
      ['city', 'n.', '城市'], ['country', 'n.', '国家'], ['money', 'n.', '钱'], ['job', 'n.', '工作'],
      ['love', 'v.', '爱'], ['play', 'v.', '玩/演奏'], ['read', 'v.', '读'], ['write', 'v.', '写'],
      ['run', 'v.', '跑'], ['walk', 'v.', '走'], ['eat', 'v.', '吃'], ['drink', 'v.', '喝'],
      ['sleep', 'v.', '睡觉'], ['open', 'v.', '打开'], ['close', 'v.', '关闭'], ['buy', 'v.', '买'],
      ['sell', 'v.', '卖'], ['happy', 'adj.', '快乐的'], ['sad', 'adj.', '悲伤的'], ['hot', 'adj.', '热的'],
      ['cold', 'adj.', '冷的'], ['fast', 'adj.', '快的'], ['slow', 'adj.', '慢的'], ['easy', 'adj.', '容易的'],
      ['hard', 'adj.', '困难的/硬的'], ['yes', 'adv.', '是'], ['please', 'int.', '请'], ['thank', 'v.', '感谢'],
      ['hello', 'int.', '你好'], ['goodbye', 'int.', '再见'], ['morning', 'n.', '早晨'], ['night', 'n.', '夜晚'],
    ],
  },
  {
    band: 1,
    label: '初级（A2）',
    cefr: 'A2',
    words: [
      ['always', 'adv.', '总是'], ['never', 'adv.', '从不'], ['often', 'adv.', '经常'], ['sometimes', 'adv.', '有时'],
      ['usually', 'adv.', '通常'], ['already', 'adv.', '已经'], ['still', 'adv.', '仍然'], ['again', 'adv.', '再次'],
      ['enough', 'adj.', '足够的'], ['quite', 'adv.', '相当'], ['rather', 'adv.', '相当/宁愿'], ['almost', 'adv.', '几乎'],
      ['perhaps', 'adv.', '也许'], ['maybe', 'adv.', '可能'], ['together', 'adv.', '一起'], ['alone', 'adv.', '独自'],
      ['quickly', 'adv.', '快速地'], ['slowly', 'adv.', '慢慢地'], ['carefully', 'adv.', '仔细地'], ['suddenly', 'adv.', '突然'],
      ['important', 'adj.', '重要的'], ['different', 'adj.', '不同的'], ['possible', 'adj.', '可能的'], ['necessary', 'adj.', '必要的'],
      ['popular', 'adj.', '流行的'], ['famous', 'adj.', '著名的'], ['beautiful', 'adj.', '美丽的'], ['interesting', 'adj.', '有趣的'],
      ['boring', 'adj.', '无聊的'], ['dangerous', 'adj.', '危险的'], ['safe', 'adj.', '安全的'], ['healthy', 'adj.', '健康的'],
      ['sick', 'adj.', '生病的'], ['tired', 'adj.', '累的'], ['hungry', 'adj.', '饿的'], ['thirsty', 'adj.', '渴的'],
      ['busy', 'adj.', '忙的'], ['free', 'adj.', '自由的/免费的'], ['ready', 'adj.', '准备好的'], ['sure', 'adj.', '确定的'],
      ['afraid', 'adj.', '害怕的'], ['sorry', 'adj.', '抱歉的'], ['glad', 'adj.', '高兴的'], ['proud', 'adj.', '自豪的'],
      ['angry', 'adj.', '生气的'], ['worried', 'adj.', '担心的'], ['excited', 'adj.', '兴奋的'], ['surprised', 'adj.', '惊讶的'],
      ['decide', 'v.', '决定'], ['choose', 'v.', '选择'], ['plan', 'v.', '计划'], ['prepare', 'v.', '准备'],
      ['remember', 'v.', '记得'], ['forget', 'v.', '忘记'], ['understand', 'v.', '理解'], ['explain', 'v.', '解释'],
      ['describe', 'v.', '描述'], ['compare', 'v.', '比较'], ['improve', 'v.', '改进'], ['change', 'v.', '改变'],
      ['continue', 'v.', '继续'], ['finish', 'v.', '完成'], ['start', 'v.', '开始'], ['stop', 'v.', '停止'],
      ['arrive', 'v.', '到达'], ['leave', 'v.', '离开'], ['travel', 'v.', '旅行'], ['visit', 'v.', '参观'],
      ['invite', 'v.', '邀请'], ['accept', 'v.', '接受'], ['refuse', 'v.', '拒绝'], ['agree', 'v.', '同意'],
      ['disagree', 'v.', '不同意'], ['promise', 'v.', '承诺'], ['borrow', 'v.', '借入'], ['lend', 'v.', '借出'],
      ['pay', 'v.', '支付'], ['cost', 'v.', '花费'], ['spend', 'v.', '花费'], ['save', 'v.', '节省/保存'],
      ['win', 'v.', '赢'], ['lose', 'v.', '输/丢失'], ['catch', 'v.', '抓住'], ['throw', 'v.', '扔'],
      ['break', 'v.', '打破'], ['fix', 'v.', '修理'], ['build', 'v.', '建造'], ['create', 'v.', '创造'],
      ['destroy', 'v.', '摧毁'], ['grow', 'v.', '生长'], ['die', 'v.', '死亡'], ['born', 'v.', '出生'],
      ['marry', 'v.', '结婚'], ['divorce', 'v.', '离婚'], ['celebrate', 'v.', '庆祝'], ['enjoy', 'v.', '享受'],
      ['hate', 'v.', '讨厌'], ['prefer', 'v.', '更喜欢'], ['miss', 'v.', '想念/错过'], ['hope', 'v.', '希望'],
      ['wish', 'v.', '希望'], ['dream', 'v.', '做梦'], ['believe', 'v.', '相信'], ['doubt', 'v.', '怀疑'],
      ['weather', 'n.', '天气'], ['season', 'n.', '季节'], ['spring', 'n.', '春天'], ['summer', 'n.', '夏天'],
      ['autumn', 'n.', '秋天'], ['winter', 'n.', '冬天'], ['rain', 'n.', '雨'], ['snow', 'n.', '雪'],
      ['wind', 'n.', '风'], ['cloud', 'n.', '云'], ['sun', 'n.', '太阳'], ['moon', 'n.', '月亮'],
      ['star', 'n.', '星星'], ['sky', 'n.', '天空'], ['river', 'n.', '河流'], ['mountain', 'n.', '山'],
      ['forest', 'n.', '森林'], ['beach', 'n.', '海滩'], ['island', 'n.', '岛'], ['ocean', 'n.', '海洋'],
      ['animal', 'n.', '动物'], ['dog', 'n.', '狗'], ['cat', 'n.', '猫'], ['bird', 'n.', '鸟'],
      ['fish', 'n.', '鱼'], ['horse', 'n.', '马'], ['elephant', 'n.', '大象'], ['lion', 'n.', '狮子'],
      ['fruit', 'n.', '水果'], ['vegetable', 'n.', '蔬菜'], ['bread', 'n.', '面包'], ['rice', 'n.', '米饭'],
      ['meat', 'n.', '肉'], ['chicken', 'n.', '鸡肉'], ['egg', 'n.', '鸡蛋'], ['milk', 'n.', '牛奶'],
      ['coffee', 'n.', '咖啡'], ['tea', 'n.', '茶'], ['sugar', 'n.', '糖'], ['salt', 'n.', '盐'],
      ['kitchen', 'n.', '厨房'], ['bedroom', 'n.', '卧室'], ['bathroom', 'n.', '浴室'], ['garden', 'n.', '花园'],
      ['office', 'n.', '办公室'], ['shop', 'n.', '商店'], ['market', 'n.', '市场'], ['restaurant', 'n.', '餐厅'],
      ['hospital', 'n.', '医院'], ['station', 'n.', '车站'], ['airport', 'n.', '机场'], ['hotel', 'n.', '酒店'],
      ['ticket', 'n.', '票'], ['passport', 'n.', '护照'], ['luggage', 'n.', '行李'], ['map', 'n.', '地图'],
    ],
  },
  {
    band: 2,
    label: '中级（B1）',
    cefr: 'B1',
    words: [
      ['ability', 'n.', '能力'], ['advantage', 'n.', '优势'], ['advertisement', 'n.', '广告'], ['advice', 'n.', '建议'],
      ['ambition', 'n.', '抱负'], ['appointment', 'n.', '约会/预约'], ['attitude', 'n.', '态度'], ['audience', 'n.', '观众'],
      ['balance', 'n.', '平衡'], ['behavior', 'n.', '行为'], ['benefit', 'n.', '好处'], ['budget', 'n.', '预算'],
      ['career', 'n.', '职业'], ['challenge', 'n.', '挑战'], ['character', 'n.', '性格/角色'], ['choice', 'n.', '选择'],
      ['climate', 'n.', '气候'], ['comment', 'n.', '评论'], ['community', 'n.', '社区'], ['competition', 'n.', '竞争'],
      ['condition', 'n.', '条件/状况'], ['confidence', 'n.', '信心'], ['conflict', 'n.', '冲突'], ['connection', 'n.', '联系'],
      ['consequence', 'n.', '后果'], ['consumer', 'n.', '消费者'], ['contribution', 'n.', '贡献'], ['conversation', 'n.', '对话'],
      ['culture', 'n.', '文化'], ['customer', 'n.', '顾客'], ['decision', 'n.', '决定'], ['degree', 'n.', '程度/学位'],
      ['demand', 'n.', '需求'], ['description', 'n.', '描述'], ['development', 'n.', '发展'], ['difference', 'n.', '差异'],
      ['direction', 'n.', '方向'], ['disadvantage', 'n.', '劣势'], ['discipline', 'n.', '纪律/学科'], ['discussion', 'n.', '讨论'],
      ['distance', 'n.', '距离'], ['economy', 'n.', '经济'], ['education', 'n.', '教育'], ['effect', 'n.', '效果'],
      ['effort', 'n.', '努力'], ['emotion', 'n.', '情感'], ['energy', 'n.', '能量'], ['environment', 'n.', '环境'],
      ['equipment', 'n.', '设备'], ['evidence', 'n.', '证据'], ['experience', 'n.', '经验'], ['expert', 'n.', '专家'],
      ['failure', 'n.', '失败'], ['feature', 'n.', '特征'], ['feedback', 'n.', '反馈'], ['focus', 'n.', '焦点'],
      ['freedom', 'n.', '自由'], ['friendship', 'n.', '友谊'], ['function', 'n.', '功能'], ['goal', 'n.', '目标'],
      ['government', 'n.', '政府'], ['growth', 'n.', '增长'], ['habit', 'n.', '习惯'], ['health', 'n.', '健康'],
      ['history', 'n.', '历史'], ['identity', 'n.', '身份'], ['imagination', 'n.', '想象力'], ['impact', 'n.', '影响'],
      ['income', 'n.', '收入'], ['independence', 'n.', '独立'], ['industry', 'n.', '工业'], ['influence', 'n.', '影响'],
      ['information', 'n.', '信息'], ['injury', 'n.', '伤害'], ['innovation', 'n.', '创新'], ['instruction', 'n.', '指示'],
      ['intelligence', 'n.', '智力'], ['interest', 'n.', '兴趣'], ['investment', 'n.', '投资'], ['issue', 'n.', '问题'],
      ['knowledge', 'n.', '知识'], ['language', 'n.', '语言'], ['leadership', 'n.', '领导力'], ['learning', 'n.', '学习'],
      ['lifestyle', 'n.', '生活方式'], ['location', 'n.', '位置'], ['management', 'n.', '管理'], ['material', 'n.', '材料'],
      ['meaning', 'n.', '意义'], ['memory', 'n.', '记忆'], ['method', 'n.', '方法'], ['mistake', 'n.', '错误'],
      ['motivation', 'n.', '动机'], ['movement', 'n.', '运动'], ['nature', 'n.', '自然'], ['network', 'n.', '网络'],
      ['opinion', 'n.', '意见'], ['opportunity', 'n.', '机会'], ['organization', 'n.', '组织'], ['performance', 'n.', '表现'],
      ['personality', 'n.', '个性'], ['policy', 'n.', '政策'], ['pollution', 'n.', '污染'], ['population', 'n.', '人口'],
      ['pressure', 'n.', '压力'], ['principle', 'n.', '原则'], ['priority', 'n.', '优先'], ['problem', 'n.', '问题'],
      ['process', 'n.', '过程'], ['product', 'n.', '产品'], ['progress', 'n.', '进步'], ['project', 'n.', '项目'],
      ['purpose', 'n.', '目的'], ['quality', 'n.', '质量'], ['question', 'n.', '问题'], ['reason', 'n.', '原因'],
      ['relationship', 'n.', '关系'], ['research', 'n.', '研究'], ['resource', 'n.', '资源'], ['response', 'n.', '回应'],
      ['responsibility', 'n.', '责任'], ['result', 'n.', '结果'], ['risk', 'n.', '风险'], ['role', 'n.', '角色'],
      ['rule', 'n.', '规则'], ['safety', 'n.', '安全'], ['science', 'n.', '科学'], ['security', 'n.', '安全'],
      ['service', 'n.', '服务'], ['situation', 'n.', '情况'], ['skill', 'n.', '技能'], ['society', 'n.', '社会'],
      ['solution', 'n.', '解决方案'], ['source', 'n.', '来源'], ['strategy', 'n.', '策略'], ['strength', 'n.', '力量'],
      ['stress', 'n.', '压力'], ['structure', 'n.', '结构'], ['success', 'n.', '成功'], ['support', 'n.', '支持'],
      ['system', 'n.', '系统'], ['talent', 'n.', '天赋'], ['technology', 'n.', '技术'], ['theory', 'n.', '理论'],
      ['thought', 'n.', '想法'], ['tradition', 'n.', '传统'], ['training', 'n.', '训练'], ['trend', 'n.', '趋势'],
      ['trust', 'n.', '信任'], ['value', 'n.', '价值'], ['variety', 'n.', '多样性'], ['victory', 'n.', '胜利'],
      ['violence', 'n.', '暴力'], ['vision', 'n.', '愿景'], ['welfare', 'n.', '福利'], ['wisdom', 'n.', '智慧'],
    ],
  },
  {
    band: 3,
    label: '中高级（B2）',
    cefr: 'B2',
    words: [
      ['abandon', 'v.', '放弃'], ['accomplish', 'v.', '完成'], ['acknowledge', 'v.', '承认'], ['adapt', 'v.', '适应'],
      ['adjust', 'v.', '调整'], ['advocate', 'v.', '倡导'], ['allocate', 'v.', '分配'], ['analyze', 'v.', '分析'],
      ['anticipate', 'v.', '预期'], ['appreciate', 'v.', '欣赏/感激'], ['approach', 'v.', '接近/方法'], ['approve', 'v.', '批准'],
      ['assess', 'v.', '评估'], ['assume', 'v.', '假设'], ['assure', 'v.', '保证'], ['attain', 'v.', '达到'],
      ['attribute', 'v.', '归因'], ['authorize', 'v.', '授权'], ['ban', 'v.', '禁止'], ['boost', 'v.', '促进'],
      ['calculate', 'v.', '计算'], ['cancel', 'v.', '取消'], ['capture', 'v.', '捕获'], ['celebrate', 'v.', '庆祝'],
      ['challenge', 'v.', '挑战'], ['clarify', 'v.', '澄清'], ['collapse', 'v.', '崩溃'], ['combine', 'v.', '结合'],
      ['commit', 'v.', '承诺/犯'], ['communicate', 'v.', '沟通'], ['compensate', 'v.', '补偿'], ['compete', 'v.', '竞争'],
      ['compile', 'v.', '编译/汇编'], ['complain', 'v.', '抱怨'], ['comply', 'v.', '遵守'], ['compose', 'v.', '组成/作曲'],
      ['comprehend', 'v.', '理解'], ['concentrate', 'v.', '集中'], ['conclude', 'v.', '结论'], ['conduct', 'v.', '进行/行为'],
      ['confess', 'v.', '承认'], ['confirm', 'v.', '确认'], ['confront', 'v.', '面对'], ['connect', 'v.', '连接'],
      ['consider', 'v.', '考虑'], ['consist', 'v.', '组成'], ['construct', 'v.', '建造'], ['consult', 'v.', '咨询'],
      ['consume', 'v.', '消费'], ['contribute', 'v.', '贡献'], ['convince', 'v.', '说服'], ['coordinate', 'v.', '协调'],
      ['cope', 'v.', '应对'], ['correspond', 'v.', '对应/通信'], ['criticize', 'v.', '批评'], ['cultivate', 'v.', '培养'],
      ['debate', 'v.', '辩论'], ['decline', 'v.', '下降/拒绝'], ['deduce', 'v.', '推断'], ['defend', 'v.', '防御'],
      ['define', 'v.', '定义'], ['demonstrate', 'v.', '演示'], ['deny', 'v.', '否认'], ['depict', 'v.', '描绘'],
      ['derive', 'v.', '衍生'], ['design', 'v.', '设计'], ['detect', 'v.', '检测'], ['determine', 'v.', '决定'],
      ['develop', 'v.', '发展'], ['devote', 'v.', '奉献'], ['differentiate', 'v.', '区分'], ['diminish', 'v.', '减少'],
      ['discourage', 'v.', '使气馁'], ['discover', 'v.', '发现'], ['discuss', 'v.', '讨论'], ['distinguish', 'v.', '区分'],
      ['distribute', 'v.', '分发'], ['dominate', 'v.', '主导'], ['eliminate', 'v.', '消除'], ['emphasize', 'v.', '强调'],
      ['enable', 'v.', '使能够'], ['encounter', 'v.', '遭遇'], ['encourage', 'v.', '鼓励'], ['enforce', 'v.', '执行'],
      ['engage', 'v.', '参与'], ['enhance', 'v.', '增强'], ['ensure', 'v.', '确保'], ['establish', 'v.', '建立'],
      ['estimate', 'v.', '估计'], ['evaluate', 'v.', '评估'], ['evolve', 'v.', '进化'], ['examine', 'v.', '检查'],
      ['exceed', 'v.', '超过'], ['exclude', 'v.', '排除'], ['execute', 'v.', '执行'], ['exhibit', 'v.', '展示'],
      ['expand', 'v.', '扩展'], ['expect', 'v.', '期望'], ['expense', 'n.', '费用'], ['experiment', 'v.', '实验'],
      ['explore', 'v.', '探索'], ['expose', 'v.', '暴露'], ['express', 'v.', '表达'], ['extend', 'v.', '延伸'],
      ['facilitate', 'v.', '促进'], ['fascinate', 'v.', '迷住'], ['flourish', 'v.', '繁荣'], ['formulate', 'v.', '制定'],
      ['fulfill', 'v.', '履行'], ['generate', 'v.', '生成'], ['govern', 'v.', '治理'], ['guarantee', 'v.', '保证'],
      ['handle', 'v.', '处理'], ['highlight', 'v.', '突出'], ['identify', 'v.', '识别'], ['ignore', 'v.', '忽略'],
      ['illustrate', 'v.', '说明'], ['implement', 'v.', '实施'], ['imply', 'v.', '暗示'], ['impose', 'v.', '强加'],
      ['incorporate', 'v.', '纳入'], ['indicate', 'v.', '表明'], ['induce', 'v.', '诱导'], ['influence', 'v.', '影响'],
      ['inform', 'v.', '通知'], ['initiate', 'v.', '发起'], ['innovate', 'v.', '创新'], ['inspire', 'v.', '激励'],
      ['install', 'v.', '安装'], ['integrate', 'v.', '整合'], ['interpret', 'v.', '解释'], ['intervene', 'v.', '干预'],
      ['introduce', 'v.', '介绍'], ['investigate', 'v.', '调查'], ['involve', 'v.', '涉及'], ['isolate', 'v.', '隔离'],
      ['justify', 'v.', '证明…正当'], ['launch', 'v.', '发起'], ['maintain', 'v.', '维持'], ['manage', 'v.', '管理'],
      ['manipulate', 'v.', '操纵'], ['measure', 'v.', '测量'], ['modify', 'v.', '修改'], ['monitor', 'v.', '监控'],
      ['motivate', 'v.', '激励'], ['negotiate', 'v.', '谈判'], ['observe', 'v.', '观察'], ['obtain', 'v.', '获得'],
      ['occupy', 'v.', '占据'], ['operate', 'v.', '操作'], ['organize', 'v.', '组织'], ['overcome', 'v.', '克服'],
      ['participate', 'v.', '参与'], ['perceive', 'v.', '感知'], ['perform', 'v.', '执行/表演'], ['persist', 'v.', '坚持'],
      ['persuade', 'v.', '说服'], ['predict', 'v.', '预测'], ['preserve', 'v.', '保存'], ['prevent', 'v.', '防止'],
      ['proceed', 'v.', '继续'], ['produce', 'v.', '生产'], ['promote', 'v.', '促进'], ['propose', 'v.', '提议'],
      ['protect', 'v.', '保护'], ['provide', 'v.', '提供'], ['publish', 'v.', '出版'], ['pursue', 'v.', '追求'],
      ['qualify', 'v.', '使合格'], ['react', 'v.', '反应'], ['recognize', 'v.', '认出'], ['recommend', 'v.', '推荐'],
      ['recover', 'v.', '恢复'], ['reduce', 'v.', '减少'], ['reflect', 'v.', '反映'], ['regulate', 'v.', '调节'],
      ['reject', 'v.', '拒绝'], ['relate', 'v.', '关联'], ['release', 'v.', '释放'], ['rely', 'v.', '依赖'],
      ['remain', 'v.', '保持'], ['remove', 'v.', '移除'], ['replace', 'v.', '替换'], ['represent', 'v.', '代表'],
      ['require', 'v.', '需要'], ['resolve', 'v.', '解决'], ['respond', 'v.', '回应'], ['restore', 'v.', '恢复'],
      ['restrict', 'v.', '限制'], ['retain', 'v.', '保留'], ['reveal', 'v.', '揭示'], ['review', 'v.', '审查'],
      ['revise', 'v.', '修订'], ['satisfy', 'v.', '满足'], ['secure', 'v.', '确保'], ['seek', 'v.', '寻求'],
      ['select', 'v.', '选择'], ['separate', 'v.', '分离'], ['settle', 'v.', '解决/定居'], ['signify', 'v.', '表示'],
      ['simulate', 'v.', '模拟'], ['specify', 'v.', '指定'], ['stimulate', 'v.', '刺激'], ['strengthen', 'v.', '加强'],
      ['submit', 'v.', '提交'], ['substitute', 'v.', '替代'], ['succeed', 'v.', '成功'], ['suggest', 'v.', '建议'],
      ['summarize', 'v.', '总结'], ['supplement', 'v.', '补充'], ['supply', 'v.', '供应'], ['support', 'v.', '支持'],
      ['survive', 'v.', '生存'], ['sustain', 'v.', '维持'], ['transform', 'v.', '转变'], ['transmit', 'v.', '传输'],
      ['undertake', 'v.', '承担'], ['utilize', 'v.', '利用'], ['validate', 'v.', '验证'], ['vary', 'v.', '变化'],
      ['verify', 'v.', '核实'], ['withdraw', 'v.', '撤回'], ['witness', 'v.', '见证'], ['yield', 'v.', '产生/让步'],
    ],
  },
  {
    band: 4,
    label: '高级（C1）',
    cefr: 'C1',
    words: [
      ['abundant', 'adj.', '丰富的'], ['ambiguous', 'adj.', '模糊的'], ['arbitrary', 'adj.', '任意的'], ['authentic', 'adj.', '真实的'],
      ['autonomous', 'adj.', '自主的'], ['benevolent', 'adj.', '仁慈的'], ['coherent', 'adj.', '连贯的'], ['compelling', 'adj.', '令人信服的'],
      ['comprehensive', 'adj.', '全面的'], ['conspicuous', 'adj.', '显眼的'], ['controversial', 'adj.', '有争议的'], ['cumulative', 'adj.', '累积的'],
      ['daunting', 'adj.', '令人望而生畏的'], ['deliberate', 'adj.', '故意的'], ['detrimental', 'adj.', '有害的'], ['diligent', 'adj.', '勤奋的'],
      ['discreet', 'adj.', '谨慎的'], ['disparate', 'adj.', '不同的'], ['diverse', 'adj.', '多样的'], ['dominant', 'adj.', '主导的'],
      ['elaborate', 'adj.', '详尽的'], ['elusive', 'adj.', '难以捉摸的'], ['empirical', 'adj.', '实证的'], ['enigmatic', 'adj.', '神秘的'],
      ['ephemeral', 'adj.', '短暂的'], ['equitable', 'adj.', '公平的'], ['exemplary', 'adj.', '模范的'], ['explicit', 'adj.', '明确的'],
      ['formidable', 'adj.', '强大的'], ['fragile', 'adj.', '脆弱的'], ['fundamental', 'adj.', '基本的'], ['gratuitous', 'adj.', '无端的'],
      ['hierarchical', 'adj.', '等级的'], ['hypothetical', 'adj.', '假设的'], ['implicit', 'adj.', '隐含的'], ['inadequate', 'adj.', '不充分的'],
      ['inclusive', 'adj.', '包容的'], ['incompatible', 'adj.', '不兼容的'], ['inconsistent', 'adj.', '不一致的'], ['indigenous', 'adj.', '本土的'],
      ['indispensable', 'adj.', '不可或缺的'], ['inevitable', 'adj.', '不可避免的'], ['influential', 'adj.', '有影响力的'], ['inherent', 'adj.', '固有的'],
      ['innovative', 'adj.', '创新的'], ['insightful', 'adj.', '有洞察力的'], ['intangible', 'adj.', '无形的'], ['intuitive', 'adj.', '直觉的'],
      ['intricate', 'adj.', '复杂的'], ['intrinsic', 'adj.', '内在的'], ['irrelevant', 'adj.', '无关的'], ['legitimate', 'adj.', '合法的'],
      ['lucrative', 'adj.', '有利可图的'], ['meticulous', 'adj.', '一丝不苟的'], ['notorious', 'adj.', '臭名昭著的'], ['obsolete', 'adj.', '过时的'],
      ['paradoxical', 'adj.', '矛盾的'], ['pervasive', 'adj.', '普遍的'], ['plausible', 'adj.', ' plausible的/合理的'], ['precarious', 'adj.', '不稳定的'],
      ['predominant', 'adj.', '占主导的'], ['preliminary', 'adj.', '初步的'], ['profound', 'adj.', '深刻的'], ['prudent', 'adj.', '谨慎的'],
      ['radical', 'adj.', '激进的'], ['redundant', 'adj.', '冗余的'], ['reluctant', 'adj.', '不情愿的'], ['resilient', 'adj.', '有韧性的'],
      ['rigid', 'adj.', '僵硬的'], ['rigorous', 'adj.', '严格的'], ['robust', 'adj.', '强健的'], ['scarce', 'adj.', '稀缺的'],
      ['skeptical', 'adj.', '怀疑的'], ['sovereign', 'adj.', '主权的'], ['spontaneous', 'adj.', '自发的'], ['substantial', 'adj.', '大量的'],
      ['subtle', 'adj.', '微妙的'], ['superficial', 'adj.', '表面的'], ['sustainable', 'adj.', '可持续的'], ['tentative', 'adj.', '试探性的'],
      ['transparent', 'adj.', '透明的'], ['trivial', 'adj.', '琐碎的'], ['unanimous', 'adj.', '一致的'], ['underlying', 'adj.', '潜在的'],
      ['unprecedented', 'adj.', '前所未有的'], ['versatile', 'adj.', '多才多艺的'], ['viable', 'adj.', '可行的'], ['vivid', 'adj.', '生动的'],
      ['volatile', 'adj.', '不稳定的'], ['vulnerable', 'adj.', '脆弱的'], ['wholesale', 'adj.', '批发的'], ['widespread', 'adj.', '广泛的'],
      ['aberration', 'n.', '异常'], ['acquiescence', 'n.', '默许'], ['adversity', 'n.', '逆境'], ['ambivalence', 'n.', '矛盾心理'],
      ['anomaly', 'n.', '异常'], ['antithesis', 'n.', '对立'], ['apathy', 'n.', '冷漠'], ['arbitration', 'n.', '仲裁'],
      ['autonomy', 'n.', '自治'], ['bureaucracy', 'n.', '官僚'], ['catalyst', 'n.', '催化剂'], ['cohesion', 'n.', '凝聚力'],
      ['collaboration', 'n.', '合作'], ['compromise', 'n.', '妥协'], ['consensus', 'n.', '共识'], ['constraint', 'n.', '约束'],
      ['contemplation', 'n.', '沉思'], ['contradiction', 'n.', '矛盾'], ['convergence', 'n.', '汇聚'], ['correlation', 'n.', '相关性'],
      ['credibility', 'n.', '可信度'], ['criterion', 'n.', '标准'], ['curriculum', 'n.', '课程'], ['dichotomy', 'n.', '二分法'],
      ['dilemma', 'n.', '困境'], ['discretion', 'n.', '谨慎'], ['disparity', 'n.', '差异'], ['doctrine', 'n.', '学说'],
      ['empathy', 'n.', '共情'], ['entropy', 'n.', '熵/混乱'], ['equilibrium', 'n.', '平衡'], ['expertise', 'n.', '专业知识'],
      ['fallacy', 'n.', '谬误'], ['feasibility', 'n.', '可行性'], ['fluctuation', 'n.', '波动'], ['hypothesis', 'n.', '假设'],
      ['ideology', 'n.', '意识形态'], ['implication', 'n.', '含义'], ['incentive', 'n.', '激励'], ['integrity', 'n.', '正直/完整'],
      ['intervention', 'n.', '干预'], ['jurisdiction', 'n.', '管辖权'], ['legislation', 'n.', '立法'], ['liability', 'n.', '责任/负债'],
      ['methodology', 'n.', '方法论'], ['misconception', 'n.', '误解'], ['nuance', 'n.', '细微差别'], ['paradigm', 'n.', '范式'],
      ['paradox', 'n.', '悖论'], ['perception', 'n.', '感知'], ['perspective', 'n.', '视角'], ['phenomenon', 'n.', '现象'],
      ['precedent', 'n.', '先例'], ['predicament', 'n.', '困境'], ['premise', 'n.', '前提'], ['prevalence', 'n.', '流行'],
      ['propensity', 'n.', '倾向'], ['proposition', 'n.', '命题'], ['prosperity', 'n.', '繁荣'], ['rationale', 'n.', '理由'],
      ['reconciliation', 'n.', '和解'], ['redundancy', 'n.', '冗余'], ['relevance', 'n.', '相关性'], ['repercussion', 'n.', '后果'],
      ['resilience', 'n.', '韧性'], ['rhetoric', 'n.', '修辞'], ['scrutiny', 'n.', '审查'], ['skepticism', 'n.', '怀疑主义'],
      ['solidarity', 'n.', '团结'], ['speculation', 'n.', '推测'], ['stigma', 'n.', '污名'], ['subtlety', 'n.', '微妙'],
      ['surveillance', 'n.', '监视'], ['synthesis', 'n.', '综合'], ['tenacity', 'n.', '韧性'], ['threshold', 'n.', '阈值'],
      ['transparency', 'n.', '透明'], ['turmoil', 'n.', '动荡'], ['unanimity', 'n.', '一致'], ['validity', 'n.', '有效性'],
      ['versatility', 'n.', '多功能性'], ['viability', 'n.', '可行性'], ['vulnerability', 'n.', '脆弱性'], ['whimsy', 'n.', '奇想'],
    ],
  },
  {
    band: 5,
    label: '精通（C2）',
    cefr: 'C2',
    words: [
      ['aberration', 'n.', '反常'], ['abstain', 'v.', '弃权/戒'], ['acquiesce', 'v.', '默许'], ['acrimony', 'n.', '尖刻'],
      ['admonish', 'v.', '告诫'], ['adroit', 'adj.', '机敏的'], ['alacrity', 'n.', '乐意'], ['ameliorate', 'v.', '改善'],
      ['anachronism', 'n.', '时代错误'], ['antithesis', 'n.', '对立'], ['apathy', 'n.', '冷漠'], ['archetype', 'n.', '原型'],
      ['arduous', 'adj.', '艰巨的'], ['assiduous', 'adj.', '刻苦的'], ['astute', 'adj.', '精明的'], ['audacious', 'adj.', '大胆的'],
      ['austere', 'adj.', '严峻的'], ['avarice', 'n.', '贪婪'], ['axiomatic', 'adj.', '不言而喻的'], ['banal', 'adj.', '平庸的'],
      ['bellicose', 'adj.', '好战的'], ['benevolent', 'adj.', '仁慈的'], ['berate', 'v.', '严厉责备'], ['brevity', 'n.', '简洁'],
      ['cacophony', 'n.', '刺耳声'], ['capricious', 'adj.', '反复无常的'], ['catalyst', 'n.', '催化剂'], ['caustic', 'adj.', '刻薄的'],
      ['censure', 'v.', '谴责'], ['chicanery', 'n.', '诡计'], ['circuitous', 'adj.', '迂回的'], ['circumspect', 'adj.', '慎重的'],
      ['coalesce', 'v.', '合并'], ['cogent', 'adj.', '有说服力的'], ['commensurate', 'adj.', '相称的'], ['compunction', 'n.', '内疚'],
      ['conflagration', 'n.', '大火'], ['connoisseur', 'n.', '鉴赏家'], ['conundrum', 'n.', '难题'], ['copious', 'adj.', '大量的'],
      ['corroborate', 'v.', '证实'], ['credulous', 'adj.', '轻信的'], ['culpable', 'adj.', '有罪的'], ['cursory', 'adj.', '草率的'],
      ['dearth', 'n.', '缺乏'], ['debacle', 'n.', '惨败'], ['decorous', 'adj.', '得体的'], ['deleterious', 'adj.', '有害的'],
      ['demagogue', 'n.', '煽动者'], ['demur', 'v.', '反对'], ['denigrate', 'v.', '诋毁'], ['deride', 'v.', '嘲笑'],
      ['despondent', 'adj.', '沮丧的'], ['diatribe', 'n.', '谩骂'], ['dichotomy', 'n.', '二分法'], ['diffident', 'adj.', '缺乏自信的'],
      ['dilatory', 'adj.', '拖延的'], ['disparate', 'adj.', '迥异的'], ['disseminate', 'v.', '传播'], ['dogmatic', 'adj.', '教条的'],
      ['ebullient', 'adj.', '热情洋溢的'], ['eclectic', 'adj.', '兼收并蓄的'], ['efficacious', 'adj.', '有效的'], ['effrontery', 'n.', '厚颜无耻'],
      ['egregious', 'adj.', '极坏的'], ['elucidate', 'v.', '阐明'], ['emollient', 'adj.', '缓和的'], ['enervate', 'v.', '使衰弱'],
      ['engender', 'v.', '引起'], ['enigma', 'n.', '谜'], ['ephemeral', 'adj.', '短暂的'], ['equanimity', 'n.', '镇定'],
      ['equivocate', 'v.', '含糊其辞'], ['erudite', 'adj.', '博学的'], ['esoteric', 'adj.', '深奥的'], ['euphemism', 'n.', '委婉语'],
      ['exacerbate', 'v.', '加剧'], ['exculpate', 'v.', '开脱罪责'], ['exigent', 'adj.', '紧急的'], ['exonerate', 'v.', '免除罪责'],
      ['expedient', 'adj.', '权宜的'], ['expiate', 'v.', '赎罪'], ['expunge', 'v.', '抹去'], ['extol', 'v.', '赞美'],
      ['facetious', 'adj.', '滑稽的'], ['fallacious', 'adj.', '谬误的'], ['fastidious', 'adj.', '挑剔的'], ['fatuous', 'adj.', '愚蠢的'],
      ['feckless', 'adj.', '无能的'], ['fecund', 'adj.', '多产的'], ['ferment', 'n.', '发酵/动荡'], ['fervent', 'adj.', '热烈的'],
      ['flagrant', 'adj.', '公然的'], ['florid', 'adj.', '绚丽的'], ['fortuitous', 'adj.', '偶然的'], ['fractious', 'adj.', '易怒的'],
      ['garrulous', 'adj.', '喋喋不休的'], ['grandiloquent', 'adj.', '夸张的'], ['gratuitous', 'adj.', '无端的'], ['gregarious', 'adj.', '合群的'],
      ['hackneyed', 'adj.', '陈腐的'], ['harangue', 'n.', '长篇抨击'], ['hegemony', 'n.', '霸权'], ['hubris', 'n.', '傲慢'],
      ['iconoclast', 'n.', '反传统者'], ['idiosyncrasy', 'n.', '特质'], ['ignominious', 'adj.', '可耻的'], ['impecunious', 'adj.', '贫穷的'],
      ['impetuous', 'adj.', '冲动的'], ['implacable', 'adj.', '毫不宽容的'], ['inchoate', 'adj.', '初期的'], ['incongruous', 'adj.', '不协调的'],
      ['incorrigible', 'adj.', '无可救药的'], ['indolent', 'adj.', '懒惰的'], ['ineffable', 'adj.', '难以言喻的'], ['inexorable', 'adj.', '无情的'],
      ['ingenuous', 'adj.', '天真的'], ['inimical', 'adj.', '有害的'], ['insidious', 'adj.', '阴险的'], ['insouciant', 'adj.', '漫不经心的'],
      ['intransigent', 'adj.', '不妥协的'], ['invective', 'n.', '谩骂'], ['inveterate', 'adj.', '根深蒂固的'], ['irascible', 'adj.', '易怒的'],
      ['jocular', 'adj.', '诙谐的'], ['judicious', 'adj.', '明智的'], ['laconic', 'adj.', '简洁的'], ['languid', 'adj.', '倦怠的'],
      ['latent', 'adj.', '潜在的'], ['laudable', 'adj.', '值得称赞的'], ['litigious', 'adj.', '好诉讼的'], ['loquacious', 'adj.', '健谈的'],
      ['lugubrious', 'adj.', '悲哀的'], ['magnanimous', 'adj.', '宽宏大量的'], ['malleable', 'adj.', '可塑的'], ['maudlin', 'adj.', '伤感的'],
      ['mendacious', 'adj.', '虚假的'], ['mercurial', 'adj.', '善变的'], ['meticulous', 'adj.', '一丝不苟的'], ['misanthrope', 'n.', '厌世者'],
      ['mitigate', 'v.', '减轻'], ['mollify', 'v.', '安抚'], ['morose', 'adj.', '阴郁的'], ['munificent', 'adj.', '慷慨的'],
      ['nefarious', 'adj.', '邪恶的'], ['neophyte', 'n.', '新手'], ['noisome', 'adj.', '恶臭的'], ['nonchalant', 'adj.', '冷淡的'],
      ['obdurate', 'adj.', '顽固的'], ['obfuscate', 'v.', '使模糊'], ['obsequious', 'adj.', '谄媚的'], ['obstreperous', 'adj.', '吵闹的'],
      ['officious', 'adj.', '爱管闲事的'], ['onerous', 'adj.', '繁重的'], ['opprobrium', 'n.', '耻辱'], ['ostensible', 'adj.', '表面的'],
      ['ostentatious', 'adj.', '炫耀的'], ['palpable', 'adj.', '明显的'], ['panacea', 'n.', '万灵药'], ['paragon', 'n.', '典范'],
      ['parsimonious', 'adj.', '吝啬的'], ['pedantic', 'adj.', '学究气的'], ['penchant', 'n.', '嗜好'], ['penurious', 'adj.', '极度贫穷的'],
      ['perfunctory', 'adj.', '敷衍的'], ['pernicious', 'adj.', '有害的'], ['perspicacious', 'adj.', '敏锐的'], ['pertinacious', 'adj.', '固执的'],
      ['petulant', 'adj.', '任性的'], ['phlegmatic', 'adj.', '冷静的'], ['platitude', 'n.', '陈词滥调'], ['precarious', 'adj.', '不稳定的'],
      ['precipitate', 'v.', '促成/仓促'], ['precocious', 'adj.', '早熟的'], ['predilection', 'n.', '偏爱'], ['prescient', 'adj.', '有先见之明的'],
      ['presumptuous', 'adj.', '冒昧的'], ['proclivity', 'n.', '倾向'], ['prodigal', 'adj.', '挥霍的'], ['profligate', 'adj.', '放荡的'],
      ['prolific', 'adj.', '多产的'], ['propitious', 'adj.', '吉利的'], ['prudent', 'adj.', '谨慎的'], ['pugnacious', 'adj.', '好斗的'],
      ['punctilious', 'adj.', '一丝不苟的'], ['quixotic', 'adj.', '不切实际的'], ['recalcitrant', 'adj.', '顽抗的'], ['recondite', 'adj.', '深奥的'],
      ['redoubtable', 'adj.', '令人敬畏的'], ['reprobate', 'n.', '堕落者'], ['rescind', 'v.', '废除'], ['restive', 'adj.', '焦躁的'],
      ['reticent', 'adj.', '沉默寡言的'], ['sagacious', 'adj.', '睿智的'], ['salubrious', 'adj.', '有益健康的'], ['sanctimonious', 'adj.', '伪善的'],
      ['sanguine', 'adj.', '乐观的'], ['scrupulous', 'adj.', '审慎的'], ['sedulous', 'adj.', '勤勉的'], ['spurious', 'adj.', '虚假的'],
      ['stolid', 'adj.', '迟钝的'], ['strident', 'adj.', '刺耳的'], ['stupefy', 'v.', '使惊呆'], ['subjugate', 'v.', '征服'],
      ['surreptitious', 'adj.', '秘密的'], ['sycophant', 'n.', '马屁精'], ['taciturn', 'adj.', '沉默寡言的'], ['tantamount', 'adj.', '等同于'],
      ['temerity', 'n.', '鲁莽'], ['tenuous', 'adj.', '薄弱的'], ['torpid', 'adj.', '迟钝的'], ['tractable', 'adj.', '温顺的'],
      ['transient', 'adj.', '短暂的'], ['truculent', 'adj.', '好斗的'], ['turbid', 'adj.', '浑浊的'], ['turpitude', 'n.', '卑鄙'],
      ['umbrage', 'n.', '不快'], ['unctuous', 'adj.', '油腔滑调的'], ['undulate', 'v.', '波动'], ['untenable', 'adj.', '站不住脚的'],
      ['vacillate', 'v.', '动摇'], ['vacuous', 'adj.', '空洞的'], ['venerate', 'v.', '尊敬'], ['veracity', 'n.', '真实性'],
      ['verbose', 'adj.', '冗长的'], ['vex', 'v.', '使烦恼'], ['vicarious', 'adj.', '间接感受的'], ['vicissitude', 'n.', '变迁'],
      ['vindicate', 'v.', '证明清白'], ['virulent', 'adj.', '剧毒的'], ['vituperate', 'v.', '谩骂'], ['voluble', 'adj.', '健谈的'],
      ['voracious', 'adj.', '贪婪的'], ['wary', 'adj.', '谨慎的'], ['wheedle', 'v.', '哄骗'], ['winsome', 'adj.', '迷人的'],
      ['zealous', 'adj.', '热心的'], ['zenith', 'n.', '顶点'],
    ],
  },
];

// 新概念教材词表 → 按册映射到 band（与 BANDS 合并，全局去重）
const NCE_BOOK_BAND = { 1: 1, 2: 2 };

function mergeNceWords(bands) {
  const byBand = new Map(bands.map((b) => [b.band, { ...b, words: [...b.words] }]));
  for (const e of buildDict()) {
    const band = NCE_BOOK_BAND[Number(e.book)] ?? 1;
    const row = byBand.get(band);
    if (!row) continue;
    row.words.push([e.word, e.pos || '', e.cn || '']);
  }
  return [...byBand.values()];
}

function mergeSupplement(bands) {
  const byBand = new Map(bands.map((b) => [b.band, { ...b, words: [...b.words] }]));
  for (const [bandKey, words] of Object.entries(SUPPLEMENT.byBand || {})) {
    const band = Number(bandKey);
    const row = byBand.get(band);
    if (!row || !Array.isArray(words)) continue;
    row.words.push(...words);
  }
  return [...byBand.values()];
}

function dedupeBands(bands) {
  const seen = new Set();
  return bands.map((b) => {
    const words = [];
    for (const row of b.words) {
      const [word, pos, cn] = row;
      const key = String(word).trim().toLowerCase();
      if (!key || !cn || seen.has(key)) continue;
      seen.add(key);
      words.push({ word: String(word).trim(), pos: pos || '', cn: String(cn).trim() });
    }
    return { band: b.band, label: b.label, cefr: b.cefr, words };
  });
}

function main() {
  const bands = dedupeBands(mergeSupplement(mergeNceWords(BANDS)));
  const total = bands.reduce((n, b) => n + b.words.length, 0);
  const out = {
    version: 1,
    description: '通用英语词汇量估算词库，按词频/CEFR 分 6 段（A1–C2）。运行 node scripts/build-global-vocab.js 可重新生成。',
    generatedAt: new Date().toISOString(),
    total,
    bands,
  };
  const dest = path.join(__dirname, '..', 'data', 'global-vocab.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(`已写入 ${dest}：${total} 词，${bands.length} 段`);
  bands.forEach((b) => console.log(`  Band ${b.band} (${b.label}): ${b.words.length} 词`));
}

if (require.main === module) main();
module.exports = { BANDS, dedupeBands };
