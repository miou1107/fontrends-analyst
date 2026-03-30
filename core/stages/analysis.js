'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * §4-§6 數據分析(Analysis) — 階段執行器
 *
 * 依序呼叫：
 *   §4 analysis-engine.js → analysis.json
 *   §5 purpose-binder.js  → purpose.json
 *   §6 script-planner.js  → script.json
 */

const STEPS = [
  { name: '§4 數據分析', script: 'analysis/analysis-engine.js', output: 'analysis.json' },
  { name: '§5 目的綁定', script: 'purpose-binder/purpose-binder.js', output: 'purpose.json' },
  { name: '§6 腳本規劃', script: 'script-planner/script-planner.js', output: 'script.json' },
];

/**
 * @param {string} runDir — run 目錄路徑
 * @param {object} options
 * @returns {Promise<object>} { status, output }
 */
async function run(runDir, options = {}) {
  const enginesDir = path.resolve(__dirname, '..', 'engines');
  const outputs = [];

  for (const step of STEPS) {
    const scriptPath = path.join(enginesDir, step.script);

    if (!fs.existsSync(scriptPath)) {
      console.log(`⚠️ ${step.name}: 找不到 ${step.script}，跳過`);
      continue;
    }

    console.log(`🔄 ${step.name}...`);

    try {
      const result = execFileSync('node', [scriptPath, '--run-dir', runDir], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(result);
      outputs.push(step.output);
    } catch (err) {
      console.error(`❌ ${step.name} 失敗: ${err.stderr || err.message}`);
      return { status: 'failed', error: `${step.name}: ${err.message}`, outputs };
    }
  }

  return {
    status: 'completed',
    output: outputs.join(', '),
  };
}

module.exports = { run };
