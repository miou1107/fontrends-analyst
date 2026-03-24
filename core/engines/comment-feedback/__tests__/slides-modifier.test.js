'use strict';

const { buildStyleRequests, buildDeleteRequests, buildContentRequests, buildPageObjectIdMap } = require('../modifiers/slides-modifier');

describe('buildPageObjectIdMap', () => {
  test('maps objectId to page index', () => {
    const presentation = {
      slides: [
        { objectId: 'p1', pageElements: [] },
        { objectId: 'p2', pageElements: [] },
      ],
    };
    const map = buildPageObjectIdMap(presentation);
    expect(map.get('p1')).toBe(0);
    expect(map.get('p2')).toBe(1);
  });
});

describe('buildDeleteRequests', () => {
  test('generates deleteObject for element', () => {
    const reqs = buildDeleteRequests('shape123', 'element');
    expect(reqs).toEqual([{ deleteObject: { objectId: 'shape123' } }]);
  });

  test('generates deleteObject for page', () => {
    const reqs = buildDeleteRequests('page_1', 'page');
    expect(reqs).toEqual([{ deleteObject: { objectId: 'page_1' } }]);
  });
});

describe('buildStyleRequests', () => {
  test('generates updateTextStyle for font size', () => {
    const reqs = buildStyleRequests('shape1', { fontSize: 36 });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].updateTextStyle).toBeTruthy();
    expect(reqs[0].updateTextStyle.style.fontSize.magnitude).toBe(36);
  });

  test('generates updateTextStyle for bold', () => {
    const reqs = buildStyleRequests('shape1', { bold: true });
    expect(reqs[0].updateTextStyle.style.bold).toBe(true);
  });
});

describe('buildContentRequests', () => {
  test('generates delete + insert for text replacement', () => {
    const reqs = buildContentRequests('shape1', '舊文字', '新文字');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].replaceAllText).toBeTruthy();
  });
});
