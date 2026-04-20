'use strict';

function computeSignalScore(dimension, snapshot) {
  if (!snapshot || typeof snapshot.get !== 'function') {
    throw new Error('[signal-scorer] snapshot required');
  }
  const weights = snapshot.get('thresholds.scoring.signal_weights');
  const divisions = snapshot.get('thresholds.scoring.signal_divisions');

  const insights = dimension.insights || [];
  const anomalies = dimension.anomalies || [];
  const mom = dimension.self_comparison?.mom;
  const hasPrimary = dimension.competitor_comparison?.primary != null;

  const insightSignal = Math.min(insights.length / divisions.insights, 1.0) * weights.insights;
  const anomalySignal = Math.min(anomalies.length / divisions.anomalies, 1.0) * weights.anomalies;

  let maxChangePct = 0;
  if (mom && typeof mom === 'object') {
    for (const val of Object.values(mom)) {
      if (val && typeof val.change_pct === 'number') {
        maxChangePct = Math.max(maxChangePct, Math.abs(val.change_pct));
      }
    }
  }
  const changeSignal = Math.min(maxChangePct / divisions.changes, 1.0) * weights.change;
  const competeSignal = hasPrimary ? weights.compete : 0;

  return insightSignal + anomalySignal + changeSignal + competeSignal;
}

module.exports = { computeSignalScore };
