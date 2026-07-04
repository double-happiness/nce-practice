'use strict';
// 生成第一册同义词 / 相关词 / 拼写变体词库
// 用法：node scripts/build-lexicon-b1.js

const path = require('path');
const data = require('../lib/data');
const { normKey } = require('../lib/dict');
const { writeJSONAtomic } = require('../lib/store');

const B1_KEYS = new Set();
for (const l of data.getLessons()) {
  if (l.book !== 1) continue;
  for (const w of l.words || []) {
    const k = normKey(w.word);
    if (k && !k.includes(' ')) B1_KEYS.add(k);
  }
}

/** @type {Record<string, {synonyms?: Array<string|{w:string,note?:string,cn?:string}>, related?: string[], variants?: Array<string|{form:string,note?:string}>}>} */
const B1_LEX = {
  // —— L1–4 礼貌 / 物品 ——
  excuse: { synonyms: [{ w: 'pardon', note: '请再说一遍' }, { w: 'sorry', note: '道歉' }], related: ['excuse me'] },
  pardon: { synonyms: [{ w: 'excuse', note: '打扰/原谅' }], related: ['pardon?'] },
  sorry: { synonyms: [{ w: 'excuse', note: '道歉时用' }], related: ['excuse me'] },
  please: { related: ['thank you', 'thanks'] },
  thanks: { synonyms: [{ w: 'thank you' }] },
  handbag: { synonyms: [{ w: 'bag' }] },
  bag: { synonyms: [{ w: 'handbag', note: '女用手提包' }, { w: 'suitcase', note: '旅行箱' }] },
  suitcase: { synonyms: [{ w: 'bag' }], related: ['pack'] },
  pen: { synonyms: [{ w: 'pencil', note: '铅笔' }] },
  pencil: { synonyms: [{ w: 'pen', note: '钢笔' }] },
  watch: { synonyms: [{ w: 'clock', note: '钟' }], related: ['what time is it'] },
  coat: { synonyms: [{ w: 'jacket', note: '夹克' }], related: ['dress', 'skirt'] },
  dress: { synonyms: [{ w: 'skirt', note: '裙子' }, { w: 'blouse', note: '女衬衫' }] },
  skirt: { synonyms: [{ w: 'dress' }] },
  blouse: { synonyms: [{ w: 'shirt', note: '衬衣' }] },
  shirt: { synonyms: [{ w: 'blouse' }] },
  tie: { related: ['suit', 'shirt'] },
  suit: { synonyms: [{ w: 'dress', note: '套装/连衣裙' }], related: ['tie'] },
  colour: { variants: [{ form: 'color', note: '美式拼写' }] },
  color: { variants: [{ form: 'colour', note: '英式拼写' }] },
  green: { related: ['black', 'blue', 'white', 'yellow', 'red', 'brown'] },

  // —— L5–10 人物 / 国籍 ——
  man: { synonyms: [{ w: 'boy', note: '男孩' }, { w: 'person' }] },
  woman: { synonyms: [{ w: 'girl', note: '女孩' }, { w: 'person' }, { w: 'lady', note: '女士' }] },
  boy: { synonyms: [{ w: 'man' }, { w: 'son', note: '儿子' }] },
  girl: { synonyms: [{ w: 'woman' }, { w: 'daughter', note: '女儿' }] },
  person: { synonyms: [{ w: 'people', note: '复数' }] },
  people: { synonyms: [{ w: 'person', note: '单数' }] },
  student: { synonyms: [{ w: 'pupil', note: '小学生' }] },
  teacher: { related: ['school', 'homework', 'exam'] },
  nurse: { synonyms: [{ w: 'doctor', note: '医生' }] },
  doctor: { synonyms: [{ w: 'nurse' }, { w: 'dentist', note: '牙医' }] },
  mechanic: { synonyms: [{ w: 'engineer', note: '工程师' }] },
  engineer: { synonyms: [{ w: 'mechanic' }] },
  policeman: { synonyms: [{ w: 'policewoman', note: '女警' }, { w: 'police' }] },
  policewoman: { synonyms: [{ w: 'policeman' }] },
  postman: { synonyms: [{ w: 'milkman', note: '送奶工' }] },
  housewife: { synonyms: [{ w: 'housework', note: '家务' }] },

  // —— L11–16 大小 / 状态 ——
  big: { synonyms: [{ w: 'large' }, { w: 'huge', note: '更大' }] },
  large: { synonyms: [{ w: 'big' }] },
  small: { synonyms: [{ w: 'little' }, { w: 'tiny', note: '更小' }] },
  little: { synonyms: [{ w: 'small' }] },
  tall: { synonyms: [{ w: 'high', note: '高的' }] },
  high: { synonyms: [{ w: 'tall', note: '人的身高' }, { w: 'low', note: '反义' }] },
  short: { synonyms: [{ w: 'low', note: '矮的' }] },
  low: { synonyms: [{ w: 'short' }, { w: 'high', note: '反义' }] },
  fat: { synonyms: [{ w: 'heavy', note: '重的' }, { w: 'thin', note: '反义' }] },
  thin: { synonyms: [{ w: 'slim', note: '苗条的' }, { w: 'fat', note: '反义' }] },
  old: { synonyms: [{ w: 'young', note: '反义' }, { w: 'ancient', note: '古老' }] },
  young: { synonyms: [{ w: 'old', note: '反义' }] },
  new: { synonyms: [{ w: 'old', note: '反义' }, { w: 'latest', note: '最新的' }] },
  clean: { synonyms: [{ w: 'tidy', note: '整齐的' }, { w: 'dirty', note: '反义' }] },
  dirty: { synonyms: [{ w: 'untidy', note: '不整齐' }, { w: 'clean', note: '反义' }] },
  tidy: { synonyms: [{ w: 'clean' }, { w: 'untidy', note: '反义' }] },
  untidy: { synonyms: [{ w: 'tidy', note: '反义' }, { w: 'dirty' }] },
  hot: { synonyms: [{ w: 'warm', note: '温暖' }, { w: 'cold', note: '反义' }] },
  cold: { synonyms: [{ w: 'cool', note: '凉爽' }, { w: 'hot', note: '反义' }] },
  warm: { synonyms: [{ w: 'hot' }, { w: 'cold', note: '反义' }] },
  busy: { synonyms: [{ w: 'hard-working', note: '勤奋的' }, { w: 'lazy', note: '反义' }] },
  lazy: { synonyms: [{ w: 'busy', note: '反义' }] },

  // —— L17–22 数字 / 指示 ——
  this: { synonyms: [{ w: 'that', note: '远指' }, { w: 'these', note: '这些' }] },
  that: { synonyms: [{ w: 'this', note: '近指' }, { w: 'those', note: '那些' }] },
  these: { synonyms: [{ w: 'those', note: '远指' }, { w: 'this', note: '单数' }] },
  those: { synonyms: [{ w: 'these', note: '近指' }, { w: 'that', note: '单数' }] },
  which: { related: ['what', 'who', 'whose'] },
  what: { related: ['which', 'who', 'where', 'why', 'how'] },
  who: { related: ['whose', 'which'] },
  whose: { related: ['who', 'my', 'your', 'his', 'her'] },

  // —— L23–30 物品 / 量词 ——
  glass: { synonyms: [{ w: 'cup', note: '杯子' }, { w: 'bottle', note: '瓶子' }] },
  cup: { synonyms: [{ w: 'glass' }] },
  bottle: { synonyms: [{ w: 'glass' }, { w: 'tin', note: '罐头' }] },
  box: { synonyms: [{ w: 'case', note: '箱子' }, { w: 'basket', note: '篮子' }] },
  basket: { synonyms: [{ w: 'box' }] },
  case: { synonyms: [{ w: 'box' }, { w: 'suitcase' }] },
  tin: { synonyms: [{ w: 'can', note: '罐头' }] },
  knife: { related: ['fork', 'spoon'] },
  fork: { related: ['knife', 'spoon'] },
  spoon: { related: ['knife', 'fork'] },
  on: { synonyms: [{ w: 'over', note: '在…上方' }], related: ['under', 'behind', 'beside'] },
  under: { synonyms: [{ w: 'below', note: '在…下面' }], related: ['on', 'over'] },
  behind: { related: ['beside', 'between', 'in front of'] },
  beside: { related: ['behind', 'between', 'near'] },
  between: { related: ['among', 'beside'] },
  near: { synonyms: [{ w: 'beside', note: '在旁边' }] },
  in: { related: ['into', 'out of', 'on'] },
  into: { related: ['in', 'out of'] },

  // —— L31–40 家庭 / 身体 ——
  father: { synonyms: [{ w: 'dad', note: '口语' }, { w: 'parent', note: '父母' }] },
  mother: { synonyms: [{ w: 'mum', note: '口语' }, { w: 'parent' }] },
  dad: { synonyms: [{ w: 'father' }] },
  mum: { synonyms: [{ w: 'mother' }] },
  son: { synonyms: [{ w: 'boy' }, { w: 'daughter', note: '女儿' }] },
  daughter: { synonyms: [{ w: 'girl' }, { w: 'son' }] },
  brother: { synonyms: [{ w: 'sister', note: '姐妹' }] },
  sister: { synonyms: [{ w: 'brother' }] },
  grandfather: { synonyms: [{ w: 'grandmother', note: '祖母' }] },
  grandmother: { synonyms: [{ w: 'grandfather' }] },
  husband: { synonyms: [{ w: 'wife', note: '妻子' }] },
  wife: { synonyms: [{ w: 'husband' }] },
  family: { related: ['father', 'mother', 'son', 'daughter'] },
  headache: { synonyms: [{ w: 'earache', note: '耳痛' }, { w: 'toothache', note: '牙痛' }] },
  toothache: { synonyms: [{ w: 'headache' }] },
  earache: { synonyms: [{ w: 'headache' }] },
  ill: { synonyms: [{ w: 'sick', note: '生病的' }, { w: 'well', note: '反义' }] },
  well: { synonyms: [{ w: 'fine', note: '很好' }, { w: 'ill', note: '反义' }] },
  fine: { synonyms: [{ w: 'well' }, { w: 'nice' }, { w: 'good' }] },
  tired: { synonyms: [{ w: 'sleepy', note: '想睡的' }, { w: 'thirsty', note: '渴的' }] },
  thirsty: { synonyms: [{ w: 'hungry', note: '饿的' }, { w: 'tired' }] },
  hungry: { synonyms: [{ w: 'thirsty' }] },

  // —— L41–50 天气 / 地点 ——
  sunny: { related: ['cloudy', 'windy', 'rainy', 'snow'] },
  windy: { related: ['sunny', 'rain'] },
  rain: { synonyms: [{ w: 'snow', note: '下雪' }], related: ['wet', 'umbrella'] },
  snow: { synonyms: [{ w: 'rain' }] },
  wet: { synonyms: [{ w: 'dry', note: '干的' }] },
  dry: { synonyms: [{ w: 'wet', note: '反义' }] },
  weather: { related: ['sunny', 'rain', 'cold', 'hot'] },
  village: { synonyms: [{ w: 'town', note: '城镇' }, { w: 'city', note: '城市' }] },
  town: { synonyms: [{ w: 'village' }, { w: 'city' }] },
  city: { synonyms: [{ w: 'town' }, { w: 'village' }] },
  country: { synonyms: [{ w: 'nation', note: '国家' }, { w: 'countryside', note: '乡下' }] },
  garden: { synonyms: [{ w: 'park', note: '公园' }] },
  park: { synonyms: [{ w: 'garden' }] },
  bridge: { related: ['river', 'road'] },
  river: { related: ['bridge', 'lake'] },
  lake: { synonyms: [{ w: 'river' }, { w: 'pool', note: '水池' }] },
  pool: { synonyms: [{ w: 'lake' }] },

  // —— L51–60 动作 / 日常 ——
  come: { synonyms: [{ w: 'go', note: '反义/相对' }], related: ['arrive'] },
  go: { synonyms: [{ w: 'come' }, { w: 'leave', note: '离开' }] },
  arrive: { synonyms: [{ w: 'reach', note: '到达' }, { w: 'leave', note: '反义' }] },
  leave: { synonyms: [{ w: 'go' }, { w: 'arrive', note: '反义' }] },
  give: { synonyms: [{ w: 'take', note: '反义' }, { w: 'send', note: '寄送' }] },
  take: { synonyms: [{ w: 'bring', note: '带来' }, { w: 'give', note: '反义' }] },
  bring: { synonyms: [{ w: 'take', note: '带走' }] },
  send: { synonyms: [{ w: 'give' }, { w: 'receive', note: '收到' }] },
  receive: { synonyms: [{ w: 'send', note: '反义' }] },
  open: { synonyms: [{ w: 'shut', note: '反义' }] },
  shut: { synonyms: [{ w: 'open', note: '反义' }] },
  turn: { related: ['turn on', 'turn off'] },
  put: { synonyms: [{ w: 'place', note: '放置' }] },
  place: { synonyms: [{ w: 'put' }] },
  lift: { synonyms: [{ w: 'raise', note: '举起' }, { w: 'drop', note: '放下' }] },
  drop: { synonyms: [{ w: 'fall', note: '掉落' }, { w: 'lift', note: '反义' }] },
  fall: { synonyms: [{ w: 'drop' }] },
  run: { synonyms: [{ w: 'walk', note: '走' }, { w: 'jump', note: '跳' }] },
  walk: { synonyms: [{ w: 'run' }] },
  jump: { synonyms: [{ w: 'run' }] },
  swim: { related: ['swimming', 'sea', 'pool'] },
  drive: { synonyms: [{ w: 'ride', note: '骑/乘' }] },
  ride: { synonyms: [{ w: 'drive' }] },
  catch: { synonyms: [{ w: 'throw', note: '扔' }] },
  throw: { synonyms: [{ w: 'catch', note: '反义' }] },
  pull: { synonyms: [{ w: 'push', note: '推' }] },
  push: { synonyms: [{ w: 'pull', note: '反义' }] },

  // —— L61–72 情感 / 评价 / 通讯 ——
  beautiful: { synonyms: [{ w: 'pretty' }, { w: 'lovely' }, { w: 'nice' }] },
  pretty: { synonyms: [{ w: 'beautiful' }, { w: 'lovely' }] },
  lovely: { synonyms: [{ w: 'beautiful' }, { w: 'pretty' }, { w: 'nice' }] },
  nice: { synonyms: [{ w: 'fine' }, { w: 'good' }, { w: 'pleasant' }] },
  good: { synonyms: [{ w: 'fine' }, { w: 'nice' }, { w: 'well' }] },
  bad: { synonyms: [{ w: 'awful' }, { w: 'terrible' }, { w: 'poor', note: '糟糕的' }] },
  awful: { synonyms: [{ w: 'terrible' }, { w: 'bad' }] },
  terrible: { synonyms: [{ w: 'awful' }, { w: 'bad' }] },
  glad: { synonyms: [{ w: 'happy' }, { w: 'pleased', note: '高兴的' }] },
  happy: { synonyms: [{ w: 'glad' }, { w: 'sad', note: '反义' }] },
  sad: { synonyms: [{ w: 'unhappy' }, { w: 'happy', note: '反义' }] },
  afraid: { synonyms: [{ w: 'frightened' }, { w: 'scared' }] },
  excited: { synonyms: [{ w: 'exciting', note: '令人兴奋的' }] },
  exciting: { synonyms: [{ w: 'excited', note: '感到兴奋的' }] },
  clever: { synonyms: [{ w: 'smart' }, { w: 'intelligent' }] },
  smart: { synonyms: [{ w: 'clever' }, { w: 'intelligent' }] },
  intelligent: { synonyms: [{ w: 'clever' }, { w: 'smart' }] },
  stupid: { synonyms: [{ w: 'foolish' }, { w: 'silly' }] },
  difficult: { synonyms: [{ w: 'hard', note: '困难的' }, { w: 'easy', note: '反义' }] },
  easy: { synonyms: [{ w: 'difficult', note: '反义' }, { w: 'simple', note: '简单的' }] },
  hard: { synonyms: [{ w: 'difficult' }, { w: 'soft', note: '软的' }] },
  soft: { synonyms: [{ w: 'hard', note: '反义' }] },
  careful: { synonyms: [{ w: 'carefully', note: '副词' }, { w: 'careless', note: '反义' }] },
  careless: { synonyms: [{ w: 'careful', note: '反义' }] },
  quickly: { synonyms: [{ w: 'fast' }, { w: 'slowly', note: '反义' }] },
  slowly: { synonyms: [{ w: 'quickly', note: '反义' }] },
  always: { synonyms: [{ w: 'often' }, { w: 'never', note: '反义' }] },
  often: { synonyms: [{ w: 'always' }, { w: 'sometimes' }, { w: 'never', note: '反义' }] },
  sometimes: { synonyms: [{ w: 'often' }, { w: 'never' }] },
  never: { synonyms: [{ w: 'always', note: '反义' }, { w: 'often' }] },
  already: { synonyms: [{ w: 'yet', note: '还/仍' }] },
  yet: { synonyms: [{ w: 'already' }] },
  telephone: { synonyms: [{ w: 'phone' }] },
  phone: { synonyms: [{ w: 'telephone' }] },
  speak: { synonyms: [{ w: 'talk' }, { w: 'say' }, { w: 'tell' }] },
  talk: { synonyms: [{ w: 'speak' }] },
  say: { synonyms: [{ w: 'tell' }, { w: 'speak' }] },
  tell: { synonyms: [{ w: 'say' }] },
  ask: { synonyms: [{ w: 'answer', note: '回答' }] },
  answer: { synonyms: [{ w: 'ask', note: '提问' }] },
  read: { synonyms: [{ w: 'write', note: '写' }] },
  write: { synonyms: [{ w: 'read' }] },
  listen: { synonyms: [{ w: 'hear' }] },
  hear: { synonyms: [{ w: 'listen', note: '主动听' }] },
  look: { synonyms: [{ w: 'see' }, { w: 'watch' }] },
  see: { synonyms: [{ w: 'look' }, { w: 'watch' }] },
  watch: { synonyms: [{ w: 'look' }, { w: 'see' }] },
  think: { synonyms: [{ w: 'believe' }, { w: 'guess' }] },
  believe: { synonyms: [{ w: 'think' }] },
  guess: { synonyms: [{ w: 'think' }] },
  know: { synonyms: [{ w: 'understand', note: '明白' }] },
  understand: { synonyms: [{ w: 'know' }] },
  remember: { synonyms: [{ w: 'forget', note: '反义' }] },
  forget: { synonyms: [{ w: 'remember', note: '反义' }] },
  hope: { synonyms: [{ w: 'wish', note: '希望' }, { w: 'expect', note: '期待' }] },
  expect: { synonyms: [{ w: 'hope' }] },
  enjoy: { synonyms: [{ w: 'like' }, { w: 'love', note: '更喜欢' }] },
  like: { synonyms: [{ w: 'love', note: '更喜欢' }, { w: 'enjoy' }, { w: 'hate', note: '反义' }] },
  love: { synonyms: [{ w: 'like' }, { w: 'hate', note: '反义' }] },
  hate: { synonyms: [{ w: 'dislike' }, { w: 'like', note: '反义' }] },
  want: { synonyms: [{ w: 'need' }, { w: 'wish' }] },
  need: { synonyms: [{ w: 'want' }] },
  help: { synonyms: [{ w: 'assist', note: '较正式' }] },
  try: { synonyms: [{ w: 'attempt', note: '尝试' }] },
  win: { synonyms: [{ w: 'lose', note: '反义' }] },
  lose: { synonyms: [{ w: 'win', note: '反义' }, { w: 'find', note: '找到' }] },
  find: { synonyms: [{ w: 'lose', note: '反义' }] },
  buy: { synonyms: [{ w: 'sell', note: '反义' }] },
  sell: { synonyms: [{ w: 'buy', note: '反义' }] },
  borrow: { synonyms: [{ w: 'lend', note: '借出' }] },
  lend: { synonyms: [{ w: 'borrow', note: '借入' }] },
  pay: { synonyms: [{ w: 'spend', note: '花费' }, { w: 'cost', note: '花费' }] },
  spend: { synonyms: [{ w: 'pay' }, { w: 'cost' }] },
  cost: { synonyms: [{ w: 'spend' }, { w: 'pay' }] },
  cheap: { synonyms: [{ w: 'expensive', note: '反义' }, { w: 'dear', note: '贵的' }] },
  expensive: { synonyms: [{ w: 'cheap', note: '反义' }, { w: 'dear' }] },
  dear: { synonyms: [{ w: 'expensive' }, { w: 'cheap', note: '反义' }] },
  rich: { synonyms: [{ w: 'poor', note: '反义' }] },
  poor: { synonyms: [{ w: 'rich', note: '反义' }] },
  job: { synonyms: [{ w: 'work' }] },
  work: { synonyms: [{ w: 'job' }] },
  shop: { synonyms: [{ w: 'store', note: '美式' }, { w: 'market', note: '市场' }] },
  restaurant: { synonyms: [{ w: 'hotel', note: '饭店' }, { w: 'cafe', note: '咖啡馆' }] },
  hotel: { synonyms: [{ w: 'restaurant' }, { w: 'hostel', note: '招待所' }] },
  aeroplane: { synonyms: [{ w: 'plane' }], variants: [{ form: 'airplane', note: '美式' }] },
  plane: { synonyms: [{ w: 'aeroplane' }] },
  car: { synonyms: [{ w: 'train' }] },
  train: { synonyms: [{ w: 'car' }] },
  boat: { synonyms: [{ w: 'ship', note: '轮船' }] },
  ship: { synonyms: [{ w: 'boat' }] },
  travel: { variants: [{ form: 'travelled/traveled', note: '过去式' }, { form: 'travelling/traveling', note: '现在分词' }] },
  trip: { synonyms: [{ w: 'journey', note: '旅程' }, { w: 'travel' }] },
  journey: { synonyms: [{ w: 'trip' }] },
  morning: { synonyms: [{ w: 'afternoon' }, { w: 'evening' }, { w: 'night' }] },
  afternoon: { synonyms: [{ w: 'morning' }, { w: 'evening' }] },
  evening: { synonyms: [{ w: 'morning' }, { w: 'night' }] },
  night: { synonyms: [{ w: 'evening' }, { w: 'morning' }] },
  today: { synonyms: [{ w: 'yesterday', note: '昨天' }] },
  yesterday: { synonyms: [{ w: 'today' }] },
  breakfast: { synonyms: [{ w: 'lunch', note: '午饭' }, { w: 'dinner', note: '晚餐' }] },
  lunch: { synonyms: [{ w: 'breakfast' }, { w: 'dinner' }] },
  dinner: { synonyms: [{ w: 'lunch' }, { w: 'breakfast' }] },
  bread: { synonyms: [{ w: 'cake', note: '蛋糕' }, { w: 'biscuit', note: '饼干' }] },
  meat: { synonyms: [{ w: 'beef', note: '牛肉' }, { w: 'chicken', note: '鸡肉' }] },
  beef: { synonyms: [{ w: 'meat' }] },
  chicken: { synonyms: [{ w: 'meat' }] },
  egg: { related: ['chicken'] },
  milk: { related: ['coffee', 'tea'] },
  coffee: { synonyms: [{ w: 'tea', note: '茶' }] },
  tea: { synonyms: [{ w: 'coffee' }] },
  beer: { synonyms: [{ w: 'wine', note: '果酒' }] },
  wine: { synonyms: [{ w: 'beer' }] },
  cat: { synonyms: [{ w: 'dog', note: '狗' }, { w: 'kitten', note: '小猫' }] },
  dog: { synonyms: [{ w: 'cat' }] },
  kitten: { synonyms: [{ w: 'cat' }] },
  bird: { synonyms: [{ w: 'parrot', note: '鹦鹉' }] },
  parrot: { synonyms: [{ w: 'bird' }] },
  baby: { synonyms: [{ w: 'children', note: '孩子们' }] },
  children: { synonyms: [{ w: 'baby', note: '婴儿' }] },
  friend: { synonyms: [{ w: 'guest', note: '客人' }, { w: 'neighbour', note: '邻居' }] },
  guest: { synonyms: [{ w: 'friend' }, { w: 'visitor', note: '来访者' }] },
  visitor: { synonyms: [{ w: 'guest' }, { w: 'tourist', note: '游客' }] },
  tourist: { synonyms: [{ w: 'visitor' }] },
  neighbour: { synonyms: [{ w: 'friend' }] },
  umbrella: { related: ['rain', 'wet'] },
  grey: { variants: [{ form: 'gray', note: '美式拼写' }] },
  gray: { variants: [{ form: 'grey', note: '英式拼写' }] },
  favourite: { variants: [{ form: 'favorite', note: '美式拼写' }] },
  favorite: { variants: [{ form: 'favourite', note: '英式拼写' }] },
  refrigerator: { related: ['kitchen'] },
  photograph: { synonyms: [{ w: 'picture', note: '照片' }] },
  picture: { synonyms: [{ w: 'photograph' }, { w: 'film', note: '电影' }] },
  film: { synonyms: [{ w: 'picture', note: '影片' }, { w: 'cinema', note: '电影院' }] },
  cinema: { synonyms: [{ w: 'film' }, { w: 'television', note: '电视' }] },
  television: { synonyms: [{ w: 'radio', note: '收音机' }, { w: 'cinema' }] },
  radio: { synonyms: [{ w: 'television' }] },
  newspaper: { synonyms: [{ w: 'magazine', note: '杂志' }] },
  magazine: { synonyms: [{ w: 'newspaper' }] },
  letter: { synonyms: [{ w: 'envelope', note: '信封' }] },
  envelope: { synonyms: [{ w: 'letter' }] },
  exam: { synonyms: [{ w: 'test', note: '测验' }] },
  test: { synonyms: [{ w: 'exam' }] },
  homework: { related: ['school', 'teacher'] },
  school: { related: ['teacher', 'student', 'homework'] },
  goodbye: { synonyms: [{ w: 'hello', note: '见面问候' }] },
  hello: { synonyms: [{ w: 'hi', note: '更口语' }], related: ['good morning', 'good afternoon'] },
  hi: { synonyms: [{ w: 'hello', note: '更通用' }] },
  wait: { synonyms: [{ w: 'hurry', note: '赶快' }] },
  hurry: { synonyms: [{ w: 'wait', note: '反义' }, { w: 'quickly' }] },
  sleep: { synonyms: [{ w: 'wake', note: '醒来' }] },
  wake: { synonyms: [{ w: 'sleep', note: '反义' }] },
  cry: { synonyms: [{ w: 'smile', note: '微笑' }] },
  smile: { synonyms: [{ w: 'cry', note: '反义' }] },
  noise: { synonyms: [{ w: 'quiet', note: '安静' }] },
  quiet: { synonyms: [{ w: 'noise', note: '反义' }, { w: 'loud', note: '大声' }] },
  loud: { synonyms: [{ w: 'quiet', note: '反义' }] },
  east: { synonyms: [{ w: 'west', note: '西' }, { w: 'north', note: '北' }, { w: 'south', note: '南' }] },
  west: { synonyms: [{ w: 'east' }] },
  north: { synonyms: [{ w: 'south', note: '南' }] },
  south: { synonyms: [{ w: 'north', note: '北' }] },
  upstairs: { synonyms: [{ w: 'downstairs', note: '楼下' }] },
  downstairs: { synonyms: [{ w: 'upstairs', note: '楼上' }] },
  abroad: { synonyms: [{ w: 'overseas', note: '海外' }] },
  overseas: { synonyms: [{ w: 'abroad' }] },
  return: { synonyms: [{ w: 'go', note: '回去' }] },
  repair: { synonyms: [{ w: 'break', note: '打破' }] },
  break: { synonyms: [{ w: 'repair', note: '反义' }] },
  correct: { related: ['mistake'] },
  mistake: { related: ['correct'] },
  fail: { synonyms: [{ w: 'pass', note: '通过' }] },
  pass: { synonyms: [{ w: 'fail', note: '反义' }] },
};

function filterEntry(key, entry) {
  const out = {};
  if (entry.synonyms) {
    out.synonyms = entry.synonyms.filter((s) => {
      const w = typeof s === 'string' ? s : s.w;
      const k = normKey(w);
      if (!B1_KEYS.has(k)) {
        console.warn(`[skip] ${key} -> synonym "${w}" not in Book 1`);
        return false;
      }
      return true;
    });
    if (!out.synonyms.length) delete out.synonyms;
  }
  if (entry.related) {
    out.related = entry.related.filter((r) => {
      const w = typeof r === 'string' ? r : r.word || r.w;
      const first = normKey(String(w).split(/\s+/)[0]);
      if (!B1_KEYS.has(first) && !String(w).includes(' ')) {
        console.warn(`[skip] ${key} -> related "${w}" not in Book 1`);
        return false;
      }
      return true;
    });
    if (!out.related.length) delete out.related;
  }
  if (entry.variants) out.variants = entry.variants;
  return Object.keys(out).length ? out : null;
}

const out = {};
let skipped = 0;
for (const [key, entry] of Object.entries(B1_LEX)) {
  if (!B1_KEYS.has(key)) {
    console.warn(`[skip] headword "${key}" not in Book 1`);
    skipped++;
    continue;
  }
  const filtered = filterEntry(key, entry);
  if (filtered) out[key] = filtered;
}

const dest = path.join(__dirname, '..', 'data', 'word-lexicon-b1.json');
writeJSONAtomic(dest, out);
console.log(`Wrote ${Object.keys(out).length} entries to ${dest} (${skipped} headwords skipped)`);
