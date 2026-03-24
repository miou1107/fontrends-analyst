'use strict';

function computeSignalStrength(dimension) {
  if (!dimension) return 0.2;

  const anomalies = dimension.anomalies || [];
  const insights = dimension.insights || [];

  if (anomalies.length > 0) return 1.0;

  const hasGrowthOrDecline = insights.some(
    i => i.type === 'growth' || i.type === 'decline'
  );
  if (hasGrowthOrDecline) return 0.8;

  const hasAnyData = (insights.length > 0) ||
    (dimension.derived_metrics && Object.keys(dimension.derived_metrics).length > 0);
  if (hasAnyData) return 0.5;

  return 0.2;
}

module.exports = { computeSignalStrength };
