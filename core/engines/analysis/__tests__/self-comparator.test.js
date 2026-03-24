const { compareSelf } = require('../analyzers/self-comparator');

describe('self-comparator', () => {
  test('computes MoM comparison for numeric metrics', () => {
    const current = { engagement_rate: 3.2, avg_interaction_per_post: 1250 };
    const previous = { engagement_rate: 2.8, avg_interaction_per_post: 1100 };
    const result = compareSelf(current, previous);
    expect(result.engagement_rate.current).toBe(3.2);
    expect(result.engagement_rate.previous).toBe(2.8);
    expect(result.engagement_rate.change_pct).toBeCloseTo(14.3, 0);
    expect(result.engagement_rate.direction).toBe('up');
  });
  test('returns null when previous is null', () => { expect(compareSelf({ engagement_rate: 3.2 }, null)).toBeNull(); });
  test('skips non-numeric fields', () => {
    const result = compareSelf({ top_platform: 'Instagram', engagement_rate: 3.2 }, { top_platform: 'Instagram', engagement_rate: 2.8 });
    expect(result.top_platform).toBeUndefined();
    expect(result.engagement_rate).toBeDefined();
  });
  test('handles metric missing in previous', () => {
    const result = compareSelf({ engagement_rate: 3.2, new_metric: 100 }, { engagement_rate: 2.8 });
    expect(result.engagement_rate.direction).toBe('up');
    expect(result.new_metric).toBeUndefined();
  });
  test('flat direction for small changes', () => {
    const result = compareSelf({ engagement_rate: 3.02 }, { engagement_rate: 3.0 });
    expect(result.engagement_rate.direction).toBe('flat');
  });
});
