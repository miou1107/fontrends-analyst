'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { classifyIntents } = require('../research-collector');

describe('classifyIntents', () => {
  test('classifies shopping keywords', () => {
    const result = classifyIntents([
      { keyword: 'brand 包包' },
      { keyword: 'brand 價格' },
      { keyword: 'brand 哪裡買' },
    ]);
    expect(result.shopping.count).toBe(3);
  });

  test('classifies info keywords', () => {
    const result = classifyIntents([
      { keyword: 'brand 設計師是誰' },
      { keyword: 'brand 發音' },
    ]);
    expect(result.info.count).toBe(2);
  });

  test('classifies navigation keywords', () => {
    const result = classifyIntents([
      { keyword: 'brand 官網' },
      { keyword: 'brand 台北101' },
    ]);
    expect(result.navigation.count).toBe(2);
  });

  test('classifies comparison keywords', () => {
    const result = classifyIntents([
      { keyword: 'brand vs competitor' },
      { keyword: 'brand 評價' },
    ]);
    expect(result.comparison.count).toBe(2);
  });

  test('puts unclassified into other', () => {
    const result = classifyIntents([
      { keyword: 'brand' },
      { keyword: 'brand fr' },
    ]);
    expect(result.other.count).toBe(2);
  });

  test('limits keywords per intent to 5', () => {
    const keywords = Array.from({ length: 10 }, (_, i) => ({ keyword: `brand 包${i}` }));
    const result = classifyIntents(keywords);
    expect(result.shopping.keywords.length).toBeLessThanOrEqual(5);
  });

  test('handles empty input', () => {
    const result = classifyIntents([]);
    expect(result.shopping.count).toBe(0);
    expect(result.other.count).toBe(0);
  });
});
