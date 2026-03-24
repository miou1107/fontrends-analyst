const path = require('path');
const fs = require('fs');
const { runAnalysis } = require('../analysis-engine');

const RUN_DIR = path.join(process.env.HOME, '.fontrends/runs/louis-vuitton-2025-03-19');

describe('analysis-engine integration', () => {
  let result;

  beforeAll(() => {
    if (!fs.existsSync(path.join(RUN_DIR, 'data.json'))) { console.warn('Skipping: LV data not found'); return; }
    result = runAnalysis(RUN_DIR);
  });

  test('produces valid meta', () => {
    if (!result) return;
    expect(result.meta.brand).toBe('Louis Vuitton');
    expect(result.meta.schema_version).toBe('1.0');
    expect(result.meta.generated_at).toBeDefined();
    expect(result.meta.primary_competitor).toBe('Gucci');
  });

  test('has 8 dimensions (competitor fallback included)', () => {
    if (!result) return;
    const dims = Object.keys(result.dimensions);
    expect(dims.length).toBe(8);
    expect(dims).toContain('social_overview');
    expect(dims).toContain('trend');
    expect(dims).toContain('sentiment');
    expect(dims).toContain('competitor');
  });

  test('each dimension has derived_metrics and insights', () => {
    if (!result) return;
    for (const [key, dim] of Object.entries(result.dimensions)) {
      expect(dim.derived_metrics).toBeDefined();
      expect(dim.insights).toBeDefined();
      expect(Array.isArray(dim.insights)).toBe(true);
    }
  });

  test('has cross_dimensional with market_position', () => {
    if (!result) return;
    expect(result.cross_dimensional.market_position).toBeDefined();
    expect(result.cross_dimensional.market_position.quadrant).toMatch(/leader|challenger|niche|follower/);
  });

  test('has >= 6 recommendations', () => {
    if (!result) return;
    expect(result.recommendations.length).toBeGreaterThanOrEqual(6);
  });

  test('has >= 2 immediate and >= 1 verify recommendations', () => {
    if (!result) return;
    const imm = result.recommendations.filter(r => r.priority === 'immediate').length;
    const ver = result.recommendations.filter(r => r.priority === 'verify').length;
    expect(imm).toBeGreaterThanOrEqual(2);
    expect(ver).toBeGreaterThanOrEqual(1);
  });

  test('has quality scores', () => {
    if (!result) return;
    expect(result.quality.data_completeness).toBeGreaterThan(0);
    expect(result.quality.caveats.length).toBeGreaterThan(0);
  });

  test('ml_insights is null', () => {
    if (!result) return;
    expect(result.ml_insights).toBeNull();
  });
});
