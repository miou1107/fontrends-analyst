'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  hexToRgb,
  hexNoHash,
  resolveColor,
  formatNumber,
  formatPct,
  inches,
  pt,
  uid,
  resetIdCounter,
  readJSON,
  EMU,
} = require('../helpers');

// ══════════════════════════════════════════════════════
// hexToRgb
// ══════════════════════════════════════════════════════

describe('hexToRgb', () => {
  test('converts pure white #FFFFFF to {red:1, green:1, blue:1}', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ red: 1, green: 1, blue: 1 });
  });

  test('converts pure black #000000 to {red:0, green:0, blue:0}', () => {
    expect(hexToRgb('#000000')).toEqual({ red: 0, green: 0, blue: 0 });
  });

  test('converts #FF8000 correctly to 0-1 float components', () => {
    const result = hexToRgb('#FF8000');
    expect(result.red).toBeCloseTo(1.0, 5);
    expect(result.green).toBeCloseTo(128 / 255, 5);
    expect(result.blue).toBeCloseTo(0, 5);
  });

  test('works without leading # (strips # internally via replace)', () => {
    // hexToRgb internally calls hex.replace('#', '') so passing without # also works
    const result = hexToRgb('BFA06A');
    expect(result.red).toBeCloseTo(191 / 255, 5);
    expect(result.green).toBeCloseTo(160 / 255, 5);
    expect(result.blue).toBeCloseTo(106 / 255, 5);
  });

  test('returns object with exactly red, green, blue keys', () => {
    const result = hexToRgb('#AABBCC');
    expect(Object.keys(result).sort()).toEqual(['blue', 'green', 'red']);
  });

  test('all values are between 0 and 1 inclusive', () => {
    const result = hexToRgb('#7F7F7F');
    expect(result.red).toBeGreaterThanOrEqual(0);
    expect(result.red).toBeLessThanOrEqual(1);
    expect(result.green).toBeGreaterThanOrEqual(0);
    expect(result.green).toBeLessThanOrEqual(1);
    expect(result.blue).toBeGreaterThanOrEqual(0);
    expect(result.blue).toBeLessThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════
// hexNoHash
// ══════════════════════════════════════════════════════

describe('hexNoHash', () => {
  test('strips # prefix', () => {
    expect(hexNoHash('#BFA06A')).toBe('BFA06A');
  });

  test('leaves string unchanged when no # present', () => {
    expect(hexNoHash('FFFFFF')).toBe('FFFFFF');
  });

  test('only strips leading # (not embedded #)', () => {
    // replace('#','') only removes first occurrence — edge case documentation
    expect(hexNoHash('#FF00FF')).toBe('FF00FF');
  });

  test('handles empty string gracefully', () => {
    expect(hexNoHash('')).toBe('');
  });
});

// ══════════════════════════════════════════════════════
// resolveColor
// ══════════════════════════════════════════════════════

describe('resolveColor', () => {
  const brand = {
    colors: {
      primary: '#BFA06A',
      secondary: '#5A3E2B',
    },
  };

  test('resolves brand color key "primary" and strips #', () => {
    expect(resolveColor('primary', brand)).toBe('BFA06A');
  });

  test('resolves brand color key "secondary"', () => {
    expect(resolveColor('secondary', brand)).toBe('5A3E2B');
  });

  test('resolves builtin color "white"', () => {
    expect(resolveColor('white', brand)).toBe('FFFFFF');
  });

  test('resolves builtin color "black"', () => {
    expect(resolveColor('black', brand)).toBe('0A0A0A');
  });

  test('resolves builtin color "positive"', () => {
    expect(resolveColor('positive', brand)).toBe('2E7D32');
  });

  test('resolves builtin color "negative"', () => {
    expect(resolveColor('negative', brand)).toBe('C62828');
  });

  test('resolves builtin color "midGray"', () => {
    expect(resolveColor('midGray', brand)).toBe('999999');
  });

  test('pass-through hex with # strips the hash', () => {
    expect(resolveColor('#AABBCC', brand)).toBe('AABBCC');
  });

  test('pass-through hex without # returns as-is', () => {
    expect(resolveColor('AABBCC', brand)).toBe('AABBCC');
  });

  test('returns FFFFFF when colorKeyOrHex is null', () => {
    expect(resolveColor(null, brand)).toBe('FFFFFF');
  });

  test('returns FFFFFF when colorKeyOrHex is undefined', () => {
    expect(resolveColor(undefined, brand)).toBe('FFFFFF');
  });

  test('resolves builtin even with no brand provided', () => {
    expect(resolveColor('gray', null)).toBe('666666');
  });

  test('brand colors take priority over builtins', () => {
    const customBrand = { colors: { white: '#000000' } };
    // brand maps "white" to #000000, so we expect 000000
    expect(resolveColor('white', customBrand)).toBe('000000');
  });
});

// ══════════════════════════════════════════════════════
// formatNumber
// ══════════════════════════════════════════════════════

describe('formatNumber', () => {
  test('returns "N/A" for null', () => {
    expect(formatNumber(null)).toBe('N/A');
  });

  test('returns "N/A" for undefined', () => {
    expect(formatNumber(undefined)).toBe('N/A');
  });

  test('formats 4248000 as "424.8 萬"', () => {
    expect(formatNumber(4248000)).toBe('424.8 萬');
  });

  test('formats exactly 10000 as "1.0 萬"', () => {
    expect(formatNumber(10000)).toBe('1.0 萬');
  });

  test('formats 100000000 as "1.0 億"', () => {
    expect(formatNumber(100000000)).toBe('1.0 億');
  });

  test('formats 250000000 as "2.5 億"', () => {
    expect(formatNumber(250000000)).toBe('2.5 億');
  });

  test('formats 500 (under 1000) as string "500"', () => {
    expect(formatNumber(500)).toBe('500');
  });

  test('formats 0 as "0"', () => {
    expect(formatNumber(0)).toBe('0');
  });

  test('formats 1000 with locale formatting (>= 1000 and < 10000)', () => {
    // Between 1000 and 9999: toLocaleString
    const result = formatNumber(1500);
    expect(typeof result).toBe('string');
    // Should contain "1" and "500" somewhere (locale may vary)
    expect(result).toMatch(/1/);
  });

  test('formats 9999 (just below 萬 threshold)', () => {
    const result = formatNumber(9999);
    expect(typeof result).toBe('string');
    // Not 萬 format
    expect(result).not.toContain('萬');
  });

  test('formats 10001 as 萬', () => {
    expect(formatNumber(10001)).toContain('萬');
  });
});

// ══════════════════════════════════════════════════════
// formatPct
// ══════════════════════════════════════════════════════

describe('formatPct', () => {
  test('returns "N/A" for null', () => {
    expect(formatPct(null)).toBe('N/A');
  });

  test('returns "N/A" for undefined', () => {
    expect(formatPct(undefined)).toBe('N/A');
  });

  test('formats 53.0 as "53.0%"', () => {
    expect(formatPct(53.0)).toBe('53.0%');
  });

  test('formats 0 as "0.0%"', () => {
    expect(formatPct(0)).toBe('0.0%');
  });

  test('formats 100 as "100.0%"', () => {
    expect(formatPct(100)).toBe('100.0%');
  });

  test('rounds to 1 decimal place: 33.333 → "33.3%"', () => {
    expect(formatPct(33.333)).toBe('33.3%');
  });

  test('formats negative percentage', () => {
    expect(formatPct(-5.5)).toBe('-5.5%');
  });
});

// ══════════════════════════════════════════════════════
// inches
// ══════════════════════════════════════════════════════

describe('inches', () => {
  test('EMU constant is 914400', () => {
    expect(EMU).toBe(914400);
  });

  test('1 inch = 914400 EMU', () => {
    expect(inches(1)).toBe(914400);
  });

  test('0 inches = 0 EMU', () => {
    expect(inches(0)).toBe(0);
  });

  test('0.5 inches = 457200 EMU', () => {
    expect(inches(0.5)).toBe(457200);
  });

  test('10 inches = 9144000 EMU', () => {
    expect(inches(10)).toBe(9144000);
  });

  test('returns an integer (Math.round)', () => {
    const result = inches(1.33333);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════
// pt
// ══════════════════════════════════════════════════════

describe('pt', () => {
  test('returns object with magnitude and unit PT', () => {
    expect(pt(12)).toEqual({ magnitude: 12, unit: 'PT' });
  });

  test('works for zero', () => {
    expect(pt(0)).toEqual({ magnitude: 0, unit: 'PT' });
  });

  test('works for decimal values', () => {
    expect(pt(10.5)).toEqual({ magnitude: 10.5, unit: 'PT' });
  });

  test('unit is always "PT" string', () => {
    expect(pt(99).unit).toBe('PT');
  });
});

// ══════════════════════════════════════════════════════
// uid
// ══════════════════════════════════════════════════════

describe('uid', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  test('generates IDs with given prefix', () => {
    const id = uid('slide');
    expect(id).toMatch(/^slide_\d+$/);
  });

  test('generates unique IDs on successive calls', () => {
    const a = uid('elem');
    const b = uid('elem');
    expect(a).not.toBe(b);
  });

  test('counter increments monotonically', () => {
    const a = uid('x');
    const b = uid('x');
    const numA = parseInt(a.split('_')[1], 10);
    const numB = parseInt(b.split('_')[1], 10);
    expect(numB).toBeGreaterThan(numA);
  });

  test('different prefixes produce different IDs', () => {
    const a = uid('shape');
    const b = uid('text');
    expect(a).not.toBe(b);
  });

  test('resetIdCounter restarts the counter', () => {
    uid('a');
    uid('a');
    resetIdCounter();
    const id = uid('a');
    expect(id).toBe('a_1');
  });
});

// ══════════════════════════════════════════════════════
// readJSON
// ══════════════════════════════════════════════════════

describe('readJSON', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpers-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reads a valid JSON file and returns parsed object', () => {
    const filePath = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(filePath, JSON.stringify({ key: 'value', num: 42 }));
    expect(readJSON(filePath)).toEqual({ key: 'value', num: 42 });
  });

  test('reads nested JSON correctly', () => {
    const filePath = path.join(tmpDir, 'nested.json');
    const data = { a: { b: [1, 2, 3] } };
    fs.writeFileSync(filePath, JSON.stringify(data));
    expect(readJSON(filePath)).toEqual(data);
  });

  test('returns null for a missing file', () => {
    expect(readJSON(path.join(tmpDir, 'nonexistent.json'))).toBeNull();
  });

  test('returns null for an invalid JSON file', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, '{ not valid json ');
    expect(readJSON(filePath)).toBeNull();
  });

  test('returns null for an empty file', () => {
    const filePath = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(filePath, '');
    expect(readJSON(filePath)).toBeNull();
  });

  test('reads array JSON correctly', () => {
    const filePath = path.join(tmpDir, 'array.json');
    fs.writeFileSync(filePath, JSON.stringify([1, 2, 3]));
    expect(readJSON(filePath)).toEqual([1, 2, 3]);
  });
});
