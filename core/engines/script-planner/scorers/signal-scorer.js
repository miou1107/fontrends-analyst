'use strict';

function computeSignalScore(dimension) {
  const insights = dimension.insights || [];
  const anomalies = dimension.anomalies || [];
  const mom = dimension.self_comparison?.mom;
  const hasPrimary = dimension.competitor_comparison?.primary != null;

  const insightSignal = Math.min(insights.length / 3, 1.0) * 0.35;
  const anomalySignal = Math.min(anomalies.length / 2, 1.0) * 0.25;

  let maxChangePct = 0;
  if (mom && typeof mom === 'object') {
    for (const val of Object.values(mom)) {
      if (val && typeof val.change_pct === 'number') {
        maxChangePct = Math.max(maxChangePct, Math.abs(val.change_pct));
      }
    }
  }
  const changeSignal = Math.min(maxChangePct / 50, 1.0) * 0.25;
  const competeSignal = hasPrimary ? 0.15 : 0;

  return insightSignal + anomalySignal + changeSignal + competeSignal;
}

module.exports = { computeSignalScore };
