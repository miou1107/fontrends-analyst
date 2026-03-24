const { compareCompetitor } = require('../analyzers/competitor-comparator');

describe('competitor-comparator', () => {
  const selfMetrics = { influence: 4248000, engagement_rate: 3.2 };

  test('primary comparison with multiplier and advantage', () => {
    const primary = { brand: 'Gucci', metrics: { influence: 1118000, engagement_rate: 2.1 } };
    const result = compareCompetitor(selfMetrics, primary, []);
    expect(result.primary.brand).toBe('Gucci');
    expect(result.primary.metrics.influence.multiplier).toBeCloseTo(3.8, 0);
    expect(result.primary.metrics.influence.advantage).toBe('self');
  });
  test('competitor advantage when competitor is higher', () => {
    const primary = { brand: 'Gucci', metrics: { influence: 5000000 } };
    const result = compareCompetitor(selfMetrics, primary, []);
    expect(result.primary.metrics.influence.advantage).toBe('competitor');
  });
  test('market ranking with >= 3 brands', () => {
    const primary = { brand: 'Gucci', metrics: { influence: 1118000 } };
    const market = [{ brand: 'Hermes', influence: 3000000 }, { brand: 'Chanel', influence: 2000000 }, { brand: 'Dior', influence: 1500000 }];
    const result = compareCompetitor(selfMetrics, primary, market);
    expect(result.market.ranking.influence.rank).toBe(1);
    expect(result.market.ranking.influence.total).toBe(5);
    expect(result.market.market_share_estimate).toBeGreaterThan(0);
  });
  test('no market ranking with < 3 total brands', () => {
    const result = compareCompetitor(selfMetrics, { brand: 'Gucci', metrics: { influence: 1118000 } }, []);
    expect(result.market.ranking).toEqual({});
    expect(result.market.market_share_estimate).toBeNull();
  });
  test('returns null when self metrics is null', () => {
    expect(compareCompetitor(null, { brand: 'Gucci', metrics: {} }, [])).toBeNull();
  });
});
