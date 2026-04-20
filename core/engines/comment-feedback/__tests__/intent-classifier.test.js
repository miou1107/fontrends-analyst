'use strict';

const { classifyIntent, sortByProcessingOrder, groupByTarget, resolveContradictions } = require('../intent-classifier');
const { resolveProfile } = require('../../../knowledge-loader');

const snap = resolveProfile('brand-social');

describe('classifyIntent', () => {
  test('classifies style comment', () => {
    const result = classifyIntent('字太小，改成 36pt', { type: 'textBox', text: '標題' }, snap);
    expect(result.intent).toBe('style');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.action).toBeTruthy();
  });

  test('classifies content comment', () => {
    const result = classifyIntent('數字錯了，應該是 2,500 不是 3,000', { type: 'textBox', text: '3,000' }, snap);
    expect(result.intent).toBe('content');
  });

  test('classifies delete comment', () => {
    const result = classifyIntent('這頁刪掉', { type: 'slide', elements: [] }, snap);
    expect(result.intent).toBe('delete');
  });

  test('classifies structure comment', () => {
    const result = classifyIntent('把這頁移到前面', { type: 'slide', elements: [] }, snap);
    expect(result.intent).toBe('structure');
  });

  test('classifies question comment', () => {
    const result = classifyIntent('這個數據是從哪裡來的？', { type: 'textBox', text: '2,700,000' }, snap);
    expect(result.intent).toBe('question');
  });

  test('throws when snapshot is missing (L3 engine SoC guard)', () => {
    expect(() => classifyIntent('test')).toThrow(/snapshot required/);
  });
});

describe('sortByProcessingOrder', () => {
  test('sorts delete > structure > content > style > question', () => {
    const comments = [
      { id: '1', classified: { intent: 'style' } },
      { id: '2', classified: { intent: 'delete' } },
      { id: '3', classified: { intent: 'question' } },
      { id: '4', classified: { intent: 'content' } },
      { id: '5', classified: { intent: 'structure' } },
    ];
    const sorted = sortByProcessingOrder(comments, snap);
    expect(sorted.map(c => c.classified.intent)).toEqual([
      'delete', 'structure', 'content', 'style', 'question',
    ]);
  });

  test('preserves order within same intent', () => {
    const comments = [
      { id: 'a', classified: { intent: 'style' } },
      { id: 'b', classified: { intent: 'style' } },
    ];
    const sorted = sortByProcessingOrder(comments, snap);
    expect(sorted.map(c => c.id)).toEqual(['a', 'b']);
  });
});

describe('groupByTarget', () => {
  test('groups comments by targetID', () => {
    const comments = [
      { id: '1', targetID: 'shape1', classified: { intent: 'style' }, createdTime: '2026-03-20T10:00:00Z' },
      { id: '2', targetID: 'shape1', classified: { intent: 'content' }, createdTime: '2026-03-20T11:00:00Z' },
      { id: '3', targetID: 'shape2', classified: { intent: 'style' }, createdTime: '2026-03-20T10:00:00Z' },
    ];
    const groups = groupByTarget(comments);
    expect(groups.get('shape1')).toHaveLength(2);
    expect(groups.get('shape2')).toHaveLength(1);
  });
});

describe('resolveContradictions', () => {
  test('keeps latest comment when intents conflict on same target', () => {
    const group = [
      { id: '1', classified: { intent: 'style', action: '字放大' }, createdTime: '2026-03-20T10:00:00Z' },
      { id: '2', classified: { intent: 'style', action: '字縮小' }, createdTime: '2026-03-20T11:00:00Z' },
    ];
    const { winner, overridden } = resolveContradictions(group);
    expect(winner.id).toBe('2');
    expect(overridden).toHaveLength(1);
    expect(overridden[0].id).toBe('1');
  });

  test('keeps all when intents differ', () => {
    const group = [
      { id: '1', classified: { intent: 'style' }, createdTime: '2026-03-20T10:00:00Z' },
      { id: '2', classified: { intent: 'content' }, createdTime: '2026-03-20T11:00:00Z' },
    ];
    const { winner, overridden } = resolveContradictions(group);
    expect(winner).toBeNull();
    expect(overridden).toHaveLength(0);
  });
});
