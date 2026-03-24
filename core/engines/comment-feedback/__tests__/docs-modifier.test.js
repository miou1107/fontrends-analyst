'use strict';

const { buildDocDeleteRequests, buildDocStyleRequests, buildDocContentRequests, sortRequestsDescending } = require('../modifiers/docs-modifier');

describe('buildDocDeleteRequests', () => {
  test('generates deleteContentRange', () => {
    const reqs = buildDocDeleteRequests({ start: 10, end: 50 });
    expect(reqs).toEqual([{
      deleteContentRange: { range: { startIndex: 10, endIndex: 50, segmentId: '' } },
    }]);
  });
});

describe('buildDocStyleRequests', () => {
  test('generates updateTextStyle for bold', () => {
    const reqs = buildDocStyleRequests({ start: 10, end: 50 }, { bold: true });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].updateTextStyle.textStyle.bold).toBe(true);
    expect(reqs[0].updateTextStyle.range.startIndex).toBe(10);
  });
});

describe('buildDocContentRequests', () => {
  test('generates delete + insert (descending order)', () => {
    const reqs = buildDocContentRequests({ start: 10, end: 50 }, '新內容');
    expect(reqs).toHaveLength(2);
    expect(reqs[0].deleteContentRange).toBeTruthy();
    expect(reqs[1].insertText).toBeTruthy();
    expect(reqs[1].insertText.text).toBe('新內容');
    expect(reqs[1].insertText.location.index).toBe(10);
  });
});

describe('sortRequestsDescending', () => {
  test('sorts by startIndex descending', () => {
    const items = [
      { range: { start: 10, end: 20 }, requests: [{ fake: 'a' }] },
      { range: { start: 50, end: 60 }, requests: [{ fake: 'b' }] },
      { range: { start: 30, end: 40 }, requests: [{ fake: 'c' }] },
    ];
    const sorted = sortRequestsDescending(items);
    expect(sorted.map(i => i.range.start)).toEqual([50, 30, 10]);
  });
});
