'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { readCorrections, groupCorrections, summarizePatterns } = require('../learning-engine');

function makeTmpFile(lines) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-test-'));
  const filePath = path.join(tmpDir, 'corrections.jsonl');
  const content = lines.map(l => JSON.stringify(l)).join('\n');
  fs.writeFileSync(filePath, content);
  return { filePath, tmpDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true });
}

describe('readCorrections', () => {
  test('returns empty array for nonexistent file', () => {
    const result = readCorrections('/tmp/nonexistent-file-xyz.jsonl');
    expect(result).toEqual([]);
  });

  test('reads and parses JSONL entries', () => {
    const entries = [
      { timestamp: '2026-03-20T00:00:00Z', source: 'extraction', type: 'format', description: 'test' },
      { timestamp: '2026-03-20T01:00:00Z', source: 'narrative', type: 'content', description: 'test2' },
    ];
    const { filePath, tmpDir } = makeTmpFile(entries);
    const result = readCorrections(filePath);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('extraction');
    expect(result[1].source).toBe('narrative');
    cleanup(tmpDir);
  });

  test('skips invalid JSON lines', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-test-'));
    const filePath = path.join(tmpDir, 'corrections.jsonl');
    fs.writeFileSync(filePath, '{"source":"a"}\nbad json\n{"source":"b"}\n');
    const result = readCorrections(filePath);
    expect(result).toHaveLength(2);
    cleanup(tmpDir);
  });
});

describe('groupCorrections', () => {
  test('groups by source and type', () => {
    const corrections = [
      { source: 'extraction', type: 'format' },
      { source: 'extraction', type: 'value' },
      { source: 'narrative', type: 'format' },
    ];
    const { bySource, byType } = groupCorrections(corrections);
    expect(bySource.extraction).toHaveLength(2);
    expect(bySource.narrative).toHaveLength(1);
    expect(byType.format).toHaveLength(2);
    expect(byType.value).toHaveLength(1);
  });
});

describe('summarizePatterns', () => {
  test('returns zero summary for empty array', () => {
    const result = summarizePatterns([]);
    expect(result.total).toBe(0);
    expect(result.topSources).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  test('counts and ranks sources', () => {
    const corrections = [
      { source: 'A', type: 'x' },
      { source: 'A', type: 'x' },
      { source: 'B', type: 'y' },
    ];
    const result = summarizePatterns(corrections);
    expect(result.total).toBe(3);
    expect(result.topSources[0].source).toBe('A');
    expect(result.topSources[0].count).toBe(2);
  });

  test('detects repeated patterns (3+ same source+type)', () => {
    const corrections = [
      { source: 'extraction', type: 'format' },
      { source: 'extraction', type: 'format' },
      { source: 'extraction', type: 'format' },
      { source: 'other', type: 'value' },
    ];
    const result = summarizePatterns(corrections);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0].source).toBe('extraction');
    expect(result.patterns[0].type).toBe('format');
    expect(result.patterns[0].count).toBe(3);
  });

  test('returns recent entries sorted by timestamp', () => {
    const corrections = [
      { timestamp: '2026-01-01T00:00:00Z', source: 'old' },
      { timestamp: '2026-03-20T00:00:00Z', source: 'new' },
    ];
    const result = summarizePatterns(corrections);
    expect(result.recent[0].source).toBe('new');
  });
});
