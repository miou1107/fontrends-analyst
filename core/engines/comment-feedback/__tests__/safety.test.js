'use strict';

const { shouldDryRun, formatDryRunReport, wrapWithRetry } = require('../safety');

describe('shouldDryRun', () => {
  test('returns true when requests > threshold', () => {
    expect(shouldDryRun(6, 5)).toBe(true);
  });

  test('returns false when requests <= threshold', () => {
    expect(shouldDryRun(5, 5)).toBe(false);
    expect(shouldDryRun(3, 5)).toBe(false);
  });
});

describe('formatDryRunReport', () => {
  test('formats request list for user review', () => {
    const items = [
      { commentId: 'c1', intent: 'style', action: '字體改 36pt' },
      { commentId: 'c2', intent: 'delete', action: '刪除第3頁' },
    ];
    const report = formatDryRunReport(items);
    expect(report).toContain('c1');
    expect(report).toContain('style');
    expect(report).toContain('delete');
  });
});

describe('wrapWithRetry', () => {
  test('succeeds on first try', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await wrapWithRetry(fn, 2);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on 409 error', async () => {
    const err409 = new Error('Conflict'); err409.code = 409;
    const fn = jest.fn()
      .mockRejectedValueOnce(err409)
      .mockResolvedValue('ok');
    const result = await wrapWithRetry(fn, 2);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('throws after max retries', async () => {
    const err409 = new Error('Conflict'); err409.code = 409;
    const fn = jest.fn().mockRejectedValue(err409);
    await expect(wrapWithRetry(fn, 2)).rejects.toThrow('Conflict');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('does not retry on non-409 errors', async () => {
    const err500 = new Error('Server'); err500.code = 500;
    const fn = jest.fn().mockRejectedValue(err500);
    await expect(wrapWithRetry(fn, 2)).rejects.toThrow('Server');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
