'use strict';
const { changePct, direction } = require('../utils/stats');

function compareSelf(current, previous, threshold = 1) {
  if (!current || !previous) return null;
  const result = {};
  for (const key of Object.keys(current)) {
    if (typeof current[key] !== 'number') continue;
    if (typeof previous[key] !== 'number') continue;
    const change = changePct(current[key], previous[key]);
    result[key] = {
      current: current[key],
      previous: previous[key],
      change_abs: parseFloat((current[key] - previous[key]).toFixed(4)),
      change_pct: change !== null ? parseFloat(change.toFixed(1)) : null,
      direction: direction(change, threshold),
    };
  }
  return Object.keys(result).length > 0 ? result : null;
}

module.exports = { compareSelf };
