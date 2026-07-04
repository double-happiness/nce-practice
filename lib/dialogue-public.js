'use strict';
// 情景对话对外下发格式（API 与离线包共用）

const { LEARNER_ROLE } = require('./dialogue-meta');

function isLearnerTurn(turn) {
  return turn.role === LEARNER_ROLE;
}

function chainNextId(d, all) {
  if (!d.chain || !d.chain.id) return null;
  const nextPart = d.chain.part + 1;
  if (nextPart > d.chain.parts) return null;
  const hit = all.find(
    (x) => x.chain && x.chain.id === d.chain.id && x.chain.part === nextPart,
  );
  return hit ? hit.id : null;
}

function publicDialogue(d, all) {
  const list = all || [d];
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    titleCn: d.titleCn,
    scene: d.scene,
    roles: d.roles,
    chain: d.chain || null,
    nextId: chainNextId(d, list),
    turns: d.turns.map((t, i) => {
      const pub = { index: i, role: t.role, cn: t.cn };
      if (!isLearnerTurn(t)) pub.en = t.en;
      pub.practice = isLearnerTurn(t);
      return pub;
    }),
  };
}

function publicSummary(d, all) {
  const list = all || [d];
  const practiceCount = d.turns.filter(isLearnerTurn).length;
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    titleCn: d.titleCn,
    scene: d.scene,
    turnCount: d.turns.length,
    practiceCount,
    chain: d.chain || null,
    nextId: chainNextId(d, list),
  };
}

function chainIndex(dialogues) {
  const chains = new Map();
  for (const d of dialogues) {
    if (!d.chain || !d.chain.id) continue;
    if (!chains.has(d.chain.id)) {
      chains.set(d.chain.id, {
        id: d.chain.id,
        title: d.chain.title,
        titleCn: d.chain.titleCn,
        parts: d.chain.parts,
        partIds: [],
      });
    }
    chains.get(d.chain.id).partIds.push({ part: d.chain.part, id: d.id });
  }
  const list = [];
  chains.forEach((c) => {
    c.partIds.sort((a, b) => a.part - b.part);
    c.partIds = c.partIds.map((x) => x.id);
    list.push(c);
  });
  list.sort((a, b) => a.titleCn.localeCompare(b.titleCn, 'zh'));
  return list;
}

function buildMeta(dialogues, categories, buildGroupTree) {
  const byCategory = {};
  for (const d of dialogues) {
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  }
  return {
    total: dialogues.length,
    categories,
    groups: buildGroupTree(byCategory),
    byCategory,
    chains: chainIndex(dialogues),
  };
}

module.exports = {
  LEARNER_ROLE,
  isLearnerTurn,
  publicDialogue,
  publicSummary,
  chainIndex,
  buildMeta,
};
