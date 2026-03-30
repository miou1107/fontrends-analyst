'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * §9+§10 報告產出+品質審核(Report & Audit) — 階段執行器
 *
 * 依序呼叫：
 *   §9  engine.js → PPTX/Slides/Docs
 *   §10 audit-engine.js → 品質分數
 */

/**
 * @param {string} runDir — run 目錄路徑
 * @param {object} options
 * @param {string} options.format — 報告格式 (pptx|gslides|gdocs)，預設 pptx
 * @param {string} options.schema — 報告模板 (full-13|compact-8|mini-3)，預設 full-13
 * @returns {Promise<object>} { status, output, audit }
 */
async function run(runDir, options = {}) {
  const { format = 'pptx', schema = 'full-13' } = options;
  const enginesDir = path.resolve(__dirname, '..', 'engines');
  const coreDir = path.resolve(__dirname, '..');

  // 檢查 narrative.json 是否存在
  if (!fs.existsSync(path.join(runDir, 'narrative.json'))) {
    return { status: 'skipped', reason: 'narrative.json 不存在，無法產出報告' };
  }

  // §9 報告產出
  console.log(`📄 §9 報告產出（${format}, ${schema}）...`);
  let reportOutput;

  try {
    reportOutput = execFileSync('node', [
      path.join(enginesDir, 'engine.js'),
      '--run', runDir,
      '--format', format,
      '--schema', schema,
    ], {
      cwd: coreDir,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(reportOutput);
  } catch (err) {
    console.error(`❌ §9 報告產出失敗: ${err.stderr || err.message}`);
    return { status: 'failed', error: err.message };
  }

  // §10 品質審核
  console.log('🔍 §10 品質審核...');
  let auditResult;

  try {
    const auditOutput = execFileSync('node', [
      path.join(enginesDir, 'report-audit', 'audit-engine.js'),
      '--run-dir', runDir,
    ], {
      cwd: coreDir,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(auditOutput);
    auditResult = { passed: true };
  } catch (err) {
    // audit 失敗不 block pipeline（exit code 1 = FAILED but not crash）
    console.log(err.stdout || '');
    console.error(err.stderr || '');
    auditResult = { passed: false, output: err.stdout };
  }

  return {
    status: 'completed',
    output: `${format} report`,
    audit: auditResult,
  };
}

module.exports = { run };
