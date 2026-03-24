'use strict';

const fs = require('fs');
const path = require('path');
const { buildCorrectionEntry, appendCorrection, summarizeLearnings, upsertFormatRule } = require('../learning-capture');

describe('buildCorrectionEntry', () => {
  test('builds v2 schema entry', () => {
    const entry = buildCorrectionEntry({
      fileId: 'abc',
      fileType: 'gslides',
      commentId: 'c1',
      original: 'header 淺灰底',
      correction: 'header 深色底白字',
      rule: '表格 header 用深色背景',
      category: 'style',
    });
    expect(entry.schemaVersion).toBe(2);
    expect(entry.fileId).toBe('abc');
    expect(entry.approved).toBe(true);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('appendCorrection', () => {
  const tmpFile = path.join(__dirname, '_test_corrections.jsonl');

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('appends to file', () => {
    const entry = { schemaVersion: 2, rule: 'test rule' };
    appendCorrection(tmpFile, entry);
    const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).rule).toBe('test rule');
  });

  test('appends multiple entries', () => {
    appendCorrection(tmpFile, { schemaVersion: 2, rule: 'r1' });
    appendCorrection(tmpFile, { schemaVersion: 2, rule: 'r2' });
    const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('summarizeLearnings', () => {
  test('groups corrections by category', () => {
    const corrections = [
      { category: 'style', rule: 'r1', fileType: 'gslides' },
      { category: 'style', rule: 'r2', fileType: 'gslides' },
      { category: 'content', rule: 'r3', fileType: 'gdocs' },
    ];
    const summary = summarizeLearnings(corrections);
    expect(summary).toHaveLength(3);
    expect(summary.filter(s => s.category === 'style')).toHaveLength(2);
  });

  test('returns empty for no corrections', () => {
    expect(summarizeLearnings([])).toEqual([]);
  });
});

describe('upsertFormatRule', () => {
  const tmpMd = path.join(__dirname, '_test_format.md');

  beforeEach(() => {
    fs.writeFileSync(tmpMd, '# 格式規則\n\n> 自動維護。\n', 'utf-8');
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpMd); } catch {}
  });

  test('adds new section when category not found', () => {
    upsertFormatRule(tmpMd, 'style', '表格 header 用深色背景');
    const content = fs.readFileSync(tmpMd, 'utf-8');
    expect(content).toContain('## style');
    expect(content).toContain('- 表格 header 用深色背景');
  });

  test('appends to existing section', () => {
    upsertFormatRule(tmpMd, 'style', 'rule 1');
    upsertFormatRule(tmpMd, 'style', 'rule 2');
    const content = fs.readFileSync(tmpMd, 'utf-8');
    expect(content).toContain('- rule 1');
    expect(content).toContain('- rule 2');
  });

  test('skips duplicate rule', () => {
    upsertFormatRule(tmpMd, 'style', 'same rule');
    upsertFormatRule(tmpMd, 'style', 'same rule');
    const content = fs.readFileSync(tmpMd, 'utf-8');
    const count = (content.match(/same rule/g) || []).length;
    expect(count).toBe(1);
  });

  test('creates file if not exists', () => {
    const newPath = path.join(__dirname, '_test_new_format.md');
    try {
      upsertFormatRule(newPath, 'content', 'new rule');
      const content = fs.readFileSync(newPath, 'utf-8');
      expect(content).toContain('## content');
      expect(content).toContain('- new rule');
    } finally {
      try { fs.unlinkSync(newPath); } catch {}
    }
  });
});
