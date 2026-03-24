const { analyzeCross } = require('../analyzers/cross-analyzer');

describe('cross-analyzer', () => {
  const dimensions = {
    social_overview: { derived_metrics: { engagement_rate: 3.2, influence: 4248000 }, insights: [{ type: 'growth', severity: 'positive' }] },
    trend: { derived_metrics: { growth_rate: 4650, trend_direction: 'up' } },
    sentiment: { derived_metrics: { net_sentiment_score: 42.1 } },
  };

  test('computes correlations when monthly data available', () => {
    const result = analyzeCross(dimensions, {
      monthly_influence: [20000, 180000, 350000, 950000, 950000],
      monthly_search: [10000, 90000, 200000, 500000, 480000],
    });
    expect(result.correlations.length).toBeGreaterThan(0);
    expect(result.correlations[0].correlation).toBeDefined();
    expect(result.correlations[0].strength).toMatch(/strong|moderate|weak/);
  });

  test('skips correlation when n < 5', () => {
    const result = analyzeCross(dimensions, { monthly_influence: [100, 200, 300], monthly_search: [50, 100, 150] });
    expect(result.correlations).toEqual([]);
  });

  test('computes market position', () => {
    const result = analyzeCross(dimensions, {});
    expect(result.market_position.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.market_position.overall_score).toBeLessThanOrEqual(100);
    expect(result.market_position.quadrant).toMatch(/leader|challenger|niche|follower/);
    expect(result.market_position.strengths).toBeDefined();
    expect(result.market_position.weaknesses).toBeDefined();
  });

  test('returns empty structure for null dimensions', () => {
    const result = analyzeCross(null, {});
    expect(result.correlations).toEqual([]);
    expect(result.market_position.overall_score).toBe(0);
  });
});
