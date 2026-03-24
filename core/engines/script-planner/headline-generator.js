'use strict';

const { METRIC_LABELS } = require('../analysis/analyzers/insight-generator');

/**
 * Generate a concise, presentation-ready headline for a dimension page.
 *
 * Strategy:
 *   anomaly  → "【異常】{metric} 飆升 {N} 倍"
 *   growth   → "{metric} 大幅成長 {pct}%"
 *   decline  → "{metric} 下滑 {pct}%，需留意"
 *   leader   → "{metric} 市場排名第一"
 *   overview → "{dimensionTitle}"  (fallback)
 *
 * All headlines are ≤ 25 chars target for slide titles.
 */

function label(metric) { return METRIC_LABELS[metric] || metric; }

function generateHeadline(dimension, dimensionTitle, options) {
  // Hook override from purpose bindings — insert at top of function
  if (options?.bindings && options?.focus) {
    const binding = options.bindings.find(b => b.dimension === options.focus);
    if (binding?.hook) return { focus: options.focus || 'overview', headline: binding.hook };
  }

  const insights = dimension.insights || [];
  const anomalies = dimension.anomalies || [];

  let focus = 'overview';
  let headline = dimensionTitle;

  // Priority 1: anomalies
  if (anomalies.length > 0) {
    focus = 'anomaly';
    const a = anomalies[0];
    const mult = a.expected > 0 ? (a.value / a.expected).toFixed(1) : 'N/A';
    headline = `${label(a.metric)} 異常飆升 ${mult} 倍`;
    return { focus, headline };
  }

  // Priority 2: scan insights by type
  const growth = insights.find(i => i.type === 'growth' && i.severity === 'positive');
  const decline = insights.find(i => i.type === 'decline');
  const leader = insights.find(i => i.type === 'leader');
  const laggard = insights.find(i => i.type === 'laggard');

  if (decline) {
    focus = 'decline';
    const metric = decline.evidence?.metric;
    const pct = extractPct(decline.text);
    headline = metric
      ? (pct ? `${label(metric)} 下滑 ${pct}%` : `${label(metric)} 呈下降趨勢`)
      : (decline.text || `${dimensionTitle}下滑`);
  } else if (growth) {
    focus = 'growth';
    const metric = growth.evidence?.metric;
    const pct = extractPct(growth.text);
    headline = metric
      ? (pct ? `${label(metric)} 成長 ${pct}%` : `${label(metric)} 持續成長`)
      : (growth.text || `${dimensionTitle}成長`);
  } else if (leader) {
    focus = 'leader';
    const metric = leader.evidence?.metric;
    headline = metric ? `${label(metric)} 領先市場` : (leader.text || `${dimensionTitle}領先`);
  } else if (laggard) {
    focus = 'laggard';
    const metric = laggard.evidence?.metric;
    headline = metric ? `${label(metric)} 有待加強` : (laggard.text || `${dimensionTitle}有待加強`);
  }

  return { focus, headline };
}

/**
 * Extract percentage value from insight text like "成長 54.5%" or "下降 -12.3%"
 */
function extractPct(text) {
  const match = text && text.match(/[-]?[\d.]+%/);
  if (match) return match[0].replace('%', '');
  return null;
}

module.exports = { generateHeadline };
