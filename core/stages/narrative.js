'use strict';

const path = require('path');
const fs = require('fs');

/**
 * §7 敘事包裝(Narrative) — 階段執行器
 *
 * 這是目前唯一「需要 AI 介入」的階段。
 * 處理方式：
 *   - 如果 narrative.json 已存在 → 跳過（已由 AI 或外部工具產出）
 *   - 如果不存在 → 標記為需要 AI 介入，通知使用者
 *
 * 未來可以接 Claude API / Gemini API 自動產出。
 */

/**
 * @param {string} runDir — run 目錄路徑
 * @param {object} options
 * @param {UserInputProvider} options.userInput — 使用者輸入介面
 * @returns {Promise<object>} { status, output }
 */
async function run(runDir, options = {}) {
  const narrativePath = path.join(runDir, 'narrative.json');

  // 如果 narrative.json 已存在，直接使用
  if (fs.existsSync(narrativePath)) {
    console.log('📖 narrative.json 已存在，使用現有版本');
    return { status: 'completed', output: 'narrative.json' };
  }

  // narrative.json 不存在 → 需要 AI 產出
  const message = [
    '',
    '⚠️  §7 敘事包裝需要 AI 介入',
    '   narrative.json 尚未產出。請使用以下方式之一：',
    '   1. 用 Claude/Codex/Gemini 的 narrative-packaging skill 產出',
    '   2. 手動建立 narrative.json 放到 run 目錄',
    `   3. 目標路徑: ${narrativePath}`,
    '',
  ].join('\n');

  if (options.userInput) {
    await options.userInput.notify(message);
  } else {
    console.log(message);
  }

  // 自動模式：跳過但不失敗
  if (options.auto || options.skipNarrative) {
    console.log('⏭️  自動模式，跳過 §7（需事後補上 narrative.json）');
    return { status: 'skipped', reason: 'requires_ai' };
  }

  // 互動模式：等使用者確認
  if (options.userInput) {
    const ready = await options.userInput.confirm('narrative.json 準備好了嗎？');
    if (ready && fs.existsSync(narrativePath)) {
      return { status: 'completed', output: 'narrative.json' };
    }
  }

  return { status: 'skipped', reason: 'requires_ai' };
}

module.exports = { run };
