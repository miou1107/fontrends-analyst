'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * §2+§3 數據擷取(Extraction) — 階段執行器
 *
 * 呼叫 extract-all.js 執行 MySQL DB 查詢 + DataForSEO 研究蒐集。
 * 不依賴任何 AI 或瀏覽器。
 */

/**
 * @param {string} runDir — run 目錄路徑
 * @param {object} options
 * @returns {Promise<object>} { status, output }
 */
async function run(runDir, options = {}) {
  const enginePath = path.resolve(__dirname, '..', 'engines', 'research', 'extract-all.js');

  if (!fs.existsSync(enginePath)) {
    throw new Error(`找不到擷取引擎: ${enginePath}`);
  }

  console.log('📊 §2+§3 數據擷取開始...');

  try {
    const output = execFileSync('node', [enginePath, '--run-dir', runDir], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 120000, // 2 分鐘
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log(output);

    // 確認產出檔案
    const dataExists = fs.existsSync(path.join(runDir, 'data.json'));
    const researchExists = fs.existsSync(path.join(runDir, 'research.json'));

    if (!dataExists) {
      return { status: 'failed', error: 'data.json 未產出' };
    }

    return {
      status: 'completed',
      output: 'data.json' + (researchExists ? ', research.json' : ''),
    };
  } catch (err) {
    return {
      status: 'failed',
      error: err.stderr || err.message,
    };
  }
}

module.exports = { run };
