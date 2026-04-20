'use strict';
const { resolveProfile } = require('../../../knowledge-loader');
const snap = resolveProfile('brand-social');


const { computeSignalScore } = require('../scorers/signal-scorer');

describe('computeSignalScore', () => {
  test('returns 0 for empty dimension', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    expect(computeSignalScore(dim, snap)).toBe(0);
  });

  test('insight_signal: 3 insights = max 0.35', () => {
    const dim = {
      insights: [{ type: 'growth' }, { type: 'decline' }, { type: 'anomaly' }],
      anomalies: [], self_comparison: { mom: null }, competitor_comparison: null,
    };
    expect(computeSignalScore(dim, snap)).toBeCloseTo(0.35, 2);
  });

  test('insight_signal: 5 insights still caps at 0.35', () => {
    const dim = {
      insights: Array(5).fill({ type: 'growth' }),
      anomalies: [], self_comparison: { mom: null }, competitor_comparison: null,
    };
    expect(computeSignalScore(dim, snap)).toBeCloseTo(0.35, 2);
  });

  test('anomaly_signal: 2 anomalies = max 0.25', () => {
    const dim = {
      insights: [], anomalies: [{ metric: 'a' }, { metric: 'b' }],
      self_comparison: { mom: null }, competitor_comparison: null,
    };
    expect(computeSignalScore(dim, snap)).toBeCloseTo(0.25, 2);
  });

  test('change_signal: max |change_pct| = 50 → 0.25', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { metric_a: { change_pct: 50 }, metric_b: { change_pct: -30 } } },
      competitor_comparison: null,
    };
    expect(computeSignalScore(dim, snap)).toBeCloseTo(0.25, 2);
  });

  test('change_signal: max |change_pct| = 100 still caps at 0.25', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { x: { change_pct: 100 } } },
      competitor_comparison: null,
    };
    expect(computeSignalScore(dim, snap)).toBeCloseTo(0.25, 2);
  });

  test('compete_signal: competitor present → 0.15', () => {
    const dim = {
      insights: [], anomalies: [], self_comparison: { mom: null },
      competitor_comparison: { primary: { brand: 'Chanel' }, market: null },
    };
    expect(computeSignalScore(dim, snap)).toBeCloseTo(0.15, 2);
  });

  test('compete_signal: market only (no primary) → 0', () => {
    const dim = {
      insights: [], anomalies: [], self_comparison: { mom: null },
      competitor_comparison: { primary: null, market: { brands: ['A'] } },
    };
    expect(computeSignalScore(dim, snap)).toBe(0);
  });

  test('all signals maxed → 1.0', () => {
    const dim = {
      insights: [{ type: 'a' }, { type: 'b' }, { type: 'c' }],
      anomalies: [{ metric: 'x' }, { metric: 'y' }],
      self_comparison: { mom: { m: { change_pct: 60 } } },
      competitor_comparison: { primary: { brand: 'X' } },
    };
    expect(computeSignalScore(dim, snap)).toBeCloseTo(1.0, 2);
  });

  test('self_comparison null → change_signal = 0', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: null,
      competitor_comparison: null,
    };
    expect(computeSignalScore(dim, snap)).toBe(0);
  });
});
