'use strict';

function computeSignalStrength(dimension, snapshot) {
  const levels = snapshot?.get?.('thresholds.scoring.purpose_signal_levels') ?? {
    has_anomaly: 1.0, has_growth_or_decline: 0.8, has_any_data: 0.5, default: 0.2,
  };

  if (!dimension) return levels.default;

  const anomalies = dimension.anomalies || [];
  const insights = dimension.insights || [];

  if (anomalies.length > 0) return levels.has_anomaly;

  const hasGrowthOrDecline = insights.some(
    i => i.type === 'growth' || i.type === 'decline'
  );
  if (hasGrowthOrDecline) return levels.has_growth_or_decline;

  const hasAnyData = (insights.length > 0) ||
    (dimension.derived_metrics && Object.keys(dimension.derived_metrics).length > 0);
  if (hasAnyData) return levels.has_any_data;

  return levels.default;
}

module.exports = { computeSignalStrength };
