'use strict';

/**
 * env.js — 統一環境變數載入
 *
 * 載入順序（後者覆蓋前者）：
 * 1. 專案 .env 檔（fontrends-analyst/.env）
 * 2. ~/.fontrends/config.json（向後相容）
 * 3. 系統環境變數（最高優先）
 */

const fs = require('fs');
const path = require('path');

// 載入 .env
const projectRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// 向後相容：讀 ~/.fontrends/config.json 補齊缺少的 env
const configPath = path.join(process.env.HOME, '.fontrends', 'config.json');
let legacyConfig = {};
try { legacyConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (_) {}

/**
 * 取得設定值。優先順序：env > config.json > default
 */
function getConfig(key, legacyPath, defaultValue) {
  // 1. 環境變數
  if (process.env[key]) return process.env[key];

  // 2. config.json 用 dot path 取值
  if (legacyPath && legacyConfig) {
    const parts = legacyPath.split('.');
    let val = legacyConfig;
    for (const p of parts) {
      val = val?.[p];
    }
    if (val !== undefined && val !== null) return val;
  }

  // 3. 預設值
  return defaultValue;
}

// ══════════════════════════════════════════════════════
// 匯出所有設定
// ══════════════════════════════════════════════════════

module.exports = {
  // DataForSEO
  DATAFORSEO_LOGIN: getConfig('DATAFORSEO_LOGIN', 'dataforseo.login', ''),
  DATAFORSEO_PASSWORD: getConfig('DATAFORSEO_PASSWORD', 'dataforseo.password', ''),

  // Google OAuth
  GOOGLE_CREDENTIALS_PATH: getConfig('GOOGLE_CREDENTIALS_PATH', 'google_credentials_path',
    path.join(process.env.HOME, '.fontrends', 'google-credentials.json')),
  GOOGLE_TOKEN_PATH: getConfig('GOOGLE_TOKEN_PATH', 'google_token_path',
    path.join(process.env.HOME, '.fontrends', 'google-token.json')),

  // SSH
  DATAMINING_HOST: getConfig('DATAMINING_HOST', 'datamining_server.host', ''),
  DATAMINING_USER: getConfig('DATAMINING_USER', 'datamining_server.user', ''),
  DATAMINING_PASSWORD: getConfig('DATAMINING_PASSWORD', 'datamining_server.password', ''),

  // Paths
  FONTRENDS_RUNS_DIR: getConfig('FONTRENDS_RUNS_DIR', null,
    path.join(process.env.HOME, '.fontrends', 'runs')),
  FONTRENDS_DRIVE_FOLDER: getConfig('FONTRENDS_DRIVE_FOLDER', null, 'FonTrends_AutoReport'),
  OAUTH_CALLBACK_PORT: parseInt(getConfig('OAUTH_CALLBACK_PORT', null, '3000'), 10),

  // Helper
  getConfig,
};
