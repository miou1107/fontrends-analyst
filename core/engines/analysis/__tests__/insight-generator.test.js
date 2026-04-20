const { generateInsights } = require('../analyzers/insight-generator');
const { resolveProfile } = require('../../../knowledge-loader');
const snap = resolveProfile('brand-social');

describe('insight-generator', () => {
  test('generates growth insight for MoM > 10%', () => {
    const input = { self_comparison: { mom: { engagement_rate: { current: 3.2, previous: 2.8, change_pct: 14.3, direction: 'up' } } } };
    const insights = generateInsights(input, snap);
    const growth = insights.find(i => i.type === 'growth');
    expect(growth).toBeDefined();
    expect(growth.text).toContain('14.3%');
    expect(growth.severity).toBe('positive');
  });

  test('generates decline insight for MoM < -10%', () => {
    const input = { self_comparison: { mom: { engagement_rate: { current: 2.0, previous: 3.0, change_pct: -33.3, direction: 'down' } } } };
    const insights = generateInsights(input, snap);
    const decline = insights.find(i => i.type === 'decline');
    expect(decline).toBeDefined();
    expect(decline.severity).toBe('negative');
  });

  test('generates anomaly insight', () => {
    const input = { anomalies: [{ metric: 'influence', value: 950000, expected: 300000, z_score: 2.8 }] };
    const insights = generateInsights(input, snap);
    const anomaly = insights.find(i => i.type === 'anomaly');
    expect(anomaly).toBeDefined();
    expect(anomaly.severity).toBe('warning');
  });

  test('generates leader insight for rank 1', () => {
    const input = { competitor_comparison: { market: { ranking: { influence: { rank: 1, total: 5, percentile: 100 } } } } };
    const insights = generateInsights(input, snap);
    const leader = insights.find(i => i.type === 'leader');
    expect(leader).toBeDefined();
    expect(leader.severity).toBe('positive');
  });

  test('generates correlation insight', () => {
    const input = { correlations: [{ metric_a: 'influence', metric_b: 'search_volume', correlation: 0.87, strength: 'strong' }] };
    const insights = generateInsights(input, snap);
    const corr = insights.find(i => i.type === 'correlation');
    expect(corr).toBeDefined();
    expect(corr.severity).toBe('neutral');
    expect(corr.text).toContain('0.87');
  });

  test('dedup: same metric decline + laggard keeps only one', () => {
    const input = {
      self_comparison: { mom: { engagement_rate: { current: 2.0, previous: 3.0, change_pct: -33.3, direction: 'down' } } },
      competitor_comparison: { market: { ranking: { engagement_rate: { rank: 4, total: 5, percentile: 20 } } } },
    };
    const insights = generateInsights(input, snap);
    const engInsights = insights.filter(i => i.evidence.metric === 'engagement_rate');
    expect(engInsights.length).toBe(1);
  });

  test('max 5 insights per call', () => {
    const input = { self_comparison: { mom: {
      m1: { change_pct: 50, direction: 'up' }, m2: { change_pct: 40, direction: 'up' },
      m3: { change_pct: 30, direction: 'up' }, m4: { change_pct: 20, direction: 'up' },
      m5: { change_pct: 15, direction: 'up' }, m6: { change_pct: 12, direction: 'up' },
    }}};
    const insights = generateInsights(input, snap);
    expect(insights.length).toBeLessThanOrEqual(5);
  });

  test('returns empty for null input', () => { expect(generateInsights(null, snap)).toEqual([]); });
});
