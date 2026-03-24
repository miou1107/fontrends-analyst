'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { auditNarrative, auditOutput, runAudit } = require('../audit-engine');

// ── Helpers ──

function makeNarrative(overrides = {}) {
  return {
    executive_summary: 'A'.repeat(150),
    chapters: [
      {
        id: 'social_overview',
        title: 'Social Overview',
        paragraphs: ['Brand influence grew 15%.'],
        data_table: {
          headers: ['Metric', 'Value'],
          rows: [['Influence', '100,000'], ['Posts', '500']],
        },
        insight: 'Brand is growing steadily.',
        so_what: 'Continue current strategy.',
      },
    ],
    recommendations: [
      { priority: 'immediate', who: 'Marketing', what: 'Boost content', when: 'Q2', kpi: 'Engagement +20%' },
    ],
    ...overrides,
  };
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
}

// ── Tests ──

describe('auditNarrative', () => {
  test('passes with valid narrative', () => {
    const result = auditNarrative(makeNarrative());
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  test('fails when narrative is null', () => {
    const result = auditNarrative(null);
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('narrative.json is null or missing');
  });

  test('errors when executive_summary is missing', () => {
    const result = auditNarrative(makeNarrative({ executive_summary: '' }));
    expect(result.errors).toContain('executive_summary is missing or empty');
  });

  test('warns when executive_summary is too short', () => {
    const result = auditNarrative(makeNarrative({ executive_summary: 'Short' }));
    expect(result.warnings.some(w => w.includes('very short'))).toBe(true);
  });

  test('warns when executive_summary is too long', () => {
    const result = auditNarrative(makeNarrative({ executive_summary: 'X'.repeat(2500) }));
    expect(result.warnings.some(w => w.includes('very long'))).toBe(true);
  });

  test('errors when no chapters', () => {
    const result = auditNarrative(makeNarrative({ chapters: [] }));
    expect(result.errors).toContain('No chapters found in narrative');
  });

  test('errors on data_table row/column mismatch', () => {
    const narrative = makeNarrative();
    narrative.chapters[0].data_table.rows.push(['only_one_col']);
    const result = auditNarrative(narrative);
    expect(result.errors.some(e => e.includes('cols, expected'))).toBe(true);
  });

  test('warns on N/A values in data_table', () => {
    const narrative = makeNarrative();
    narrative.chapters[0].data_table.rows[0][1] = 'N/A';
    const result = auditNarrative(narrative);
    expect(result.warnings.some(w => w.includes('N/A'))).toBe(true);
  });

  test('warns on undefined values in data_table', () => {
    const narrative = makeNarrative();
    narrative.chapters[0].data_table.rows[0][1] = 'undefined';
    const result = auditNarrative(narrative);
    expect(result.warnings.some(w => w.includes('undefined'))).toBe(true);
  });

  test('warns when chapter has no insight', () => {
    const narrative = makeNarrative();
    narrative.chapters[0].insight = '';
    const result = auditNarrative(narrative);
    expect(result.warnings.some(w => w.includes('no insight'))).toBe(true);
  });

  test('errors when recommendation is missing required field', () => {
    const narrative = makeNarrative();
    narrative.recommendations = [{ priority: 'immediate' }];
    const result = auditNarrative(narrative);
    expect(result.errors.some(e => e.includes('missing required field: who'))).toBe(true);
    expect(result.errors.some(e => e.includes('missing required field: what'))).toBe(true);
  });

  test('warns when no data_table in chapter', () => {
    const narrative = makeNarrative();
    delete narrative.chapters[0].data_table;
    const result = auditNarrative(narrative);
    expect(result.warnings.some(w => w.includes('no data_table'))).toBe(true);
  });

  test('warns when no recommendations', () => {
    const result = auditNarrative(makeNarrative({ recommendations: [] }));
    expect(result.warnings).toContain('No recommendations found');
  });
});

describe('auditOutput', () => {
  test('errors when output-meta.json does not exist', () => {
    const tmpDir = makeTmpDir();
    const result = auditOutput(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.includes('output-meta.json not found'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('passes when output-meta.json exists with format and generated_at', () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'output-meta.json'), JSON.stringify({
      format: 'gslides',
      generated_at: '2026-03-20T00:00:00Z',
    }));
    const result = auditOutput(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('warns when output-meta.json missing format', () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'output-meta.json'), JSON.stringify({ generated_at: 'x' }));
    const result = auditOutput(tmpDir);
    expect(result.warnings.some(w => w.includes('missing format'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('runAudit', () => {
  test('combines narrative and output results', () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'narrative.json'), JSON.stringify(makeNarrative()));
    fs.writeFileSync(path.join(tmpDir, 'output-meta.json'), JSON.stringify({
      format: 'pptx', generated_at: '2026-03-20T00:00:00Z',
    }));
    const result = runAudit(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.checks.length).toBeGreaterThan(5);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('fails when narrative is bad', () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'narrative.json'), 'invalid json{{{');
    const result = runAudit(tmpDir);
    expect(result.passed).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
