'use strict';

const { mean, direction, changePct } = require('../utils/stats');

const ANALYZERS = {
  social_overview(data) {
    const totalInteractions = (data.likes || 0) + (data.comments || 0) + (data.shares || 0);
    const posts = data.posts || 1;
    return {
      engagement_rate: totalInteractions / posts / 100,
      avg_interaction_per_post: totalInteractions / posts,
      influence_density: (data.influence || 0) / posts,
      total_interactions: totalInteractions,
    };
  },

  trend(data) {
    if (!data.monthly || data.monthly.length === 0) return {};
    const values = data.monthly.map(m => m.influence);
    const first = values[0];
    const last = values[values.length - 1];
    const growthRate = changePct(last, first);
    const recentAvg = mean(values.slice(-2));
    const earlierAvg = mean(values.slice(0, 2));
    const momentumScore = changePct(recentAvg, earlierAvg);
    const maxVal = Math.max(...values);
    const peakIdx = values.indexOf(maxVal);
    return {
      growth_rate: growthRate,
      trend_direction: direction(growthRate),
      momentum_score: momentumScore,
      peak_month: data.monthly[peakIdx].month,
      peak_influence: maxVal,
      total_months: data.monthly.length,
    };
  },

  language(data) {
    const langs = { english: data.english, chinese: data.chinese, japanese: data.japanese, other: data.other };
    const entries = Object.entries(langs).filter(([, v]) => v != null);
    entries.sort((a, b) => b[1] - a[1]);
    const dominant = entries[0] || ['unknown', 0];
    const hhi = entries.reduce((s, [, pct]) => s + (pct / 100) ** 2, 0);
    return {
      dominant_language: dominant[0],
      dominant_language_pct: dominant[1],
      language_diversity_index: parseFloat((1 - hhi).toFixed(4)),
      total_articles: data.total_articles || 0,
    };
  },

  platform(data) {
    if (!data.items || data.items.length === 0) return {};
    const sorted = [...data.items].sort((a, b) => b.influence - a.influence);
    const totalInfluence = sorted.reduce((s, p) => s + p.influence, 0);
    const efficiency = sorted.map(p => ({ name: p.name, efficiency: p.posts > 0 ? p.influence / p.posts : 0 }));
    const hhi = sorted.reduce((s, p) => s + ((p.share || 0) / 100) ** 2, 0);
    return {
      top_platform: sorted[0].name,
      platform_efficiency: efficiency,
      concentration_index: parseFloat(hhi.toFixed(4)),
      platform_count: sorted.length,
      total_influence: totalInfluence,
    };
  },

  kol(data) {
    if (!data.items || data.items.length === 0) return {};
    const total = data.items.reduce((s, k) => s + k.influence, 0);
    const topContribution = total > 0 ? (data.items[0].influence / total) * 100 : 0;
    const types = {};
    data.items.forEach(k => { types[k.type] = (types[k.type] || 0) + 1; });
    return {
      total_kol_influence: total,
      top_kol_contribution_pct: parseFloat(topContribution.toFixed(1)),
      kol_count: data.items.length,
      kol_type_distribution: types,
      avg_kol_influence: parseFloat((total / data.items.length).toFixed(0)),
      kol_coverage: data.items.length,
    };
  },

  sentiment(data) {
    return {
      positive_ratio: data.positive,
      negative_ratio: data.negative,
      neutral_ratio: data.neutral,
      net_sentiment_score: parseFloat(((data.positive || 0) - (data.negative || 0)).toFixed(1)),
    };
  },

  search_intent(data) {
    const kwCount = data.keyword_count || 1;
    return {
      search_volume_index: data.weighted_index,
      keyword_count: data.keyword_count,
      monthly_avg: data.monthly_avg,
      avg_volume_per_keyword: parseFloat((data.weighted_index / kwCount).toFixed(0)),
      brand_vs_generic_ratio: null,
    };
  },

  competitor_data(data) {
    return { ...data, competitive_gap_score: null };
  },
};

const PAGE_KEY_MAP = {
  social_overview: 'social_overview',
  language_distribution: 'language',
  trend: 'trend',
  platform: 'platform',
  kol: 'kol',
  sentiment: 'sentiment',
  search_intent: 'search_intent',
  competitor_data: 'competitor_data',
};

function analyzeDimension(pageKey, data) {
  if (!data) return null;
  const analyzerKey = PAGE_KEY_MAP[pageKey] || pageKey;
  const analyzer = ANALYZERS[analyzerKey];
  if (!analyzer) return null;
  return analyzer(data);
}

module.exports = { analyzeDimension, PAGE_KEY_MAP };
