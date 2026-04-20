const { detectAnomalies } = require('../analyzers/anomaly-detector');
const { resolveProfile } = require('../../../knowledge-loader');
const snap = resolveProfile('brand-social');

describe('anomaly-detector', () => {
  test('detects IQR outlier in skewed data', () => {
    const values = [100, 120, 130, 150, 200, 2700000];
    const result = detectAnomalies('kol_influence', values, { method: 'iqr' }, snap);
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(2700000);
  });
  test('returns empty array for normal data', () => {
    const values = [100, 105, 110, 108, 103];
    expect(detectAnomalies('metric', values, { method: 'zscore' }, snap)).toEqual([]);
  });
  test('returns empty for empty array', () => { expect(detectAnomalies('metric', [], { method: 'zscore' }, snap)).toEqual([]); });
  test('returns empty for null', () => { expect(detectAnomalies('metric', null, { method: 'zscore' }, snap)).toEqual([]); });
  test('respects custom zscore threshold', () => {
    const values = [100, 100, 100, 100, 200];
    const strict = detectAnomalies('m', values, { method: 'zscore', threshold: 1.5 }, snap);
    const loose = detectAnomalies('m', values, { method: 'zscore', threshold: 3.0 }, snap);
    expect(strict.length).toBeGreaterThanOrEqual(loose.length);
  });
  test('throws without snapshot', () => {
    expect(() => detectAnomalies('m', [1,2,3], {})).toThrow(/snapshot required/);
  });
});
