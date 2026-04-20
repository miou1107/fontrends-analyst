'use strict';

const { getAffinityWeights } = require('../affinity-table');
const { resolveProfile } = require('../../../knowledge-loader');
const snap = resolveProfile('brand-social');
const PURPOSE_TYPES = snap.get('dimensions.affinity_purpose_types');
const DIMENSIONS = snap.get('dimensions.affinity_dimensions');

describe('getAffinityWeights', () => {
  test('sell-venue returns expected high-affinity dimensions', () => {
    const w = getAffinityWeights('sell-venue', snap);
    expect(w.trend).toBeGreaterThanOrEqual(0.8);
    expect(w.platform).toBeGreaterThanOrEqual(0.6);
    expect(w.search).toBeGreaterThanOrEqual(0.7);
    expect(w.kol).toBeGreaterThanOrEqual(0.7);
  });

  test('brand-review returns expected high-affinity dimensions', () => {
    const w = getAffinityWeights('brand-review', snap);
    expect(w.trend).toBeGreaterThanOrEqual(0.8);
    expect(w.sentiment).toBeGreaterThanOrEqual(0.7);
    expect(w.competitor).toBeGreaterThanOrEqual(0.7);
    expect(w.social_overview).toBeGreaterThanOrEqual(0.7);
  });

  test('unknown purpose type returns all 0.5', () => {
    const w = getAffinityWeights('totally-unknown', snap);
    for (const dim of DIMENSIONS) {
      expect(w[dim]).toBe(0.5);
    }
  });

  test('all known purpose types return weights for all dimensions', () => {
    for (const pt of PURPOSE_TYPES) {
      const w = getAffinityWeights(pt, snap);
      for (const dim of DIMENSIONS) {
        expect(w[dim]).toBeGreaterThanOrEqual(0);
        expect(w[dim]).toBeLessThanOrEqual(1);
      }
    }
  });
});
