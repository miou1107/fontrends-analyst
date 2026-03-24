'use strict';

/**
 * env.js — 統一設定載入
 *
 * 兩層設定來源：
 * 1. fontrends.config.json — 專案行為設定（進 git，大家共用）
 * 2. .env — 機敏資訊 credentials（不進 git）
 * 系統環境變數可覆蓋一切（最高優先）
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');

// 1. 載入 fontrends.config.json（專案行為設定）
const configFilePath = path.join(projectRoot, 'fontrends.config.json');
let projectConfig = {};
try { projectConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8')); } catch (_) {}

// 2. 載入 .env（credentials）
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

/**
 * 用 dot path 從物件取值
 */
function getByPath(obj, dotPath) {
  if (!obj || !dotPath) return undefined;
  const parts = dotPath.split('.');
  let val = obj;
  for (const p of parts) {
    val = val?.[p];
  }
  return val !== undefined && val !== null ? val : undefined;
}

/**
 * 取得設定值。優先順序：env var > .env > fontrends.config.json > default
 */
function getConfig(envKey, configPath, defaultValue) {
  if (process.env[envKey]) return process.env[envKey];
  if (configPath) { const v = getByPath(projectConfig, configPath); if (v !== undefined) return v; }
  return defaultValue;
}

// ══════════════════════════════════════════════════════
// Credentials（從 .env）
// ══════════════════════════════════════════════════════

const DATAFORSEO_LOGIN = getConfig('DATAFORSEO_LOGIN', null, '');
const DATAFORSEO_PASSWORD = getConfig('DATAFORSEO_PASSWORD', null, '');

const GOOGLE_CREDENTIALS_PATH = getConfig('GOOGLE_CREDENTIALS_PATH', null,
  path.join(process.env.HOME, '.fontrends', 'google-credentials.json'));
const GOOGLE_TOKEN_PATH = getConfig('GOOGLE_TOKEN_PATH', null,
  path.join(process.env.HOME, '.fontrends', 'google-token.json'));

const DATAMINING_HOST = getConfig('DATAMINING_HOST', null, '');
const DATAMINING_USER = getConfig('DATAMINING_USER', null, '');
const DATAMINING_PASSWORD = getConfig('DATAMINING_PASSWORD', null, '');

// ══════════════════════════════════════════════════════
// 專案行為設定（從 fontrends.config.json）
// ══════════════════════════════════════════════════════

// 地區
const DEFAULT_LOCATION = getConfig('DEFAULT_LOCATION', 'region.default_location', 'Taiwan');
const DEFAULT_LANGUAGE = getConfig('DEFAULT_LANGUAGE', 'region.default_language', 'Chinese (Traditional)');

// 報告
const DEFAULT_SCHEMA = getConfig('DEFAULT_SCHEMA', 'report.default_schema', 'full-13');
const DEFAULT_OUTPUT_FORMATS = projectConfig.report?.default_output_formats || ['gdocs', 'gslides'];
const GOOGLE_DRIVE_FOLDER_NAME = getConfig('GOOGLE_DRIVE_FOLDER_NAME', 'report.google_drive_folder_name', 'FonTrends_AutoReport');

// OAuth
const OAUTH_CALLBACK_PORT = parseInt(getConfig('OAUTH_CALLBACK_PORT', 'oauth.oauth_callback_port', '3000'), 10);

// 路徑
const RUNS_DIRECTORY = getConfig('RUNS_DIRECTORY', 'paths.runs_directory',
  path.join(process.env.HOME, '.fontrends', 'runs'));
const SCREENSHOTS_SUBDIRECTORY = getConfig('SCREENSHOTS_SUBDIRECTORY', 'paths.screenshots_subdirectory', 'screenshots');

// DataForSEO API
const DATAFORSEO_API_BASE_HOSTNAME = getConfig('DATAFORSEO_API_BASE_HOSTNAME', 'dataforseo_api.api_base_hostname', 'api.dataforseo.com');
const DATAFORSEO_NEWS_SEARCH_DEPTH = parseInt(getConfig('DATAFORSEO_NEWS_SEARCH_DEPTH', 'dataforseo_api.news_search_depth', '10'), 10);
const DATAFORSEO_KEYWORD_QUERY_LIMIT = parseInt(getConfig('DATAFORSEO_KEYWORD_QUERY_LIMIT', 'dataforseo_api.keyword_query_limit', '50'), 10);
const DATAFORSEO_RELATED_KEYWORD_LIMIT = parseInt(getConfig('DATAFORSEO_RELATED_KEYWORD_LIMIT', 'dataforseo_api.related_keyword_limit', '30'), 10);

// 品質審核
const AUDIT_MINIMUM_CHAPTER_COUNT = parseInt(getConfig('AUDIT_MINIMUM_CHAPTER_COUNT', 'quality_audit.minimum_chapter_count', '5'), 10);
const AUDIT_ENABLE_EMPTY_TALK_DETECTION = getConfig('AUDIT_ENABLE_EMPTY_TALK_DETECTION', 'quality_audit.enable_empty_talk_detection', true);
const AUDIT_PASSING_SCORE_THRESHOLD = parseInt(getConfig('AUDIT_PASSING_SCORE_THRESHOLD', 'quality_audit.passing_score_threshold', '70'), 10);

// 瀏覽器擷取
const PAGE_LOAD_WAIT_SECONDS = parseInt(getConfig('PAGE_LOAD_WAIT_SECONDS', 'browser_extraction.page_load_wait_seconds', '10'), 10);
const FILTER_APPLY_WAIT_SECONDS = parseInt(getConfig('FILTER_APPLY_WAIT_SECONDS', 'browser_extraction.filter_apply_wait_seconds', '4'), 10);
const PREFER_READONLY_ACCOUNT = getConfig('PREFER_READONLY_ACCOUNT', 'browser_extraction.prefer_readonly_account', true);
const READONLY_ACCOUNT_PATH = getConfig('READONLY_ACCOUNT_PATH', 'browser_extraction.readonly_account_path', '/u/0/');

// ══════════════════════════════════════════════════════
module.exports = {
  // Credentials
  DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
  GOOGLE_CREDENTIALS_PATH, GOOGLE_TOKEN_PATH,
  DATAMINING_HOST, DATAMINING_USER, DATAMINING_PASSWORD,

  // 地區
  DEFAULT_LOCATION, DEFAULT_LANGUAGE,

  // 報告
  DEFAULT_SCHEMA, DEFAULT_OUTPUT_FORMATS, GOOGLE_DRIVE_FOLDER_NAME,

  // OAuth
  OAUTH_CALLBACK_PORT,

  // 路徑
  RUNS_DIRECTORY, SCREENSHOTS_SUBDIRECTORY,

  // DataForSEO API
  DATAFORSEO_API_BASE_HOSTNAME, DATAFORSEO_NEWS_SEARCH_DEPTH,
  DATAFORSEO_KEYWORD_QUERY_LIMIT, DATAFORSEO_RELATED_KEYWORD_LIMIT,

  // 品質審核
  AUDIT_MINIMUM_CHAPTER_COUNT, AUDIT_ENABLE_EMPTY_TALK_DETECTION, AUDIT_PASSING_SCORE_THRESHOLD,

  // 瀏覽器擷取
  PAGE_LOAD_WAIT_SECONDS, FILTER_APPLY_WAIT_SECONDS,
  PREFER_READONLY_ACCOUNT, READONLY_ACCOUNT_PATH,

  // Helper
  getConfig,
};
