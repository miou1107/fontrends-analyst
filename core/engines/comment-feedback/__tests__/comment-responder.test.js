'use strict';

const { formatReply, formatFailReply, formatCascadeReply, detectLanguage } = require('../comment-responder');

describe('formatReply', () => {
  test('single change', () => {
    const reply = formatReply('標題字體加大', ['標題從 24pt 改為 36pt']);
    expect(reply).toBe('✅ 已調整：標題字體加大\n\n修改項目：\n- 標題從 24pt 改為 36pt');
  });

  test('multiple changes', () => {
    const reply = formatReply('表格樣式修正', ['header 背景改深色', '字體改白色']);
    expect(reply).toContain('✅ 已調整');
    expect(reply).toContain('- header 背景改深色');
    expect(reply).toContain('- 字體改白色');
  });
});

describe('formatFailReply', () => {
  test('formats failure reply', () => {
    const reply = formatFailReply('無法辨識修改目標', '請手動指定要修改的元素');
    expect(reply).toContain('❌ 無法自動處理');
    expect(reply).toContain('建議：');
  });
});

describe('formatCascadeReply', () => {
  test('formats cascade delete reply', () => {
    const reply = formatCascadeReply();
    expect(reply).toContain('已被其他留言刪除');
  });
});

describe('detectLanguage', () => {
  test('detects Chinese', () => {
    expect(detectLanguage('字太小了')).toBe('zh');
  });

  test('detects English', () => {
    expect(detectLanguage('font too small')).toBe('en');
  });

  test('defaults to zh for mixed', () => {
    expect(detectLanguage('font 太小')).toBe('zh');
  });
});
