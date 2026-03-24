'use strict';

const { parseAnchor, filterUnresolved, parseComment } = require('../comment-reader');

describe('parseAnchor', () => {
  test('parses JSON anchor for Slides', () => {
    const anchor = JSON.stringify({ r: 'page_obj123', a: { lo: { ps: { o: { i: 'elem456' } } } } });
    const result = parseAnchor(anchor, 'slides');
    expect(result).toEqual({ targetType: 'slide_element', targetID: 'elem456', pageObjectId: 'page_obj123' });
  });

  test('parses JSON anchor for Docs', () => {
    const anchor = JSON.stringify({ r: 'head', a: { lo: { n: { s: { si: 10, ei: 50 } } } } });
    const result = parseAnchor(anchor, 'docs');
    expect(result).toEqual({ targetType: 'doc_range', targetID: { start: 10, end: 50 } });
  });

  test('parses base64-encoded anchor', () => {
    const raw = JSON.stringify({ r: 'page_x', a: { lo: { ps: { o: { i: 'el99' } } } } });
    const anchor = Buffer.from(raw).toString('base64');
    const result = parseAnchor(anchor, 'slides');
    expect(result).toEqual({ targetType: 'slide_element', targetID: 'el99', pageObjectId: 'page_x' });
  });

  test('returns null for unparseable anchor', () => {
    const result = parseAnchor('garbage', 'slides');
    expect(result).toBeNull();
  });

  test('returns null for missing anchor', () => {
    expect(parseAnchor(null, 'slides')).toBeNull();
    expect(parseAnchor(undefined, 'docs')).toBeNull();
  });
});

describe('filterUnresolved', () => {
  test('keeps only unresolved comments', () => {
    const comments = [
      { id: '1', resolved: false, content: 'fix this' },
      { id: '2', resolved: true, content: 'done' },
      { id: '3', resolved: false, content: 'change that' },
    ];
    expect(filterUnresolved(comments)).toHaveLength(2);
    expect(filterUnresolved(comments).map(c => c.id)).toEqual(['1', '3']);
  });

  test('returns empty array when all resolved', () => {
    expect(filterUnresolved([{ id: '1', resolved: true }])).toEqual([]);
  });

  test('handles empty input', () => {
    expect(filterUnresolved([])).toEqual([]);
    expect(filterUnresolved(null)).toEqual([]);
  });
});

describe('parseComment', () => {
  test('parses a Slides comment with anchor', () => {
    const raw = {
      id: 'c1',
      content: '字太小',
      anchor: JSON.stringify({ r: 'page_p1', a: { lo: { ps: { o: { i: 'shape1' } } } } }),
      resolved: false,
      createdTime: '2026-03-20T10:00:00Z',
    };
    const result = parseComment(raw, 'slides');
    expect(result.id).toBe('c1');
    expect(result.content).toBe('字太小');
    expect(result.targetType).toBe('slide_element');
    expect(result.targetID).toBe('shape1');
  });

  test('parses a comment without anchor', () => {
    const raw = { id: 'c2', content: '整體配色不好', resolved: false, createdTime: '2026-03-20T10:00:00Z' };
    const result = parseComment(raw, 'slides');
    expect(result.targetType).toBeNull();
    expect(result.targetID).toBeNull();
  });
});
