// engines/analysis/__tests__/base-analyzer.test.js
const { analyzeDimension } = require('../analyzers/base-analyzer');

describe('base-analyzer', () => {
  test('social_overview: computes engagement_rate and avg_interaction_per_post', () => {
    const data = { influence: 4248000, posts: 107000, likes: 33314000, comments: 548000, shares: 275000, site_avg_influence: 736000 };
    const result = analyzeDimension('social_overview', data);
    expect(result.engagement_rate).toBeCloseTo((33314000 + 548000 + 275000) / 107000 / 100, 0);
    expect(result.avg_interaction_per_post).toBeCloseTo((33314000 + 548000 + 275000) / 107000, 0);
    expect(result.influence_density).toBeCloseTo(4248000 / 107000, 0);
  });

  test('trend: computes growth_rate and momentum_score', () => {
    const data = { monthly: [
      { month: '2024/04', influence: 20000 },
      { month: '2024/09', influence: 180000 },
      { month: '2024/11', influence: 350000 },
      { month: '2024/12', influence: 950000 },
      { month: '2025/01', influence: 950000 },
    ]};
    const result = analyzeDimension('trend', data);
    expect(result.growth_rate).toBeDefined();
    expect(result.trend_direction).toMatch(/up|down|flat/);
    expect(result.peak_month).toBe('2024/12');
  });

  test('language: computes dominant_language_pct', () => {
    const data = { english: 66.7, chinese: 27.8, japanese: 2.1, other: 3.4, total_articles: 107032 };
    const result = analyzeDimension('language_distribution', data);
    expect(result.dominant_language).toBe('english');
    expect(result.dominant_language_pct).toBe(66.7);
  });

  test('platform: computes platform_efficiency and concentration_index', () => {
    const data = { items: [
      { name: 'Instagram', influence: 3223000, posts: 15000, share: 75.9 },
      { name: 'Threads', influence: 454000, posts: 16000, share: 10.7 },
      { name: 'Facebook', influence: 313000, posts: 42000, share: 7.4 },
    ]};
    const result = analyzeDimension('platform', data);
    expect(result.platform_efficiency).toBeDefined();
    expect(result.concentration_index).toBeGreaterThan(0);
    expect(result.top_platform).toBe('Instagram');
  });

  test('kol: computes kol_coverage and top_kol_contribution', () => {
    const data = { items: [
      { rank: 1, name: 'louisvuitton', influence: 2700000, type: '官方' },
      { rank: 2, name: 'pharrell', influence: 200000, type: '創意總監' },
      { rank: 3, name: 'leeyufen', influence: 150000, type: '明星藝人' },
    ]};
    const result = analyzeDimension('kol', data);
    expect(result.total_kol_influence).toBe(3050000);
    expect(result.top_kol_contribution_pct).toBeGreaterThan(80);
    expect(result.kol_count).toBe(3);
    expect(result.kol_coverage).toBe(3);
  });

  test('sentiment: computes net_sentiment_score', () => {
    const data = { positive: 53.0, neutral: 36.1, negative: 10.9 };
    const result = analyzeDimension('sentiment', data);
    expect(result.positive_ratio).toBe(53.0);
    expect(result.negative_ratio).toBe(10.9);
    expect(result.net_sentiment_score).toBeCloseTo(42.1, 1);
  });

  test('search_intent: computes search_volume_index', () => {
    const data = { weighted_index: 290000000, keyword_count: 377, monthly_avg: 20590 };
    const result = analyzeDimension('search_intent', data);
    expect(result.search_volume_index).toBe(290000000);
    expect(result.avg_volume_per_keyword).toBeCloseTo(290000000 / 377, 0);
  });

  test('competitor_data: passes through raw metrics', () => {
    const data = { influence: 1118000, likes: 7015000, sentiment_positive: 50.2 };
    const result = analyzeDimension('competitor_data', data);
    expect(result.influence).toBe(1118000);
  });

  test('returns null for unknown dimension', () => { expect(analyzeDimension('unknown', {})).toBeNull(); });
  test('returns null for null data', () => { expect(analyzeDimension('social_overview', null)).toBeNull(); });
});
