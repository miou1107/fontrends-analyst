'use strict';

const { bindPurpose } = require('../purpose-binder');

const mockAnalysis = {
  dimensions: {
    trend: {
      anomalies: [{ metric: 'influence', value: 500, expected: 100 }],
      insights: [{ type: 'growth', severity: 'positive', text: 'MoM +54%' }],
      derived_metrics: { mom_growth: 54.5 },
    },
    platform: {
      anomalies: [],
      insights: [{ type: 'leader', severity: 'positive' }],
      derived_metrics: { platform_efficiency: 0.85, top_platform: 'Instagram' },
    },
    sentiment: {
      anomalies: [],
      insights: [],
      derived_metrics: { positive_ratio: 0.65 },
    },
  },
};

const mockInterview = {
  purpose: 'sell-venue',
  venue: { name: '台北101', characteristics: ['地標', '觀光'] },
};

const mockBrand = { name: 'Louis Vuitton', industry: 'luxury' };

describe('bindPurpose', () => {
  test('produces bindings for all dimensions in analysis', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand);
    expect(result.meta.purpose).toBe('sell-venue');
    expect(result.meta.brand).toBe('Louis Vuitton');
    expect(result.meta.venue).toBe('台北101');
    expect(result.bindings).toHaveLength(3);
  });

  test('trend has highest relevance due to anomaly', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand);
    const trend = result.bindings.find(b => b.dimension === 'trend');
    expect(trend.relevance_score).toBe(0.9);
  });

  test('bindings include hooks where templates exist', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand);
    const trend = result.bindings.find(b => b.dimension === 'trend');
    expect(trend.hook).toBeTruthy();
    expect(trend.hook).toContain('Louis Vuitton');
  });

  test('CLI purpose override works', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand, {
      purposeOverride: 'brand-review',
    });
    expect(result.meta.purpose).toBe('brand-review');
  });

  test('missing interview returns null', async () => {
    const result = await bindPurpose(mockAnalysis, null, mockBrand);
    expect(result).toBeNull();
  });

  test('missing interview purpose returns null', async () => {
    const result = await bindPurpose(mockAnalysis, {}, mockBrand);
    expect(result).toBeNull();
  });

  test('CLI override rescues missing interview purpose', async () => {
    const result = await bindPurpose(mockAnalysis, {}, mockBrand, {
      purposeOverride: 'sell-venue',
    });
    expect(result).not.toBeNull();
    expect(result.meta.purpose).toBe('sell-venue');
  });
});
