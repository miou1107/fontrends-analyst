#!/usr/bin/env node
'use strict';

/**
 * capture-looker-tabs.js — 自動擷取 Looker Studio Dashboard 各分頁完整截圖
 *
 * 目的：解決「附錄截圖沒意義」的根因 — 讓 data-extraction pipeline 每次跑都自動產出
 * 對應各分析分頁的完整頁面截圖，存到 runs/<id>/screenshots/，給 report renderer 當附錄。
 *
 * 用法：
 *   node tools/capture-looker-tabs.js \
 *     --url "https://datastudio.google.com/..." \
 *     --run-dir ~/.fontrends/runs/<id> \
 *     --tabs-config core/knowledge/modules/looker-tabs/journey101.yaml
 *
 *   --headless false  # 第一次登入 Google 用，登完按 Enter 再繼續
 *
 * Chrome profile 位置：~/.fontrends/chrome-profile/
 * 第一次用需登入 Google；往後自動重用。
 *
 * 輸出：
 *   runs/<id>/screenshots/
 *     ├─ dashboard-01-social-overview.png
 *     ├─ dashboard-02-trend.png
 *     ├─ ...
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const yaml = require('js-yaml');

const PROFILE_DIR = path.join(process.env.HOME, '.fontrends', 'chrome-profile');
const CHROME_SOURCE_PROFILE = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');

// 從使用者 Chrome Default profile 同步 cookies / login data / 儲存狀態
// 只複製必要檔案，不動使用者 Chrome 本體
function syncFromChromeProfile() {
  if (!fs.existsSync(CHROME_SOURCE_PROFILE)) {
    console.log('  ⚠ Chrome Default profile 不存在，跳過同步');
    return false;
  }
  const dest = path.join(PROFILE_DIR, 'Default');
  fs.mkdirSync(dest, { recursive: true });
  // 關鍵檔：Cookies、Login Data、Preferences、Local Storage、IndexedDB、Session Storage
  const items = [
    'Cookies', 'Cookies-journal',
    'Login Data', 'Login Data-journal',
    'Preferences', 'Secure Preferences',
    'Local Storage', 'IndexedDB', 'Session Storage',
    'Web Data', 'Web Data-journal',
  ];
  let copied = 0;
  for (const item of items) {
    const src = path.join(CHROME_SOURCE_PROFILE, item);
    const dst = path.join(dest, item);
    if (!fs.existsSync(src)) continue;
    try {
      execSync(`rm -rf "${dst}"`, { stdio: 'pipe' });
      execSync(`cp -R "${src}" "${dst}"`, { stdio: 'pipe' });
      copied++;
    } catch (e) {
      console.log(`  ⚠ 複製 ${item} 失敗：${e.message.split('\n')[0]}`);
    }
  }
  // 複製 Local State（profile index mapping）
  const localState = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'Local State');
  if (fs.existsSync(localState)) {
    try { execSync(`cp "${localState}" "${PROFILE_DIR}/Local State"`, { stdio: 'pipe' }); copied++; } catch {}
  }
  console.log(`  📥 從 Chrome Default 同步了 ${copied} 項（Cookies / Login / Storage）`);
  return true;
}

function parseArgs() {
  const args = { headless: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--run-dir') args.runDir = argv[++i];
    else if (argv[i] === '--tabs-config') args.tabsConfig = argv[++i];
    else if (argv[i] === '--headless') args.headless = argv[++i] !== 'false';
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
capture-looker-tabs.js — 自動擷取 Looker Studio 分頁完整截圖

用法：
  node tools/capture-looker-tabs.js --url <URL> --run-dir <path> --tabs-config <yaml>

必要：
  --url <URL>              Looker Studio 第一個分頁網址（含 ?s=... filter query）
  --run-dir <path>         Run 目錄（截圖會存到其下 screenshots/）
  --tabs-config <yaml>     分頁定義 YAML（見 core/knowledge/modules/looker-tabs/）

選用：
  --headless false         看得見瀏覽器（第一次登入 Google 時用）

第一次使用（登入）：
  node tools/capture-looker-tabs.js --url <URL> --run-dir <path> --tabs-config <yaml> --headless false
  → 瀏覽器開啟，手動登入 Google 後按終端機 Enter 繼續

後續（自動）：
  node tools/capture-looker-tabs.js --url <URL> --run-dir <path> --tabs-config <yaml>
`);
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.url || !args.runDir || !args.tabsConfig) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const runDir = args.runDir.replace(/^~/, process.env.HOME);
  const screenshotsDir = path.join(runDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const tabsYaml = fs.readFileSync(args.tabsConfig, 'utf8');
  const tabsDef = yaml.load(tabsYaml);
  const tabs = tabsDef.tabs || [];
  if (tabs.length === 0) {
    console.error('❌ tabs-config 沒有定義 tabs 陣列');
    process.exit(1);
  }

  console.log(`🎬 capture-looker-tabs`);
  console.log(`   Profile: ${PROFILE_DIR}`);
  console.log(`   Run: ${runDir}`);
  console.log(`   Tabs: ${tabs.length}`);
  console.log(`   Headless: ${args.headless}`);

  // 首次 / 每次都從 Chrome Default profile 同步 cookies（輕量）
  console.log(`\n🔑 同步登入狀態`);
  syncFromChromeProfile();

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: args.headless,
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2, // retina quality
  });

  const page = context.pages()[0] || await context.newPage();

  // First tab
  console.log(`\n📂 載入首頁：${args.url}`);
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Check login status
  const title = await page.title();
  if (!title.includes('Dashboard') && !title.includes('Journey') && !title.includes('Looker')) {
    if (args.headless) {
      console.error('⚠️ 似乎尚未登入 Google（title 不含 Dashboard）。請用 --headless false 登入後再跑。');
      await context.close();
      process.exit(2);
    } else {
      console.log('\n⏸  請在瀏覽器完成 Google 登入，完成後按此 Enter 繼續...');
      await waitForEnter();
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
  }

  // Wait for dashboard fully rendered
  await page.waitForTimeout(8000);

  for (const tab of tabs) {
    console.log(`\n📸 ${tab.id} — ${tab.title || tab.id}`);
    try {
      // 用 getByRole 精確匹配 tree item name（避免 has-text 模糊比對）
      const item = page.getByRole('treeitem', { name: tab.label, exact: true });
      await item.click({ timeout: 10000 });

      // 等分頁切換 + charts render
      await page.waitForTimeout(tab.wait_ms || 6000);

      // 驗證：檢查 URL 或 tab aria-selected 確認真的切過去
      const url = page.url();
      console.log(`   → URL: ${url.split('?')[0].split('/').pop()}`);

      // Scroll to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      const filePath = path.join(screenshotsDir, `dashboard-${tab.id}.png`);
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`   ✅ ${filePath}`);
    } catch (err) {
      console.warn(`   ⚠ 失敗: ${err.message.split('\n')[0]}`);
    }
  }

  await context.close();
  console.log(`\n✅ 完成。截圖位於：${screenshotsDir}`);
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}
