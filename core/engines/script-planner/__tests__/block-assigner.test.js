'use strict';

const { assignBlocks } = require('../block-assigner');

describe('assignBlocks', () => {
  test('data_table always included', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('data_table');
  });

  test('insight_block and so_what included when insights exist', () => {
    const dim = { insights: [{ type: 'growth' }], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('insight_block');
    expect(blocks).toContain('so_what');
  });

  test('insight_block and so_what excluded when no insights', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks, excluded_blocks } = assignBlocks(dim);
    expect(blocks).not.toContain('insight_block');
    expect(blocks).not.toContain('so_what');
    expect(excluded_blocks).toContain('insight_block');
    expect(excluded_blocks).toContain('so_what');
  });

  test('anomaly_callout included when anomalies exist', () => {
    const dim = { insights: [], anomalies: [{ metric: 'x' }], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('anomaly_callout');
  });

  test('anomaly_callout excluded when no anomalies', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { excluded_blocks } = assignBlocks(dim);
    expect(excluded_blocks).toContain('anomaly_callout');
  });

  test('self_comparison_note included when |change_pct| > 10', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { x: { change_pct: 15 } } },
      competitor_comparison: null,
    };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('self_comparison_note');
  });

  test('self_comparison_note excluded when all |change_pct| <= 10', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { x: { change_pct: 5 }, y: { change_pct: -8 } } },
      competitor_comparison: null,
    };
    const { excluded_blocks } = assignBlocks(dim);
    expect(excluded_blocks).toContain('self_comparison_note');
  });

  test('competitor_note included when competitor_comparison is not null', () => {
    const dim = {
      insights: [], anomalies: [], self_comparison: { mom: null },
      competitor_comparison: { primary: { brand: 'X' } },
    };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('competitor_note');
  });

  test('competitor_note excluded when competitor_comparison is null', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { excluded_blocks } = assignBlocks(dim);
    expect(excluded_blocks).toContain('competitor_note');
  });

  test('action_link included when recommendations match dimension', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const recs = [
      { id: 'rec_001', linked_dimensions: ['trend'] },
      { id: 'rec_002', linked_dimensions: ['kol'] },
    ];
    const { blocks } = assignBlocks(dim, 'trend', recs);
    expect(blocks).toContain('action_link');
  });

  test('action_link excluded when no recommendations match', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const recs = [{ id: 'rec_001', linked_dimensions: ['kol'] }];
    const { excluded_blocks } = assignBlocks(dim, 'trend', recs);
    expect(excluded_blocks).toContain('action_link');
  });

  test('full dimension with everything → all blocks included', () => {
    const dim = {
      insights: [{ type: 'growth' }],
      anomalies: [{ metric: 'x' }],
      self_comparison: { mom: { x: { change_pct: 25 } } },
      competitor_comparison: { primary: { brand: 'Y' } },
    };
    const recs = [{ id: 'rec_001', linked_dimensions: ['trend'] }];
    const { blocks, excluded_blocks } = assignBlocks(dim, 'trend', recs);
    expect(blocks).toEqual(expect.arrayContaining([
      'data_table', 'insight_block', 'so_what', 'anomaly_callout',
      'self_comparison_note', 'competitor_note', 'action_link',
    ]));
    expect(excluded_blocks).toEqual([]);
  });
});
