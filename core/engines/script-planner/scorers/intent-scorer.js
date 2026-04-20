'use strict';

function getIntentBoost(analysisDimension, brand, snapshot) {
  const boost = snapshot?.get?.('thresholds.scoring.intent_boost_focused_multiplier') ?? 1.5;
  const focusDims = brand?.focus_dimensions;
  if (!Array.isArray(focusDims) || focusDims.length === 0) return 1.0;
  return focusDims.includes(analysisDimension) ? boost : 1.0;
}

function getPurposeFactor(analysisDimension, bindings, snapshot) {
  const base = snapshot?.get?.('thresholds.scoring.purpose_factor.base') ?? 0.5;
  const coef = snapshot?.get?.('thresholds.scoring.purpose_factor.relevance_coef') ?? 0.5;
  if (!bindings || bindings.length === 0) return 1.0;
  const binding = bindings.find(b => b.dimension === analysisDimension);
  if (!binding) return base;
  return base + (binding.relevance_score * coef);
}

module.exports = { getIntentBoost, getPurposeFactor };
