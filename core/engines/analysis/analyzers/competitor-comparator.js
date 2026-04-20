'use strict';
const { multiplier: calcMultiplier } = require('../utils/stats');

function compareCompetitor(selfMetrics, primary, market = [], snapshot) {
  if (!selfMetrics) return null;
  const advMult = snapshot?.get?.('thresholds.scoring.competitor_advantage_multiplier') ?? 1.05;

  const primaryResult = { brand: primary?.brand || 'N/A', metrics: {} };
  if (primary?.metrics) {
    for (const key of Object.keys(primary.metrics)) {
      if (typeof primary.metrics[key] !== 'number') continue;
      const selfVal = selfMetrics[key];
      const compVal = primary.metrics[key];
      if (selfVal == null) continue;
      const mult = calcMultiplier(selfVal, compVal);
      let advantage = 'tie';
      if (selfVal > compVal * advMult) advantage = 'self';
      else if (compVal > selfVal * advMult) advantage = 'competitor';
      primaryResult.metrics[key] = {
        self: selfVal, competitor: compVal,
        multiplier: mult !== null ? parseFloat(mult.toFixed(2)) : null,
        advantage,
      };
    }
  }

  const allBrands = [
    { brand: 'self', ...selfMetrics },
    ...(primary?.metrics ? [{ brand: primary.brand, ...primary.metrics }] : []),
    ...market,
  ];
  const totalBrands = allBrands.length;
  const marketResult = { brands: allBrands.filter(b => b.brand !== 'self').map(b => b.brand), ranking: {}, market_share_estimate: null };

  if (totalBrands >= 3) {
    const influenceValues = allBrands.map(b => ({ brand: b.brand, value: b.influence || 0 })).sort((a, b) => b.value - a.value);
    const selfRank = influenceValues.findIndex(b => b.brand === 'self') + 1;
    const totalInfluence = influenceValues.reduce((s, b) => s + b.value, 0);
    if (totalInfluence > 0) {
      marketResult.ranking.influence = {
        rank: selfRank, total: totalBrands,
        percentile: parseFloat(((1 - (selfRank - 1) / totalBrands) * 100).toFixed(1)),
      };
      marketResult.market_share_estimate = parseFloat((((selfMetrics.influence || 0) / totalInfluence) * 100).toFixed(1));
    }
  }

  return { primary: primaryResult, market: marketResult };
}

module.exports = { compareCompetitor };
