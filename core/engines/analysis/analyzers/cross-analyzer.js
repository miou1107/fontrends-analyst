'use strict';
const { pearson } = require('../utils/stats');

const CORRELATION_PAIRS = [
  { key_a: 'monthly_influence', key_b: 'monthly_search', dim_a: 'social_overview', dim_b: 'search', metric_a: 'influence', metric_b: 'search_volume' },
];

function correlationStrength(r) {
  const abs = Math.abs(r);
  if (abs >= 0.7) return 'strong';
  if (abs >= 0.4) return 'moderate';
  return 'weak';
}

function analyzeCross(dimensions, timeSeries = {}) {
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
      const dirLabel = r > 0 ? '正' : '負';
      correlations.push({
        dim_a: pair.dim_a, dim_b: pair.dim_b, metric_a: pair.metric_a, metric_b: pair.metric_b,
        correlation: parseFloat(r.toFixed(3)), strength,
        insight: `${pair.metric_a} 與 ${pair.metric_b} 呈${strength === 'strong' ? '高度' : strength === 'moderate' ? '中度' : '低度'}${dirLabel}相關（r=${r.toFixed(2)}）`,
      });
    }
  }

  let score = 50;
  const strengths = [];
  const weaknesses = [];

  const sentiment = dimensions.sentiment?.derived_metrics;
  if (sentiment) {
    if (sentiment.net_sentiment_score > 30) { score += 15; strengths.push('net_sentiment_score'); }
    else if (sentiment.net_sentiment_score < 0) { score -= 15; weaknesses.push('net_sentiment_score'); }
  }

  const trend = dimensions.trend?.derived_metrics;
  if (trend) {
    if (trend.trend_direction === 'up') { score += 15; strengths.push('growth_rate'); }
    else if (trend.trend_direction === 'down') { score -= 15; weaknesses.push('growth_rate'); }
  }

  const social = dimensions.social_overview?.derived_metrics;
  if (social) {
    if (social.engagement_rate > 2) { score += 10; strengths.push('engagement_rate'); }
    else if (social.engagement_rate < 1) { score -= 10; weaknesses.push('engagement_rate'); }
  }

  const positiveCount = Object.values(dimensions).flatMap(d => d.insights || []).filter(i => i.severity === 'positive').length;
  score += Math.min(positiveCount * 2, 10);
  score = Math.max(0, Math.min(100, score));

  let quadrant;
  if (score >= 70) quadrant = 'leader';
  else if (score >= 50) quadrant = 'challenger';
  else if (score >= 30) quadrant = 'niche';
  else quadrant = 'follower';

  return { correlations: correlations.slice(0, 5), anomalies, market_position: { overall_score: score, quadrant, strengths, weaknesses } };
}

module.exports = { analyzeCross };
