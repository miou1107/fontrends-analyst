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
        action_link: 'Recommend action X.',
      },
    ],
    recommendations: [
      { priority: 'immediate', who: 'Marketing', what: 'Boost content', when: 'Q2', kpi: 'Engagement +20%' },
    ],
    market_analysis: {
      swot: {
        strengths: ['High influence'],
        weaknesses: ['Low search volume'],
        opportunities: ['New platform'],
        threats: ['Competitor growth'],
      },
    },
    ...overrides,
  };
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
}

// ── auditNarrative (now auditStructure, exported as auditNarrative) ──

describe('auditNarrative', () => {
  test('no errors with valid narrative', () => {
    const result = auditNarrative(makeNarrative());
    expect(result.errors).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  test('errors when narrative is null', () => {
    const result = auditNarrative(null);
    expect(result.errors).toContain('narrative.json is null or missing');
  });

  test('errors when executive_summary is missing', () => {
    const result = auditNarrative(makeNarrative({ executive_summary: '' }));
    expect(result.errors).toContain('executive_summary is missing or empty');
  });

  test('warns when executive_summary is too short', () => {
    const result = auditNarrative(makeNarrative({ executive_summary: 'Short' }));
    expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
  });

  test('warns when executive_summary is too long', () => {
    const result = auditNarrative(makeNarrative({ executive_summary: 'X'.repeat(2500) }));
    expect(result.warnings.some(w => w.includes('too long'))).toBe(true);
  });

  test('errors when no chapters', () => {
    const result = auditNarrative(makeNarrative({ chapters: [] }));
    expect(result.errors).toContain('No chapters found');
  });

  test('errors on data_table row/column mismatch', () => {
    const narrative = makeNarrative();
    narrative.chapters[0].data_table.rows.push(['only_one_col']);
    const result = auditNarrative(narrative);
    expect(result.errors.some(e => e.includes('cols, expected'))).toBe(true);
  });

  test('warns when chapter has no insight', () => {
    const narrative = makeNarrative();
    narrative.chapters[0].insight = '';
    const result = auditNarrative(narrative);
    expect(result.warnings.some(w => w.includes('missing insight'))).toBe(true);
  });

  test('warns when chapter has no data_table', () => {
    const narrative = makeNarrative();
    delete narrative.chapters[0].data_table;
    const result = auditNarrative(narrative);
    expect(result.warnings.some(w => w.includes('no data_table'))).toBe(true);
  });

  test('errors when recommendation missing required field', () => {
    const narrative = makeNarrative();
    narrative.recommendations = [{ priority: 'immediate' }];
    const result = auditNarrative(narrative);
    expect(result.errors.some(e => e.includes('missing: who'))).toBe(true);
    expect(result.errors.some(e => e.includes('missing: what'))).toBe(true);
  });

  test('warns when no recommendations', () => {
    const result = auditNarrative(makeNarrative({ recommendations: [] }));
    expect(result.warnings.some(w => w.includes('No recommendations'))).toBe(true);
  });

  test('warns when missing SWOT', () => {
    const result = auditNarrative(makeNarrative({ market_analysis: {} }));
    expect(result.warnings.some(w => w.includes('Missing SWOT'))).toBe(true);
  });

  test('warns when missing methodology chapter', () => {
    const result = auditNarrative(makeNarrative());
    expect(result.warnings.some(w => w.includes('methodology'))).toBe(true);
  });

  test('checks quality triangle (insight + so_what + action_link)', () => {
    const narrative = makeNarrative();
    narrative.chapters[0].so_what = '';
    narrative.chapters[0].action_link = '';
    const result = auditNarrative(narrative);
    expect(result.warnings.some(w => w.includes('missing so_what'))).toBe(true);
    expect(result.warnings.some(w => w.includes('missing action_link'))).toBe(true);
  });
});

// ── auditOutput ──

describe('auditOutput', () => {
  test('warns when output-meta.json does not exist', () => {
    const tmpDir = makeTmpDir();
    const result = auditOutput(tmpDir);
    expect(result.warnings.some(w => w.includes('output-meta.json not found'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('no errors when output-meta.json exists', () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'output-meta.json'), JSON.stringify({
      format: 'gslides',
      generated_at: '2026-03-20T00:00:00Z',
    }));
    const result = auditOutput(tmpDir);
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

  test('warns when screenshots directory is empty', () => {
    const tmpDir = makeTmpDir();
    fs.mkdirSync(path.join(tmpDir, 'screenshots'));
    const result = auditOutput(tmpDir);
    expect(result.warnings.some(w => w.includes('screenshots/'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── runAudit (full integration) ──

describe('runAudit', () => {
  test('returns score and summary', () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'narrative.json'), JSON.stringify(makeNarrative()));
    fs.writeFileSync(path.join(tmpDir, 'output-meta.json'), JSON.stringify({
      format: 'pptx', generated_at: '2026-03-20T00:00:00Z',
    }));
    const result = runAudit(tmpDir);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBe(6); // 6 audit dimensions
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
