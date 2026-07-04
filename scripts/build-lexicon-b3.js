'use strict';
// 生成第三册同义词 / 相关词 / 拼写变体词库
// 用法：node scripts/build-lexicon-b3.js

const { buildBookLexicon } = require('./lexicon-build-core');
const SYN_PAIRS = require('./lexicon-pairs');
const CLUSTER_GROUPS = require('./lexicon-clusters');
const EXTRA_CLUSTERS = require('./lexicon-clusters-b3');

const MANUAL = {
  evidence: { related: ['proof', 'witness', 'verify'] },
  abstract: { related: ['concrete', 'theory'] },
  civilization: { related: ['culture', 'tradition', 'society'] },
  pollution: { related: ['conservation', 'environment', 'waste'] },
  poverty: { related: ['prosperous', 'wealth', 'hardship'] },
  compensate: { related: ['reward', 'payment', 'loss'] },
  verify: { related: ['evidence', 'confirm', 'establish'] },
  classify: { related: ['category', 'group', 'type'] },
  bewilder: { related: ['confuse', 'puzzle', 'clarify'] },
  paradox: { related: ['contradiction', 'irony'] },
  sacred: { related: ['religious', 'holy', 'church'] },
  monastery: { related: ['church', 'temple', 'religious'] },
  hostile: { related: ['aggressive', 'friendly', 'conflict'] },
  volatile: { related: ['unstable', 'change', 'steady'] },
  vulnerable: { related: ['weak', 'exposed', 'protect'] },
  genuine: { related: ['authentic', 'real', 'false'] },
  plausible: { related: ['credible', 'reasonable', 'doubtful'] },
  absurd: { related: ['ridiculous', 'sensible', 'logic'] },
  violate: { related: ['breach', 'law', 'obey'] },
  reprimand: { related: ['rebuke', 'praise', 'punish'] },
  console: { related: ['comfort', 'grieve', 'soothe'] },
  species: { related: ['extinct', 'preserve', 'habitat'] },
  ecology: { related: ['environment', 'pollution', 'conservation'] },
  democracy: { related: ['freedom', 'vote', 'government'] },
  withdraw: { related: ['retreat', 'advance', 'leave'] },
  triumph: { related: ['victory', 'defeat', 'success'] },
  centre: { variants: [{ form: 'center', note: '美式拼写' }] },
  honour: { variants: [{ form: 'honor', note: '美式拼写' }] },
  favour: { variants: [{ form: 'favor', note: '美式拼写' }] },
  grey: { variants: [{ form: 'gray', note: '美式拼写' }] },
  defence: { variants: [{ form: 'defense', note: '美式拼写' }] },
  licence: { variants: [{ form: 'license', note: '美式拼写' }] },
  programme: { variants: [{ form: 'program', note: '美式拼写' }] },
  labour: { variants: [{ form: 'labor', note: '美式拼写' }] },
  marvellous: { variants: [{ form: 'marvelous', note: '美式拼写' }] },
  analyse: { variants: [{ form: 'analyze', note: '美式拼写' }] },
  civilisation: { variants: [{ form: 'civilization', note: '美式拼写' }] },
};

const r = buildBookLexicon(3, {
  synPairs: SYN_PAIRS,
  clusterGroups: [...CLUSTER_GROUPS, ...EXTRA_CLUSTERS],
  manual: MANUAL,
  autoGloss: true,
  glossMax: 300,
});
console.log(`Book 3 vocab: ${r.vocab}; pairs ${r.pairOk}/${r.pairSkip}; clusters ${r.clusterOk}`);
console.log(`Wrote ${r.count} entries to ${r.dest}`);
