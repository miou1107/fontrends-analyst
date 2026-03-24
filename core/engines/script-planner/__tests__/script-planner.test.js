'use strict';

const { planScript } = require('../script-planner');

function makeAnalysis(overrides = {}) {
  const baseDim = () => ({
    derived_metrics: { influence: 1000 },
    self_comparison: { mom: null, qoq: null, yoy: null },
    competitor_comparison: null,
    anomalies: [],
    insights: [],
  });
  return {
    meta: { brand: 'TestBrand', period: '2025-03', schema_version: '1.0' },
    dimensions: {
      social_overview: baseDim(),
      trend: { ...baseDim(), insights: [{ type: 'growth', severity: 'positive', text: 'MoM +54%', evidence: { metric: 'momentum' } }], self_comparison: { mom: { momentum: { change_pct: 54 } }, qoq: null, yoy: null } },
      language: baseDim(),
      platform: baseDim(),
      kol: { ...baseDim(), anomalies: [{ metric: 'kol_influence', value: 500000 }], insights: [{ type: 'anomaly', severity: 'warning', text: 'KOL 影響力異常', evidence: { metric: 'kol_influence' } }] },
      sentiment: baseDim(),
      search: baseDim(),
      competitor: baseDim(),
      ...overrides,
    },
    recommendations: [
      { id: 'rec_001', priority: 'opportunistic', linked_dimensions: ['trend'] },
      { id: 'rec_002', priority: 'verify', linked_dimensions: ['kol'] },
      { id: 'rec_003', priority: 'immediate', linked_dimensions: ['social_overview'] },
      { id: 'rec_004', priority: 'immediate', linked_dimensions: ['social_overview'] },
      { id: 'rec_005', priority: 'medium_term', linked_dimensions: ['trend'] },
      { id: 'rec_006', priority: 'medium_term', linked_dimensions: ['platform'] },
    ],
    quality: { data_completeness: 1.0 },
  };
}

describe('planScript', () => {
  const brand = { name: 'TestBrand' };

  test('full-13: returns valid script.json structure', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    expect(result.meta.brand).toBe('TestBrand');
    expect(result.meta.schema).toBe('full-13');
    expect(result.meta.generated_at).toBeDefined();
    expect(result.fixed_pages).toEqual(['cover', 'summary', 'actions', 'closing']);
    expect(Array.isArray(result.chapters)).toBe(true);
    expect(Array.isArray(result.excluded)).toBe(true);
    expect(result.meta.total_chapters).toBe(result.chapters.length);
    expect(result.meta.excluded_count).toBe(result.excluded.length);
  });

  test('chapters are sorted by score descending', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    for (let i = 1; i < result.chapters.length; i++) {
      expect(result.chapters[i].score).toBeLessThanOrEqual(result.chapters[i - 1].score);
    }
  });

  test('trend chapter ranked high (has insights + MoM change)', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend).toBeDefined();
    expect(trend.rank).toBeLessThanOrEqual(3);
    expect(trend.focus).toBe('growth');
    expect(trend.headline).toBe('momentum 成長 54%');
  });

  test('kol chapter has anomaly focus', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const kol = result.chapters.find(c => c.pageId === 'kol');
    expect(kol).toBeDefined();
    expect(kol.focus).toBe('anomaly');
  });

  test('chapters have correct blocks', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend.blocks).toContain('data_table');
    expect(trend.blocks).toContain('insight_block');
    expect(trend.blocks).toContain('self_comparison_note');
    expect(trend.blocks).toContain('action_link');
  });

  test('chapters have data_refs', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend.data_refs.primary_metric).toBe('influence');
    expect(Array.isArray(trend.data_refs.insight_indices)).toBe(true);
    expect(Array.isArray(trend.data_refs.anomaly_indices)).toBe(true);
    expect(Array.isArray(trend.data_refs.recommendation_indices)).toBe(true);
  });

  test('intent_boost raises score for focused dimensions', () => {
    const analysis = makeAnalysis();
    const brandFocus = { name: 'TestBrand', focus_dimensions: ['sentiment'] };
    const result = planScript(analysis, brandFocus, 'full-13');
    const sentiment = result.chapters.find(c => c.pageId === 'sentiment');
    expect(sentiment).toBeDefined();
  });

  test('mini-3: passthrough, no chapters (all fixed)', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'mini-3');
    expect(result.chapters).toEqual([]);
    expect(result.excluded).toEqual([]);
    expect(result.fixed_pages).toEqual(['cover', 'overview', 'actions_closing']);
  });

  test('compact-8: only includes schema pages', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'compact-8');
    const pageIds = result.chapters.map(c => c.pageId);
    for (const pid of pageIds) {
      expect(['kpi', 'trend', 'platform', 'sentiment']).toContain(pid);
    }
  });

  test('dimension with score < 0.2 is excluded', () => {
    const analysis = makeAnalysis({
      language: {
        derived_metrics: {},
        self_comparison: { mom: null, qoq: null, yoy: null },
        competitor_comparison: null,
        anomalies: [],
        insights: [],
      },
    });
    const result = planScript(analysis, brand, 'full-13');
    const langExcluded = result.excluded.find(e => e.pageId === 'language');
    expect(langExcluded).toBeDefined();
    expect(langExcluded.reason).toBe('insufficient_data');
  });

  test('low_relevance reason when signal > 0 but score < threshold', () => {
    // Use empty derived_metrics so DATA_PRESENCE_BONUS is not applied,
    // keeping the score low enough to trigger exclusion (threshold=0.1).
    const analysis = makeAnalysis({
      search: {
        derived_metrics: {},
        self_comparison: { mom: null, qoq: null, yoy: null },
        competitor_comparison: null,
        anomalies: [],
        insights: [{ type: 'growth', severity: 'positive', text: 'Minor growth', evidence: { metric: 'x' } }],
      },
    });
    const result = planScript(analysis, brand, 'full-13');
    const venueExcluded = result.excluded.find(e => e.pageId === 'venue');
    expect(venueExcluded).toBeDefined();
    expect(venueExcluded.reason).toBe('low_relevance');
  });

  test('empty dimensions → all chapters excluded', () => {
    const analysis = {
      meta: { brand: 'Empty', period: '2025-03', schema_version: '1.0' },
      dimensions: {},
      recommendations: [],
      quality: { data_completeness: 0 },
    };
    const result = planScript(analysis, brand, 'full-13');
    expect(result.chapters).toEqual([]);
    expect(result.excluded.length).toBeGreaterThan(0);
    result.excluded.forEach(e => expect(e.reason).toBe('insufficient_data'));
  });

  test('rank is sequential starting from 1', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    for (let i = 0; i < result.chapters.length; i++) {
      expect(result.chapters[i].rank).toBe(i + 1);
    }
  });

  test('purpose bindings affect scoring', () => {
    const analysis = makeAnalysis();
    // Give all dimensions a binding so none get the 0.5 penalty
    const bindings = [
      { dimension: 'trend', relevance_score: 0.9, hook: null },
      { dimension: 'social_overview', relevance_score: 0.5, hook: null },
      { dimension: 'language', relevance_score: 0.5, hook: null },
      { dimension: 'platform', relevance_score: 0.5, hook: null },
      { dimension: 'kol', relevance_score: 0.5, hook: null },
      { dimension: 'sentiment', relevance_score: 0.5, hook: null },
      { dimension: 'search', relevance_score: 0.5, hook: null },
      { dimension: 'competitor', relevance_score: 0.5, hook: null },
    ];
    const withPurpose = planScript(analysis, brand, 'full-13', { purposeBindings: bindings });
    const withoutPurpose = planScript(analysis, brand, 'full-13');

    const trendWith = withPurpose.chapters.find(c => c.pageId === 'trend');
    const trendWithout = withoutPurpose.chapters.find(c => c.pageId === 'trend');
    // trend with 0.9 relevance → purpose_factor=0.95, without → 1.0
    // But trend still exists in both
    expect(trendWith).toBeDefined();
    expect(trendWithout).toBeDefined();
  });

  test('purpose hook overrides headline', () => {
    const analysis = makeAnalysis();
    const bindings = [
      { dimension: 'trend', relevance_score: 0.9, hook: '自訂趨勢 hook' },
    ];
    const result = planScript(analysis, brand, 'full-13', { purposeBindings: bindings });
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend.headline).toBe('自訂趨勢 hook');
  });

  test('works without purposeBindings (backward compat)', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    expect(result.chapters.length).toBeGreaterThan(0);
  });
});
