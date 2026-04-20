'use strict';
const { pearson } = require('../utils/stats');

// Correlation pair 定義（靜態結構，和演算法強耦合，保留在 code 中）
const CORRELATION_PAIRS = [
  { key_a: 'monthly_influence', key_b: 'monthly_search', dim_a: 'social_overview', dim_b: 'search', metric_a: 'influence', metric_b: 'search_volume' },
];

function analyzeCross(dimensions, timeSeries = {}, snapshot) {
  if (!snapshot || typeof snapshot.get !== 'function') {
    throw new Error('[cross-analyzer] snapshot required');
  }
  const strongThreshold = snapshot.get('thresholds.correlation.strength_threshold');
  const moderateThreshold = snapshot.get('thresholds.correlation.moderate_threshold');
  const baseScore = snapshot.get('thresholds.scoring.cross_analysis.base_score');
  const posAdj = snapshot.get('thresholds.scoring.cross_analysis.positive_adjustment');
  const negAdj = snapshot.get('thresholds.scoring.cross_analysis.negative_adjustment');
  const quadrants = snapshot.get('thresholds.scoring.competitive_quadrants');
  const dirPos = snapshot.get('copy.insight_templates.correlation_direction_positive');
  const dirNeg = snapshot.get('copy.insight_templates.correlation_direction_negative');
  const insightStrong = snapshot.get('copy.insight_templates.correlation_strong');
  const insightModerate = snapshot.get('copy.insight_templates.correlation_moderate');
  const insightWeakTpl = snapshot.has('copy.insight_templates.correlation_weak')
    ? snapshot.get('copy.insight_templates.correlation_weak')
    : '${metricA} 與 ${metricB} 呈低度${direction}相關（r=${r}）';

  function correlationStrength(r) {
    const abs = Math.abs(r);
    if (abs >= strongThreshold) return 'strong';
    if (abs >= moderateThreshold) return 'moderate';
    return 'weak';
  }

  function interp(tpl, vars) {
    return tpl.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  }

  const correlations = [];
  const anomalies = [];

  if (!dimensions) {
    return { correlations: [], anomalies: [], market_position: { overall_score: 0, quadrant: 'follower', strengths: [], weaknesses: [] } };
  }

  for (const pair of CORRELATION_PAIRS) {
    const arrA = timeSeries[pair.key_a];
    const arrB = timeSeries[pair.key_b];
    const r = pearson(arrA, arrB);
    if (r !== null) {
      const strength = correlationStrength(r);
      const direction = r > 0 ? dirPos : dirNeg;
      const tpl = strength === 'strong' ? insightStrong
        : strength === 'moderate' ? insightModerate
        : insightWeakTpl;
      correlations.push({
        dim_a: pair.dim_a, dim_b: pair.dim_b, metric_a: pair.metric_a, metric_b: pair.metric_b,
        correlation: parseFloat(r.toFixed(3)), strength,
        insight: interp(tpl, { metricA: pair.metric_a, metricB: pair.metric_b, direction, r: r.toFixed(2) }),
      });
    }
  }

  let score = baseScore;
  const strengths = [];
  const weaknesses = [];

  const sentiment = dimensions.sentiment?.derived_metrics;
  if (sentiment) {
    if (sentiment.net_sentiment_score > 30) { score += posAdj; strengths.push('net_sentiment_score'); }
    else if (sentiment.net_sentiment_score < 0) { score -= posAdj; weaknesses.push('net_sentiment_score'); }
  }

  const trend = dimensions.trend?.derived_metrics;
  if (trend) {
    if (trend.trend_direction === 'up') { score += posAdj; strengths.push('growth_rate'); }
    else if (trend.trend_direction === 'down') { score -= posAdj; weaknesses.push('growth_rate'); }
  }

  const social = dimensions.social_overview?.derived_metrics;
  if (social) {
    if (social.engagement_rate > 2) { score += negAdj; strengths.push('engagement_rate'); }
    else if (social.engagement_rate < 1) { score -= negAdj; weaknesses.push('engagement_rate'); }
  }

  const positiveCount = Object.values(dimensions).flatMap(d => d.insights || []).filter(i => i.severity === 'positive').length;
  score += Math.min(positiveCount * 2, negAdj);
  score = Math.max(0, Math.min(100, score));

  let quadrant;
  if (score >= quadrants.leader) quadrant = 'leader';
  else if (score >= quadrants.challenger) quadrant = 'challenger';
  else if (score >= quadrants.niche) quadrant = 'niche';
  else quadrant = 'follower';

  return { correlations: correlations.slice(0, 5), anomalies, market_position: { overall_score: score, quadrant, strengths, weaknesses } };
}

module.exports = { analyzeCross };
