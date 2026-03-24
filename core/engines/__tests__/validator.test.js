'use strict';

const { validate, validateAndWarn } = require('../validator');

// ══════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════

/** Minimal valid narrative.json payload */
function makeValidNarrative(overrides = {}) {
  return {
    meta: {
      brand: 'Louis Vuitton',
      period: '2025-Q4',
    },
    title: '品牌社群聲量分析報告',
    chapters: [
      {
        id: 'social_overview',
        title: '社群總覽',
        paragraphs: ['本季品牌聲量表現亮眼。'],
      },
    ],
    ...overrides,
  };
}

/** Minimal valid interview.json payload */
function makeValidInterview(overrides = {}) {
  return {
    brand: 'LV',
    purpose: 'sell-venue',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════
// validate — narrative schema
// ══════════════════════════════════════════════════════

describe('validate — narrative schema', () => {
  test('returns {valid: true} for a well-formed narrative', () => {
    const result = validate('narrative', makeValidNarrative());
    expect(result).toEqual({ valid: true });
  });

  test('returns {valid: false} when title is missing', () => {
    const data = makeValidNarrative();
    delete data.title;
    const result = validate('narrative', data);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('returns {valid: false} when chapters is missing', () => {
    const data = makeValidNarrative();
    delete data.chapters;
    const result = validate('narrative', data);
    expect(result.valid).toBe(false);
  });

  test('returns {valid: false} when meta.brand is missing', () => {
    const data = makeValidNarrative();
    delete data.meta.brand;
    const result = validate('narrative', data);
    expect(result.valid).toBe(false);
  });

  test('returns {valid: false} when meta.period is missing', () => {
    const data = makeValidNarrative();
    delete data.meta.period;
    const result = validate('narrative', data);
    expect(result.valid).toBe(false);
  });

  test('returns {valid: false} when meta is an empty object', () => {
    const data = makeValidNarrative({ meta: {} });
    const result = validate('narrative', data);
    expect(result.valid).toBe(false);
  });

  test('returns {valid: false} when chapters is an empty array (minItems: 1)', () => {
    const data = makeValidNarrative({ chapters: [] });
    const result = validate('narrative', data);
    expect(result.valid).toBe(false);
  });

  test('returns {valid: false} when a chapter is missing required "id"', () => {
    const data = makeValidNarrative({
      chapters: [{ title: 'No ID', paragraphs: [] }],
    });
    const result = validate('narrative', data);
    expect(result.valid).toBe(false);
  });

  test('error messages include field paths', () => {
    const data = makeValidNarrative({ meta: {} });
    const result = validate('narrative', data);
    expect(result.errors.some(e => e.includes('brand') || e.includes('period') || e.includes('meta'))).toBe(true);
  });

  test('accepts optional fields: executive_summary, recommendations', () => {
    const data = makeValidNarrative({
      executive_summary: '本季亮點摘要。',
      recommendations: [
        { priority: '立即', who: '行銷部', what: '聯名活動', when: 'Q3', kpi: '+20%到店' },
      ],
    });
    const result = validate('narrative', data);
    expect(result.valid).toBe(true);
  });
});

// ══════════════════════════════════════════════════════
// validate — interview schema
// ══════════════════════════════════════════════════════

describe('validate — interview schema', () => {
  test('returns {valid: true} for a valid interview object', () => {
    const result = validate('interview', makeValidInterview());
    expect(result).toEqual({ valid: true });
  });

  test('returns {valid: true} for all valid purpose enum values', () => {
    const purposes = ['sell-venue', 'brand-review', 'competitive-analysis', 'market-entry', 'prove-partnership-value'];
    for (const purpose of purposes) {
      const result = validate('interview', makeValidInterview({ purpose }));
      expect(result.valid).toBe(true);
    }
  });

  test('returns {valid: false} when brand is missing', () => {
    const data = makeValidInterview();
    delete data.brand;
    const result = validate('interview', data);
    expect(result.valid).toBe(false);
  });

  test('returns {valid: false} when purpose is missing', () => {
    const data = makeValidInterview();
    delete data.purpose;
    const result = validate('interview', data);
    expect(result.valid).toBe(false);
  });

  test('returns {valid: false} when purpose is not in enum', () => {
    const result = validate('interview', makeValidInterview({ purpose: 'invalid-purpose' }));
    expect(result.valid).toBe(false);
  });

  test('accepts optional venue and audience fields', () => {
    const data = makeValidInterview({ venue: '台北 101', audience: '精品消費者' });
    const result = validate('interview', data);
    expect(result.valid).toBe(true);
  });

  test('accepts optional output_formats array', () => {
    const data = makeValidInterview({ output_formats: ['pptx', 'gslides'] });
    const result = validate('interview', data);
    expect(result.valid).toBe(true);
  });

  test('returns {valid: false} when output_formats has invalid value', () => {
    const data = makeValidInterview({ output_formats: ['word'] });
    const result = validate('interview', data);
    expect(result.valid).toBe(false);
  });
});

// ══════════════════════════════════════════════════════
// validate — unknown schema
// ══════════════════════════════════════════════════════

describe('validate — unknown schema', () => {
  test('returns {valid: true} with a warning when schema is unknown', () => {
    const result = validate('unknown_schema', { anything: true });
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('unknown_schema');
  });

  test('warning message mentions "not found" or "skipping"', () => {
    const result = validate('totally_unknown', {});
    expect(result.warnings[0]).toMatch(/not found|skipping/i);
  });
});

// ══════════════════════════════════════════════════════
// validateAndWarn
// ══════════════════════════════════════════════════════

describe('validateAndWarn', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('returns true and does not log for valid data', () => {
    const result = validateAndWarn('narrative', makeValidNarrative(), 'narrative.json');
    expect(result).toBe(true);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test('returns false and logs warnings for invalid narrative', () => {
    const data = makeValidNarrative({ meta: {} }); // missing brand, period
    const result = validateAndWarn('narrative', data, 'narrative.json');
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('logs schema validation failure message with fileName', () => {
    const data = makeValidNarrative({ meta: {} });
    validateAndWarn('narrative', data, 'narrative.json');
    const allCalls = consoleSpy.mock.calls.flat().join('\n');
    expect(allCalls).toContain('narrative.json');
  });

  test('prints warnings for unknown schema and returns true', () => {
    const result = validateAndWarn('no_such_schema', {}, 'test.json');
    expect(result).toBe(true);
    // Warning from the {valid: true, warnings: [...]} branch
    expect(consoleSpy).toHaveBeenCalled();
    const allCalls = consoleSpy.mock.calls.flat().join('\n');
    expect(allCalls).toContain('no_such_schema');
  });

  test('returns true for valid interview data', () => {
    const result = validateAndWarn('interview', makeValidInterview(), 'interview.json');
    expect(result).toBe(true);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test('each validation error is printed as a separate log line', () => {
    // Two errors: missing brand and missing purpose
    const data = {};
    validateAndWarn('interview', data, 'interview.json');
    // At least 2 console.log calls (header + each error line)
    expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
