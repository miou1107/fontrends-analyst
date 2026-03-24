/**
 * helpers.js — Shared utilities for presentation engine
 * Used by engine.js and all renderers
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// ══════════════════════════════════════════════════════
// Color Conversion
// ══════════════════════════════════════════════════════

/** Convert hex to RGB 0-1 float (for Google APIs) */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255,
  };
}

/** Strip # from hex (for pptxgenjs) */
function hexNoHash(hex) {
  return hex.replace('#', '');
}

/** Google Slides rgbColor wrapper */
function rgbColor(hex) {
  return { rgbColor: hexToRgb(hex) };
}

/** Google Slides solidFill wrapper */
function solidFill(hex) {
  return { solidFill: { color: rgbColor(hex) } };
}

/**
 * Resolve a color key from brand.json
 * e.g., "primary" → "BFA06A", or pass hex through
 */
// Built-in color map for common keys not in brand.json
const BUILTIN_COLORS = {
  white: 'FFFFFF', black: '0A0A0A', gray: '666666',
  lightGray: 'CCCCCC', midGray: '999999',
  positive: '2E7D32', negative: 'C62828', neutral_sent: 'F9A825',
  light: 'F5F0E8', dark: '0A0A0A',
  text_on_dark: 'FFFFFF', text_on_light: '0A0A0A',
};

function resolveColor(colorKeyOrHex, brand) {
  if (!colorKeyOrHex) return 'FFFFFF';
  // 1. Check brand.colors
  if (brand && brand.colors && brand.colors[colorKeyOrHex]) {
    return hexNoHash(brand.colors[colorKeyOrHex]);
  }
  // 2. Check built-in colors
  if (BUILTIN_COLORS[colorKeyOrHex]) {
    return BUILTIN_COLORS[colorKeyOrHex];
  }
  // 3. Assume it's a hex value
  return hexNoHash(colorKeyOrHex);
}

// ══════════════════════════════════════════════════════
// Units
// ══════════════════════════════════════════════════════

const EMU = 914400; // 1 inch in EMU
function inches(n) { return Math.round(n * EMU); }
function pt(n) { return { magnitude: n, unit: 'PT' }; }

// ══════════════════════════════════════════════════════
// ID Generator
// ══════════════════════════════════════════════════════

let _idCounter = 0;
function uid(prefix) { return `${prefix}_${++_idCounter}`; }
function resetIdCounter() { _idCounter = 0; }

// ══════════════════════════════════════════════════════
// File I/O
// ══════════════════════════════════════════════════════

/** Read JSON file, return parsed object or null */
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

/** Write JSON file with pretty formatting */
function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ══════════════════════════════════════════════════════
// OAuth (Google APIs)
// ══════════════════════════════════════════════════════

const DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';

// OAuth paths: configurable via env vars, ~/.fontrends/config.json, or hardcoded defaults
function resolveOAuthPaths() {
  const home = process.env.HOME;
  const configPath = path.join(home, '.fontrends', 'config.json');
  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (_) {}

  return {
    tokenPath: process.env.FONTRENDS_TOKEN_PATH
      || config.google_token_path
      || path.join(home, '.fontrends', 'google-token.json'),
    credentialsPath: process.env.FONTRENDS_CREDENTIALS_PATH
      || config.google_credentials_path
      || path.join(home, 'Downloads',
        'client_secret_1095596038837-vckg8l9pheilrjpa3cj0bgkdpooa7pbj.apps.googleusercontent.com.json'),
  };
}

const { tokenPath: TOKEN_PATH, credentialsPath: CREDENTIALS_PATH } = resolveOAuthPaths();

/**
 * Get authenticated Google OAuth2 client
 * Reuses cached token, auto-refreshes, or prompts for first-time auth
 */
async function getGoogleAuth(scopes) {
  const { google } = require('googleapis');

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`找不到 OAuth Client Secret：${CREDENTIALS_PATH}\n請先從 Google Cloud Console 下載。`);
  }

  const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = content.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000');

  // Check cached token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    oAuth2Client.on('tokens', (tokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      if (tokens.refresh_token) existing.refresh_token = tokens.refresh_token;
      existing.access_token = tokens.access_token;
      existing.expiry_date = tokens.expiry_date;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(existing, null, 2));
      console.log('🔄 Token 已自動刷新');
    });
    console.log('✅ 使用快取 Token');
    return oAuth2Client;
  }

  // First-time auth
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
  console.log('\n🔐 請在瀏覽器開啟以下網址進行授權：');
  const { execSync } = require('child_process');
  try { execSync(`open "${authUrl}"`); } catch (e) { console.log(authUrl); }
  console.log('\n等待 OAuth callback...');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>✅ 授權成功！可以關閉此視窗。</h1>');
        server.close();
        resolve(query.code);
      }
    });
    server.listen(3000);
    setTimeout(() => { server.close(); reject(new Error('授權超時（120s）')); }, 120000);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('💾 Token 已儲存至', TOKEN_PATH);

  return oAuth2Client;
}

// ══════════════════════════════════════════════════════
// Number Formatting
// ══════════════════════════════════════════════════════

/** Format number for display: 4248000 → "424.8 萬" */
function formatNumber(n) {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)} 億`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 萬`;
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

/** Format percentage: 53.0 → "53.0%" */
function formatPct(n) {
  if (n === null || n === undefined) return 'N/A';
  return `${n.toFixed(1)}%`;
}

// ══════════════════════════════════════════════════════
// Google Drive Helpers
// ══════════════════════════════════════════════════════

const DRIVE_FOLDER_NAME = 'FonTrends_AutoReport';

/**
 * Find or create the FonTrends_AutoReport folder in Google Drive.
 * Returns the folder ID.
 */
async function findOrCreateDriveFolder(auth) {
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });

  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files && res.data.files.length > 0) {
    console.log(`  Drive folder found: ${DRIVE_FOLDER_NAME} (${res.data.files[0].id})`);
    return res.data.files[0].id;
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  console.log(`  Drive folder created: ${DRIVE_FOLDER_NAME} (${folder.data.id})`);
  return folder.data.id;
}

/**
 * Move a Google Drive file (doc/slides) into the target folder.
 */
async function moveFileToFolder(auth, fileId, folderId) {
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });

  // Get current parents
  const file = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = (file.data.parents || []).join(',');

  await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: 'id, parents',
  });
  console.log(`  Moved file ${fileId} to ${DRIVE_FOLDER_NAME}/`);
}

/**
 * Generate a sequential filename with datetime and sequence number.
 * Format: "{brandName} {reportType} {YYYY-MM-DD}-{NNN}"
 * e.g. "Louis Vuitton 品牌社群深度分析報告 2026-03-20-001"
 *
 * Scans existing files in the folder to determine the next sequence number.
 */
async function generateSequentialTitle(auth, folderId, brandName, reportType) {
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });

  const now = new Date();
  const tz = 'Asia/Taipei';
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: tz }); // YYYY-MM-DD

  const prefix = `${brandName} ${reportType} ${dateStr}-`;

  // Find existing files with same prefix in folder
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name contains '${prefix}' and trashed=false`,
    fields: 'files(name)',
    spaces: 'drive',
  });

  let maxSeq = 0;
  for (const f of (res.data.files || [])) {
    const match = f.name.match(new RegExp(`${dateStr.replace(/-/g, '\\-')}-(\\d{3})`));
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}${nextSeq}`;
}

// ══════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════

module.exports = {
  // Color
  hexToRgb, hexNoHash, rgbColor, solidFill, resolveColor,
  // Units
  EMU, inches, pt,
  // ID
  uid, resetIdCounter,
  // File
  readJSON, writeJSON,
  // OAuth
  getGoogleAuth, TOKEN_PATH, CREDENTIALS_PATH,
  // Formatting
  formatNumber, formatPct,
  // Drive
  findOrCreateDriveFolder, moveFileToFolder, generateSequentialTitle,
  DRIVE_FOLDER_NAME,
};
