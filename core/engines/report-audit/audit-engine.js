'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON } = require('../helpers');

/**
 * Audit narrative.json for quality issues.
 * Returns { passed, checks, warnings, errors }
 */
function auditNarrative(narrative) {
  const checks = [];
  const warnings = [];
  const errors = [];

  if (!narrative) {
    errors.push('narrative.json is null or missing');
    return { passed: false, checks, warnings, errors };
  }

  // Check executive_summary
  const summary = narrative.executive_summary || '';
  checks.push('executive_summary_exists');
  if (!summary) {
    errors.push('executive_summary is missing or empty');
  } else if (summary.length < 100) {
    warnings.push(`executive_summary is very short (${summary.length} chars, recommend >= 100)`);
  } else if (summary.length > 2000) {
    warnings.push(`executive_summary is very long (${summary.length} chars, recommend <= 2000)`);
  }

  // Check chapters
  const chapters = narrative.chapters || [];
  checks.push('chapters_exist');
  if (chapters.length === 0) {
    errors.push('No chapters found in narrative');
  }

  for (const chapter of chapters) {
    const chId = chapter.id || 'unknown';

    // Check non-empty paragraphs
    checks.push(`chapter.${chId}.paragraphs`);
    if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
      if (!chapter.insight && !chapter.so_what) {
        warnings.push(`chapter ${chId} has no paragraphs, insight, or so_what`);
      }
    }

    // Check data_table
    if (chapter.data_table) {
      checks.push(`chapter.${chId}.data_table_structure`);
      const headers = chapter.data_table.headers || [];
      const rows = chapter.data_table.rows || [];
      const colCount = headers.length;

      if (colCount === 0) {
        errors.push(`chapter ${chId}: data_table has no headers`);
      }

      for (let i = 0; i < rows.length; i++) {
        if (rows[i].length !== colCount) {
          errors.push(`chapter ${chId}: data_table row ${i} has ${rows[i].length} cols, expected ${colCount}`);
        }
      }

      // Check for N/A or undefined in values
      checks.push(`chapter.${chId}.data_table_values`);
      for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < rows[i].length; j++) {
          const val = String(rows[i][j]);
          if (val === 'N/A' || val === 'undefined' || val === 'null') {
            warnings.push(`chapter ${chId}: data_table[${i}][${j}] = "${val}"`);
          }
        }
      }
    } else {
      checks.push(`chapter.${chId}.data_table_exists`);
      warnings.push(`chapter ${chId} has no data_table`);
    }

    // Check insight
    checks.push(`chapter.${chId}.insight`);
    if (!chapter.insight || chapter.insight.trim().length === 0) {
      warnings.push(`chapter ${chId} has no insight`);
    }
  }

  // Check recommendations
  checks.push('recommendations_exist');
  const recs = narrative.recommendations || [];
  if (recs.length === 0) {
    warnings.push('No recommendations found');
  }

  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i];
    const required = ['priority', 'who', 'what', 'when', 'kpi'];
    for (const field of required) {
      if (!rec[field]) {
        errors.push(`recommendation[${i}] missing required field: ${field}`);
      }
    }
  }

  const passed = errors.length === 0;
  return { passed, checks, warnings, errors };
}

/**
 * Audit the output-meta.json to verify presentation was created.
 */
function auditOutput(runDir) {
  const checks = [];
  const warnings = [];
  const errors = [];

  const metaPath = path.join(runDir, 'output-meta.json');
  checks.push('output_meta_exists');

  if (!fs.existsSync(metaPath)) {
    errors.push(`output-meta.json not found at ${metaPath}`);
    return { passed: false, checks, warnings, errors };
  }

  const meta = readJSON(metaPath);
  if (!meta) {
    errors.push('output-meta.json could not be parsed');
    return { passed: false, checks, warnings, errors };
  }

  checks.push('output_meta_format');
  if (!meta.format) {
    warnings.push('output-meta.json missing format field');
  }

  checks.push('output_meta_generated_at');
  if (!meta.generated_at) {
    warnings.push('output-meta.json missing generated_at field');
  }

  const passed = errors.length === 0;
  return { passed, checks, warnings, errors };
}

/**
 * Full audit: narrative + output.
 * @param {string} runDir - path to the run directory
 * @returns {{ passed: boolean, checks: string[], warnings: string[], errors: string[] }}
 */
function runAudit(runDir) {
  const narrative = readJSON(path.join(runDir, 'narrative.json'));
  const narrativeResult = auditNarrative(narrative);
  const outputResult = auditOutput(runDir);

  return {
    passed: narrativeResult.passed && outputResult.passed,
    checks: [...narrativeResult.checks, ...outputResult.checks],
    warnings: [...narrativeResult.warnings, ...outputResult.warnings],
    errors: [...narrativeResult.errors, ...outputResult.errors],
  };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run');
  if (runIdx === -1 || !args[runIdx + 1]) {
    console.error('Usage: node audit-engine.js --run <path>');
    process.exit(1);
  }
  const runDir = args[runIdx + 1];
  const result = runAudit(runDir);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { auditNarrative, auditOutput, runAudit };
