'use strict';

const { getIntentBoost, getPurposeFactor } = require('../scorers/intent-scorer');

describe('getIntentBoost', () => {
  test('dimension in focus_dimensions → 1.5', () => {
    const brand = { focus_dimensions: ['kol', 'trend'] };
    expect(getIntentBoost('kol', brand)).toBe(1.5);
  });

  test('dimension NOT in focus_dimensions → 1.0', () => {
    const brand = { focus_dimensions: ['kol', 'trend'] };
    expect(getIntentBoost('sentiment', brand)).toBe(1.0);
  });

  test('no focus_dimensions → 1.0', () => {
    expect(getIntentBoost('kol', {})).toBe(1.0);
    expect(getIntentBoost('kol', { name: 'LV' })).toBe(1.0);
  });

  test('null brand → 1.0', () => {
    expect(getIntentBoost('kol', null)).toBe(1.0);
  });

  test('empty focus_dimensions → 1.0', () => {
    expect(getIntentBoost('kol', { focus_dimensions: [] })).toBe(1.0);
  });
});

describe('getPurposeFactor', () => {
  test('returns purpose_factor from bindings', () => {
    const bindings = [
      { dimension: 'trend', relevance_score: 0.9 },
      { dimension: 'platform', relevance_score: 0.3 },
    ];
    expect(getPurposeFactor('trend', bindings)).toBeCloseTo(0.95);
    expect(getPurposeFactor('platform', bindings)).toBeCloseTo(0.65);
  });

  test('returns 0.5 for dimension not in bindings', () => {
    const bindings = [{ dimension: 'trend', relevance_score: 0.9 }];
    expect(getPurposeFactor('kol', bindings)).toBe(0.5);
  });

  test('returns 1.0 when no bindings provided', () => {
    expect(getPurposeFactor('trend', null)).toBe(1.0);
    expect(getPurposeFactor('trend', undefined)).toBe(1.0);
    expect(getPurposeFactor('trend', [])).toBe(1.0);
  });
});
