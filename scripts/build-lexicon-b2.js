'use strict';
// 生成第二册同义词 / 相关词 / 拼写变体词库
// 用法：node scripts/build-lexicon-b2.js

const { buildBookLexicon } = require('./lexicon-build-core');
const SYN_PAIRS = require('./lexicon-pairs');
const CLUSTER_GROUPS = require('./lexicon-clusters');

const MANUAL = {
  complain: { related: ['apologize', 'excuse'] },
  steal: { related: ['thief', 'policeman'] },
  murder: { related: ['detective', 'prisoner'] },
  detective: { related: ['murder', 'arrest', 'accuse'] },
  aeroplane: { variants: [{ form: 'airplane', note: '美式拼写' }] },
  marvellous: { variants: [{ form: 'marvelous', note: '美式拼写' }] },
  centre: { variants: [{ form: 'center', note: '美式拼写' }] },
  honour: { variants: [{ form: 'honor', note: '美式拼写' }] },
  grey: { variants: [{ form: 'gray', note: '美式拼写' }] },
  favourite: { variants: [{ form: 'favorite', note: '美式拼写' }] },
  colour: { variants: [{ form: 'color', note: '美式拼写' }] },
  traveller: { variants: [{ form: 'traveler', note: '美式拼写' }] },
  jewellery: { variants: [{ form: 'jewelry', note: '美式拼写' }] },
  tyre: { variants: [{ form: 'tire', note: '美式：轮胎' }] },
  defence: { variants: [{ form: 'defense', note: '美式拼写' }] },
  licence: { variants: [{ form: 'license', note: '美式拼写' }] },
  programme: { variants: [{ form: 'program', note: '美式拼写' }] },
  cheque: { variants: [{ form: 'check', note: '美式：支票' }] },
  labour: { variants: [{ form: 'labor', note: '美式拼写' }] },
  woollen: { variants: [{ form: 'woolen', note: '美式拼写' }] },
  practise: { variants: [{ form: 'practice', note: '美式：动词' }] },
  bank: { related: ['cash', 'salary', 'income'] },
  airport: { related: ['passport', 'customs', 'aeroplane'] },
  passport: { related: ['customs', 'abroad'] },
  hospital: { related: ['doctor', 'nurse', 'patient'] },
  exam: { related: ['test', 'fail', 'succeed'] },
  olympic: { related: ['compete', 'defeat', 'victory'] },
  victory: { related: ['defeat', 'compete'] },
  atmosphere: { related: ['planet', 'orbit', 'space'] },
  treasure: { related: ['gold', 'jewel', 'wealth'] },
  cave: { related: ['treasure', 'explorer'] },
  explorer: { related: ['discover', 'treasure'] },
};

const r = buildBookLexicon(2, {
  synPairs: SYN_PAIRS,
  clusterGroups: CLUSTER_GROUPS,
  manual: MANUAL,
});
console.log(`Book 2 vocab: ${r.vocab}; pairs ${r.pairOk}/${r.pairSkip}; clusters ${r.clusterOk}`);
console.log(`Wrote ${r.count} entries to ${r.dest}`);
