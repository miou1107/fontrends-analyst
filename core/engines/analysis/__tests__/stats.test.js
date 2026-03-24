// engines/analysis/__tests__/stats.test.js
const {
  mean, stddev, zScore, percentile, pearson, iqr,
  changePct, direction, multiplier
} = require('../utils/stats');

describe('stats', () => {
  describe('mean', () => {
    test('calculates arithmetic mean', () => { expect(mean([2, 4, 6])).toBe(4); });
    test('returns null for empty array', () => { expect(mean([])).toBeNull(); });
    test('handles single element', () => { expect(mean([5])).toBe(5); });
  });
  describe('stddev', () => {
    test('calculates population standard deviation', () => { expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 1); });
    test('returns null for empty array', () => { expect(stddev([])).toBeNull(); });
  });
  describe('zScore', () => {
    test('calculates z-score of value against array', () => { const arr = [2, 4, 4, 4, 5, 5, 7, 9]; const z = zScore(9, arr); expect(z).toBeGreaterThan(1.5); });
    test('returns null for empty array', () => { expect(zScore(5, [])).toBeNull(); });
    test('returns null when stddev is 0', () => { expect(zScore(5, [5, 5, 5])).toBeNull(); });
  });
  describe('percentile', () => {
    test('calculates 50th percentile (median)', () => { expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3); });
    test('calculates 25th percentile', () => { expect(percentile([1, 2, 3, 4, 5, 6, 7, 8], 25)).toBe(2.75); });
    test('returns null for empty array', () => { expect(percentile([], 50)).toBeNull(); });
  });
  describe('pearson', () => {
    test('perfect positive correlation', () => { expect(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1.0, 5); });
    test('perfect negative correlation', () => { expect(pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1.0, 5); });
    test('returns null for arrays shorter than 5', () => { expect(pearson([1, 2, 3], [4, 5, 6])).toBeNull(); });
    test('returns null for mismatched lengths', () => { expect(pearson([1, 2, 3, 4, 5], [1, 2, 3])).toBeNull(); });
  });
  describe('iqr', () => {
    test('calculates IQR', () => {
      const result = iqr([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(result.q1).toBeCloseTo(2.75, 1);
      expect(result.q3).toBeCloseTo(6.25, 1);
      expect(result.iqr).toBeCloseTo(3.5, 1);
      expect(result.lowerFence).toBeCloseTo(-2.5, 0);
      expect(result.upperFence).toBeCloseTo(11.5, 0);
    });
    test('returns null for empty array', () => { expect(iqr([])).toBeNull(); });
  });
  describe('changePct', () => {
    test('positive change', () => { expect(changePct(120, 100)).toBeCloseTo(20.0, 1); });
    test('negative change', () => { expect(changePct(80, 100)).toBeCloseTo(-20.0, 1); });
    test('returns null when previous is 0', () => { expect(changePct(100, 0)).toBeNull(); });
    test('returns null for null inputs', () => { expect(changePct(null, 100)).toBeNull(); });
  });
  describe('direction', () => {
    test('up when change > threshold', () => { expect(direction(15)).toBe('up'); });
    test('down when change < -threshold', () => { expect(direction(-15)).toBe('down'); });
    test('flat within default 1% threshold', () => { expect(direction(0.5)).toBe('flat'); });
    test('custom threshold', () => { expect(direction(3, 5)).toBe('flat'); expect(direction(6, 5)).toBe('up'); });
  });
  describe('multiplier', () => {
    test('calculates a/b ratio', () => { expect(multiplier(200, 100)).toBeCloseTo(2.0, 1); });
    test('returns null when b is 0', () => { expect(multiplier(100, 0)).toBeNull(); });
  });
});
