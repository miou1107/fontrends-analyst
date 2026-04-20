'use strict';

// Headline Generator — L3 Engine
// 文案模板從 snapshot 讀取

function interp(tpl, vars) {
  return tpl.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function generateHeadline(dimension, dimensionTitle, options, snapshot) {
  if (!snapshot || typeof snapshot.get !== 'function') {
    throw new Error('[headline-generator] snapshot required');
  }
  const labels = snapshot.get('dimensions.labels');
  const label = (m) => labels[m] || m;
  const tpl = snapshot.get('copy.headline_templates');

  if (options?.bindings && options?.focus) {
    const binding = options.bindings.find(b => b.dimension === options.focus);
    if (binding?.hook) return { focus: options.focus || 'overview', headline: binding.hook };
  }

  const insights = dimension.insights || [];
  const anomalies = dimension.anomalies || [];

  let focus = 'overview';
  let headline = dimensionTitle;

  if (anomalies.length > 0) {
    focus = 'anomaly';
    const a = anomalies[0];
    const mult = a.expected > 0 ? (a.value / a.expected).toFixed(1) : 'N/A';
    headline = interp(tpl.anomaly, { metric: label(a.metric), mult });
    return { focus, headline };
  }

  const growth = insights.find(i => i.type === 'growth' && i.severity === 'positive');
  const decline = insights.find(i => i.type === 'decline');
  const leader = insights.find(i => i.type === 'leader');
  const laggard = insights.find(i => i.type === 'laggard');

  if (decline) {
    focus = 'decline';
    const metric = decline.evidence?.metric;
    const pct = extractPct(decline.text);
    headline = metric
      ? (pct ? interp(tpl.decline_with_pct, { metric: label(metric), pct }) : interp(tpl.decline_no_pct, { metric: label(metric) }))
      : (decline.text || interp(tpl.decline_fallback, { title: dimensionTitle }));
  } else if (growth) {
    focus = 'growth';
    const metric = growth.evidence?.metric;
    const pct = extractPct(growth.text);
    headline = metric
      ? (pct ? interp(tpl.growth_with_pct, { metric: label(metric), pct }) : interp(tpl.growth_no_pct, { metric: label(metric) }))
      : (growth.text || interp(tpl.growth_fallback, { title: dimensionTitle }));
  } else if (leader) {
    focus = 'leader';
    const metric = leader.evidence?.metric;
    headline = metric ? interp(tpl.leader_with_metric, { metric: label(metric) }) : (leader.text || interp(tpl.leader_fallback, { title: dimensionTitle }));
  } else if (laggard) {
    focus = 'laggard';
    const metric = laggard.evidence?.metric;
    headline = metric ? interp(tpl.laggard_with_metric, { metric: label(metric) }) : (laggard.text || interp(tpl.laggard_fallback, { title: dimensionTitle }));
  }

  return { focus, headline };
}

function extractPct(text) {
  const match = text && text.match(/[-]?[\d.]+%/);
  if (match) return match[0].replace('%', '');
  return null;
}

module.exports = { generateHeadline };
