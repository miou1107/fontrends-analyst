'use strict';

const { computeSignalStrength } = require('../signal-scorer');

describe('computeSignalStrength', () => {
  test('returns 1.0 when dimension has anomalies', () => {
    const dim = { anomalies: [{ metric: 'x', value: 100 }], insights: [] };
    expect(computeSignalStrength(dim)).toBe(1.0);
  });

  test('returns 0.8 for growth insight', () => {
    const dim = { anomalies: [], insights: [{ type: 'growth', severity: 'positive' }] };
    expect(computeSignalStrength(dim)).toBe(0.8);
  });

  test('returns 0.8 for decline insight', () => {
    const dim = { anomalies: [], insights: [{ type: 'decline', severity: 'negative' }] };
    expect(computeSignalStrength(dim)).toBe(0.8);
  });

  test('returns 0.5 for normal data', () => {
    const dim = { anomalies: [], insights: [{ type: 'leader', severity: 'positive' }], derived_metrics: { x: 1 } };
    expect(computeSignalStrength(dim)).toBe(0.5);
  });

  test('returns 0.2 for empty dimension', () => {
    expect(computeSignalStrength({})).toBe(0.2);
    expect(computeSignalStrength(null)).toBe(0.2);
  });

  test('anomaly takes priority over growth', () => {
    const dim = {
      anomalies: [{ metric: 'x' }],
      insights: [{ type: 'growth', severity: 'positive' }],
    };
    expect(computeSignalStrength(dim)).toBe(1.0);
  });
});
