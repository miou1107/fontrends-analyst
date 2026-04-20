'use strict';

function getAffinityWeights(purposeType, snapshot) {
  if (!snapshot || typeof snapshot.get !== 'function') {
    throw new Error('[affinity-table] snapshot required');
  }
  const table = snapshot.get('dimensions.affinity_table');
  const dims = snapshot.get('dimensions.affinity_dimensions');
  const neutralDefault = snapshot.get('dimensions.affinity_neutral_default');

  if (table[purposeType]) return { ...table[purposeType] };
  const neutral = {};
  for (const dim of dims) neutral[dim] = neutralDefault;
  return neutral;
}

module.exports = { getAffinityWeights };
