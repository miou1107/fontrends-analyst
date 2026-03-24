const { detectAnomalies } = require('../analyzers/anomaly-detector');

describe('anomaly-detector', () => {
  test('detects IQR outlier in skewed data', () => {
    const values = [100, 120, 130, 150, 200, 2700000];
    const result = detectAnomalies('kol_influence', values, { method: 'iqr' });
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(2700000);
  });
  test('returns empty array for normal data', () => {
    const values = [100, 105, 110, 108, 103];
    expect(detectAnomalies('metric', values, { method: 'zscore' })).toEqual([]);
  });
  test('returns empty for empty array', () => { expect(detectAnomalies('metric', [], { method: 'zscore' })).toEqual([]); });
  test('returns empty for null', () => { expect(detectAnomalies('metric', null, { method: 'zscore' })).toEqual([]); });
  test('respects custom zscore threshold', () => {
    const values = [100, 100, 100, 100, 200];
    const strict = detectAnomalies('m', values, { method: 'zscore', threshold: 1.5 });
    const loose = detectAnomalies('m', values, { method: 'zscore', threshold: 3.0 });
    expect(strict.length).toBeGreaterThanOrEqual(loose.length);
  });
});
