'use strict';
// 生成第四册同义词 / 相关词 / 拼写变体词库
// 用法：node scripts/build-lexicon-b4.js

const { buildBookLexicon } = require('./lexicon-build-core');
const SYN_PAIRS = require('./lexicon-pairs');
const CLUSTER_GROUPS = require('./lexicon-clusters');
const EXTRA_CLUSTERS = require('./lexicon-clusters-b4');

const MANUAL = {
  hypothesis: { related: ['theory', 'evidence', 'assumption'] },
  analysis: { related: ['synthesis', 'examination', 'study'] },
  evidence: { related: ['proof', 'data', 'verify'] },
  phenomenon: { related: ['occurrence', 'event', 'observe'] },
  contemporary: { related: ['modern', 'current', 'ancient'] },
  innovation: { related: ['invention', 'tradition', 'change'] },
  recession: { related: ['decline', 'depression', 'prosperity'] },
  unemployment: { related: ['job', 'poverty', 'economy'] },
  conservation: { related: ['preserve', 'environment', 'pollution'] },
  deteriorate: { related: ['decline', 'worsen', 'improve'] },
  aggravate: { related: ['worsen', 'alleviate', 'intensify'] },
  constitute: { related: ['form', 'compose', 'establish'] },
  withdraw: { related: ['retreat', 'surrender', 'advance'] },
  conquer: { related: ['defeat', 'triumph', 'surrender'] },
  subdue: { related: ['conquer', 'suppress', 'resist'] },
  oppress: { related: ['suppress', 'liberate', 'dominate'] },
  alienate: { related: ['isolate', 'estrange', 'unite'] },
  merge: { related: ['combine', 'acquire', 'separate'] },
  invest: { related: ['finance', 'divest', 'profit'] },
  infrastructure: { related: ['structure', 'foundation', 'system'] },
  bureaucracy: { related: ['administration', 'official', 'hierarchy'] },
  hierarchy: { related: ['rank', 'structure', 'level'] },
  controversy: { related: ['debate', 'consensus', 'dispute'] },
  paradox: { related: ['contradiction', 'irony', 'logic'] },
  distort: { related: ['twist', 'clarify', 'truth'] },
  deduce: { related: ['infer', 'conclude', 'reason'] },
  generalize: { related: ['broaden', 'specify', 'conclude'] },
  perceive: { related: ['observe', 'notice', 'sense'] },
  conceive: { related: ['imagine', 'understand', 'create'] },
  comprehend: { related: ['understand', 'grasp', 'confuse'] },
  fathom: { related: ['understand', 'depth', 'grasp'] },
  bewilder: { related: ['confuse', 'puzzle', 'clarify'] },
  dogma: { related: ['doctrine', 'belief', 'principle'] },
  heretic: { related: ['dissenter', 'orthodox', 'rebel'] },
  legend: { related: ['myth', 'history', 'tale'] },
  inquisition: { related: ['investigation', 'inquiry', 'trial'] },
  cosmopolitan: { related: ['worldly', 'international', 'provincial'] },
  consolidate: { related: ['unify', 'strengthen', 'weaken'] },
  delegate: { related: ['assign', 'authorize', 'represent'] },
  manifest: { related: ['obvious', 'hidden', 'display'] },
  volatile: { related: ['unstable', 'changeable', 'steady'] },
  vulnerable: { related: ['exposed', 'weak', 'protected'] },
  susceptible: { related: ['prone', 'liable', 'immune'] },
  perilous: { related: ['dangerous', 'hazardous', 'safe'] },
  genuine: { related: ['authentic', 'real', 'fake'] },
  plausible: { related: ['credible', 'reasonable', 'doubtful'] },
  absurd: { related: ['ridiculous', 'preposterous', 'sensible'] },
  violate: { related: ['breach', 'infringe', 'obey'] },
  breach: { related: ['violate', 'break', 'mend'] },
  penalize: { related: ['punish', 'sanction', 'reward'] },
  centre: { variants: [{ form: 'center', note: '美式拼写' }] },
  honour: { variants: [{ form: 'honor', note: '美式拼写' }] },
  favour: { variants: [{ form: 'favor', note: '美式拼写' }] },
  grey: { variants: [{ form: 'gray', note: '美式拼写' }] },
  defence: { variants: [{ form: 'defense', note: '美式拼写' }] },
  licence: { variants: [{ form: 'license', note: '美式拼写' }] },
  programme: { variants: [{ form: 'program', note: '美式拼写' }] },
  labour: { variants: [{ form: 'labor', note: '美式拼写' }] },
  organisation: { variants: [{ form: 'organization', note: '美式拼写' }] },
  recognise: { variants: [{ form: 'recognize', note: '美式拼写' }] },
  summarise: { variants: [{ form: 'summarize', note: '美式拼写' }] },
  civilisation: { variants: [{ form: 'civilization', note: '美式拼写' }] },
};

const r = buildBookLexicon(4, {
  synPairs: SYN_PAIRS,
  clusterGroups: [...CLUSTER_GROUPS, ...EXTRA_CLUSTERS],
  manual: MANUAL,
  autoGloss: true,
  glossMax: 300,
});
console.log(`Book 4 vocab: ${r.vocab}; pairs ${r.pairOk}/${r.pairSkip}; clusters ${r.clusterOk}`);
console.log(`Wrote ${r.count} entries to ${r.dest}`);
