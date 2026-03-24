'use strict';
const { mean, zScore, iqr } = require('../utils/stats');

function detectAnomalies(metricName, values, opts = {}) {
  if (!values || values.length < 3) return [];
  const method = opts.method || 'zscore';
  const threshold = opts.threshold || 2.5;
  const anomalies = [];

  if (method === 'zscore') {
    const avg = mean(values);
    for (const val of values) {
      const z = zScore(val, values);
      if (z !== null && Math.abs(z) > threshold) {
        anomalies.push({ metric: metricName, value: val, expected: parseFloat(avg.toFixed(2)), z_score: parseFloat(z.toFixed(2)), likely_cause: null });
      }
    }
  } else if (method === 'iqr') {
    const result = iqr(values);
    if (!result) return [];
    for (const val of values) {
      if (val > result.upperFence || val < result.lowerFence) {
        anomalies.push({ metric: metricName, value: val, expected: parseFloat(result.median.toFixed(2)), z_score: zScore(val, values) ? parseFloat(zScore(val, values).toFixed(2)) : null, likely_cause: null });
      }
    }
  }
  return anomalies;
}

module.exports = { detectAnomalies };
