'use strict';
const { resolveProfile } = require('../../../knowledge-loader');
const snap = resolveProfile('brand-social');


const { generateHook, templateBasedHook } = require('../hook-generator');

describe('templateBasedHook', () => {
  test('sell-venue + trend produces hook with brand and venue', () => {
    const ctx = {
      brand: 'Louis Vuitton',
      venue: '台北101',
      dimension: 'trend',
      metrics: { mom_growth: 54.5 },
      insightType: 'growth',
      season: 'Q4',
    };
    const hook = templateBasedHook('sell-venue', 'trend', ctx, snap);
    expect(hook).toContain('Louis Vuitton');
    expect(hook).toContain('101');
    expect(hook).toContain('54.5');
  });

  test('sell-venue + platform produces hook', () => {
    const ctx = {
      brand: 'LV',
      venue: '台北101',
      dimension: 'platform',
      metrics: { top_platform: 'Instagram' },
    };
    const hook = templateBasedHook('sell-venue', 'platform', ctx, snap);
    expect(hook).toContain('Instagram');
    expect(hook).toContain('101');
  });

  test('returns null for unknown purpose + dimension combo', () => {
    const ctx = { brand: 'X', venue: 'Y', dimension: 'xyz', metrics: {} };
    expect(templateBasedHook('unknown-purpose', 'xyz', ctx, snap)).toBeNull();
  });

  test('returns null when no template for dimension', () => {
    const ctx = { brand: 'X', venue: 'Y', dimension: 'language', metrics: {} };
    expect(templateBasedHook('sell-venue', 'language', ctx, snap)).toBeNull();
  });

  test('handles missing metrics gracefully', () => {
    const ctx = { brand: 'LV', venue: '101', dimension: 'trend', metrics: {} };
    const hook = templateBasedHook('sell-venue', 'trend', ctx, snap);
    expect(hook === null || typeof hook === 'string').toBe(true);
  });
});

describe('generateHook', () => {
  test('without LLM uses template-based', async () => {
    const ctx = {
      brand: 'LV', venue: '台北101', dimension: 'trend',
      metrics: { mom_growth: 54.5 }, insightType: 'growth', season: 'Q4',
    };
    const hook = await generateHook('sell-venue', 'trend', ctx, {}, snap);
    expect(typeof hook === 'string' || hook === null).toBe(true);
  });

  test('with llmProvider calls the provider', async () => {
    const provider = jest.fn().mockResolvedValue('LLM 潤飾後的 hook');
    const ctx = { brand: 'LV', venue: '101', dimension: 'trend', metrics: {} };
    const hook = await generateHook('sell-venue', 'trend', ctx, {
      useLLM: true,
      llmProvider: provider,
    }, snap);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(hook).toBe('LLM 潤飾後的 hook');
  });
});
