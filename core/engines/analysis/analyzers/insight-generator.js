'use strict';

// Insight Generator — L3 Engine
// 所有門檻 / 文案模板 / 指標標籤從 snapshot 讀取

function interp(template, vars) {
  return template.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function generateInsights(input, snapshot) {
  if (!snapshot || typeof snapshot.get !== 'function') {
    throw new Error('[insight-generator] snapshot required');
  }
  if (!input) return [];

  const maxInsights = snapshot.get('thresholds.scoring.max_insights');
  const growthThreshold = snapshot.get('thresholds.scoring.growth_decline_detection');
  const correlationThreshold = snapshot.get('thresholds.correlation.strength_threshold');
  const metricLabels = snapshot.get('dimensions.labels');
  const tpl = snapshot.get('copy.insight_templates');
  const label = (m) => metricLabels[m] || m;

  const insights = [];
  const compPeriods = ['mom', 'qoq', 'yoy'];
  const periodLabels = tpl.period_labels;

  // 1. Self-comparison insights
  if (input.self_comparison) {
    for (const period of compPeriods) {
      const comp = input.self_comparison[period];
      if (!comp) continue;
      for (const [metric, data] of Object.entries(comp)) {
        if (!data || data.change_pct === null) continue;
        const pctAbs = Math.abs(data.change_pct);
        if (data.direction === 'up' && pctAbs > growthThreshold) {
          insights.push({
            type: 'growth', severity: 'positive',
            text: interp(tpl.growth, { metric: label(metric), period: periodLabels[period], pct: data.change_pct }),
            evidence: { metric, comparison: period }, _sort: pctAbs,
          });
        } else if (data.direction === 'down' && pctAbs > growthThreshold) {
          insights.push({
            type: 'decline', severity: 'negative',
            text: interp(tpl.decline, { metric: label(metric), period: periodLabels[period], pct: data.change_pct }),
            evidence: { metric, comparison: period }, _sort: pctAbs,
          });
        }
      }
    }
  }

  // 2. Anomaly insights
  if (input.anomalies && input.anomalies.length > 0) {
    for (const a of input.anomalies) {
      const mult = a.expected > 0 ? (a.value / a.expected).toFixed(1) : 'N/A';
      insights.push({
        type: 'anomaly', severity: 'warning',
        text: interp(tpl.anomaly, { metric: label(a.metric), value: a.value.toLocaleString(), mult }),
        evidence: { metric: a.metric, comparison: 'anomaly' }, _sort: Math.abs(a.z_score || 0) * 10,
      });
    }
  }

  // 3. Competitor ranking insights
  if (input.competitor_comparison?.market?.ranking) {
    for (const [metric, rank] of Object.entries(input.competitor_comparison.market.ranking)) {
      if (rank.rank === 1 && rank.total >= 3) {
        insights.push({
          type: 'leader', severity: 'positive',
          text: interp(tpl.leader, { metric: label(metric), total: rank.total }),
          evidence: { metric, comparison: 'market' }, _sort: rank.total * 5,
        });
      } else if (rank.rank > rank.total / 2) {
        insights.push({
          type: 'laggard', severity: 'negative',
          text: interp(tpl.laggard, { metric: label(metric), total: rank.total, rank: rank.rank }),
          evidence: { metric, comparison: 'market' }, _sort: rank.rank * 3,
        });
      }
    }
  }

  // 4. Correlation insights
  if (input.correlations && input.correlations.length > 0) {
    for (const c of input.correlations) {
      if (Math.abs(c.correlation) > correlationThreshold) {
        const direction = c.correlation > 0 ? tpl.correlation_direction_positive : tpl.correlation_direction_negative;
        const template = c.strength === 'strong' ? tpl.correlation_strong : tpl.correlation_moderate;
        insights.push({
          type: 'correlation', severity: 'neutral',
          text: interp(template, { metricA: label(c.metric_a), metricB: label(c.metric_b), direction, r: c.correlation.toFixed(2) }),
          evidence: { metric: `${c.metric_a}_x_${c.metric_b}`, comparison: 'correlation' },
          _sort: Math.abs(c.correlation) * 10,
        });
      }
    }
  }

  // Dedup
  const seen = new Set();
  const deduped = [];
  insights.sort((a, b) => (b._sort || 0) - (a._sort || 0));
  for (const ins of insights) {
    const key = `${ins.evidence.metric}_${ins.type}`;
    const altKey = ins.type === 'decline' ? `${ins.evidence.metric}_laggard`
      : ins.type === 'laggard' ? `${ins.evidence.metric}_decline` : null;
    if (seen.has(key)) continue;
    if (altKey && seen.has(altKey)) continue;
    seen.add(key);
    deduped.push(ins);
  }

  return deduped.slice(0, maxInsights).map(({ _sort, ...rest }) => rest);
}

// 提供給其他 engine 查找 label（從 snapshot 而非 const）
function getLabel(snapshot, metric) {
  const labels = snapshot.get('dimensions.labels');
  return labels[metric] || metric;
}

module.exports = { generateInsights, getLabel };
