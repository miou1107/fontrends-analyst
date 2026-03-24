'use strict';

function getIntentBoost(analysisDimension, brand) {
  const focusDims = brand?.focus_dimensions;
  if (!Array.isArray(focusDims) || focusDims.length === 0) return 1.0;
  return focusDims.includes(analysisDimension) ? 1.5 : 1.0;
}

function getPurposeFactor(analysisDimension, bindings) {
  if (!bindings || bindings.length === 0) return 1.0;
  const binding = bindings.find(b => b.dimension === analysisDimension);
  if (!binding) return 0.5;
  return 0.5 + (binding.relevance_score * 0.5);
}

module.exports = { getIntentBoost, getPurposeFactor };
