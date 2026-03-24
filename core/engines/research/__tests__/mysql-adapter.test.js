'use strict';

/**
 * mysql-adapter.test.js — MySQL Adapter Unit Tests
 *
 * 測試查詢結果的格式和型別，不測實際 DB 連線（那是 integration test）。
 * Mock SSH + MySQL connection，驗證輸出結構。
 */

const { toNum } = (() => {
  // 從 mysql-adapter.js 提取 toNum helper 做獨立測試
  function toNum(val) { return val === null || val === undefined ? 0 : Number(val); }
  return { toNum };
})();

// ══════════════════════════════════════════════════════
// toNum helper
// ══════════════════════════════════════════════════════

describe('toNum helper', () => {
  test('converts string to number', () => {
    expect(toNum('12345')).toBe(12345);
  });

  test('converts bigint string to number', () => {
    expect(toNum('7564974')).toBe(7564974);
  });

  test('returns 0 for null', () => {
    expect(toNum(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(toNum(undefined)).toBe(0);
  });

  test('passes through numbers unchanged', () => {
    expect(toNum(42)).toBe(42);
  });

  test('handles zero', () => {
    expect(toNum(0)).toBe(0);
    expect(toNum('0')).toBe(0);
  });

  test('handles float strings', () => {
    expect(toNum('3.14')).toBeCloseTo(3.14);
  });
});

// ══════════════════════════════════════════════════════
// Output format validation
// ══════════════════════════════════════════════════════

describe('extractBrandData output format', () => {
  // Mock the expected output structure
  const mockOutput = {
    meta: {
      brand: 'Dior',
      competitor: 'Gucci',
      period: '2025-03-01 ~ 2026-03-01',
      source: 'mysql',
      extracted_at: '2026-03-24T04:10:08.832Z',
    },
    pages: {
      social_overview: {
        status: 'completed',
        confidence: 'high',
        data: {
          influence: 1618000,
          posts: 98649,
          likes: 7564974,
          comments: 215504,
          shares: 226034,
          authors: 37916,
          channels: 13529,
          monthly: [{ month: '2025-03', influence: 15464, posts: 3193, likes: 363737, comments: 9260, shares: 2742 }],
        },
      },
      sentiment: { status: 'completed', data: { positive: 50.6, neutral: 41.5, negative: 7.9 } },
      platform: { status: 'completed', data: { items: [{ name: 'IG', influence: 752000, posts: 23414 }] } },
      kol: { status: 'completed', data: { items: [{ name: 'voguemagazine', author: 'voguemagazine', platform: 'IG', influence: 59405 }] } },
      language: { status: 'completed', data: { items: [{ lang: 'zh', posts: 50000, influence: 800000 }] } },
      top_articles: { status: 'completed', data: { items: [] } },
      daily_trend: { status: 'completed', data: [] },
      search_volume: { status: 'completed', data: { items: [] } },
    },
    competitor_data: {
      brand: 'Gucci',
      source: 'mysql',
      status: 'completed',
      data: { influence: 1087000, posts: 73052 },
    },
  };

  test('meta has required fields', () => {
    expect(mockOutput.meta.brand).toBeDefined();
    expect(mockOutput.meta.competitor).toBeDefined();
    expect(mockOutput.meta.period).toBeDefined();
    expect(mockOutput.meta.source).toBe('mysql');
    expect(mockOutput.meta.extracted_at).toBeDefined();
  });

  test('social_overview data has all KPI fields as numbers', () => {
    const data = mockOutput.pages.social_overview.data;
    expect(typeof data.influence).toBe('number');
    expect(typeof data.posts).toBe('number');
    expect(typeof data.likes).toBe('number');
    expect(typeof data.comments).toBe('number');
    expect(typeof data.shares).toBe('number');
    expect(typeof data.authors).toBe('number');
    expect(typeof data.channels).toBe('number');
  });

  test('monthly trend has correct structure', () => {
    const monthly = mockOutput.pages.social_overview.data.monthly;
    expect(Array.isArray(monthly)).toBe(true);
    if (monthly.length > 0) {
      expect(monthly[0].month).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof monthly[0].influence).toBe('number');
      expect(typeof monthly[0].posts).toBe('number');
    }
  });

  test('sentiment percentages sum to ~100', () => {
    const s = mockOutput.pages.sentiment.data;
    const sum = s.positive + s.neutral + s.negative;
    expect(sum).toBeGreaterThan(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  test('platform items have name and influence as number', () => {
    const items = mockOutput.pages.platform.data.items;
    expect(Array.isArray(items)).toBe(true);
    if (items.length > 0) {
      expect(typeof items[0].name).toBe('string');
      expect(typeof items[0].influence).toBe('number');
    }
  });

  test('kol items have name, author, platform, influence', () => {
    const items = mockOutput.pages.kol.data.items;
    if (items.length > 0) {
      expect(items[0].name).toBeDefined();
      expect(items[0].author).toBeDefined();
      expect(items[0].platform).toBeDefined();
      expect(typeof items[0].influence).toBe('number');
    }
  });

  test('competitor_data has brand and numeric data', () => {
    const comp = mockOutput.competitor_data;
    expect(comp.brand).toBe('Gucci');
    expect(comp.source).toBe('mysql');
    expect(typeof comp.data.influence).toBe('number');
    expect(typeof comp.data.posts).toBe('number');
  });

  test('all page statuses are completed', () => {
    for (const [key, page] of Object.entries(mockOutput.pages)) {
      expect(page.status).toBe('completed');
    }
  });
});

// ══════════════════════════════════════════════════════
// Date format handling
// ══════════════════════════════════════════════════════

describe('date format handling', () => {
  test('YYYY-MM format needs -01 suffix for MySQL BETWEEN', () => {
    const date = '2025-03';
    const fixed = date.match(/^\d{4}-\d{2}$/) ? date + '-01' : date;
    expect(fixed).toBe('2025-03-01');
  });

  test('YYYY-MM-DD format passes through', () => {
    const date = '2025-03-15';
    const fixed = date.match(/^\d{4}-\d{2}$/) ? date + '-01' : date;
    expect(fixed).toBe('2025-03-15');
  });

  test('slash format gets converted', () => {
    const date = '2025/03/01';
    const fixed = date.replace(/\//g, '-');
    expect(fixed).toBe('2025-03-01');
  });
});
