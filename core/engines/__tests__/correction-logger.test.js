'use strict';

const fs = require('fs');
const path = require('path');
const { logCorrection } = require('../correction-logger');

const tmpFile = path.join(__dirname, '_test_corrections.jsonl');

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch {}
});

describe('logCorrection', () => {
  test('appends a line to the file', () => {
    logCorrection(
      { source: 'data-extraction', type: 'data_error', description: 'wrong value' },
      tmpFile
    );
    const content = fs.readFileSync(tmpFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  test('each line is valid JSON', () => {
    logCorrection(
      { source: 'presentation', type: 'format_error', description: 'bad color' },
      tmpFile
    );
    const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  test('adds timestamp automatically', () => {
    const before = new Date().toISOString();
    logCorrection({ source: 'narrative', type: 'logic_error', description: 'test' }, tmpFile);
    const after = new Date().toISOString();

    const entry = JSON.parse(fs.readFileSync(tmpFile, 'utf-8').trim());
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(entry.timestamp >= before).toBe(true);
    expect(entry.timestamp <= after).toBe(true);
  });

  test('handles missing file — creates it', () => {
    expect(fs.existsSync(tmpFile)).toBe(false);
    logCorrection({ source: 'data-extraction', type: 'data_error', description: 'new file test' }, tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(true);
  });

  test('multiple calls append multiple lines', () => {
    logCorrection({ source: 'data-extraction', type: 'data_error', description: 'first' }, tmpFile);
    logCorrection({ source: 'presentation', type: 'format_error', description: 'second' }, tmpFile);
    logCorrection({ source: 'narrative', type: 'logic_error', description: 'third' }, tmpFile);

    const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(3);

    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].description).toBe('first');
    expect(parsed[1].description).toBe('second');
    expect(parsed[2].description).toBe('third');
  });

  test('written entry contains expected fields', () => {
    logCorrection(
      {
        source: 'data-extraction',
        type: 'data_error',
        description: 'value mismatch',
        old_value: '100',
        new_value: '200',
        context: { sheet: 'Sheet1', row: 5 },
      },
      tmpFile
    );

    const entry = JSON.parse(fs.readFileSync(tmpFile, 'utf-8').trim());
    expect(entry.source).toBe('data-extraction');
    expect(entry.type).toBe('data_error');
    expect(entry.description).toBe('value mismatch');
    expect(entry.old_value).toBe('100');
    expect(entry.new_value).toBe('200');
    expect(entry.context).toEqual({ sheet: 'Sheet1', row: 5 });
  });
});
