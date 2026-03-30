#!/usr/bin/env node
'use strict';

/**
 * profile-manager.js — 個人檔案(Profile)管理器
 *
 * 每個使用者有自己的分析偏好、學習規則、歷史紀錄。
 * profile 是使用者的持久資產，可匯出帶走、在其他環境匯入。
 *
 * CLI:
 *   node profile-manager.js --list
 *   node profile-manager.js --export vin --format json
 *   node profile-manager.js --export vin --format md
 *   node profile-manager.js --import ~/Desktop/vin-profile.json
 *
 * API:
 *   const { loadProfile, saveProfile, addLearnedRule } = require('./profile-manager');
 */

const fs = require('fs');
const path = require('path');

const PROFILES_DIR = path.join(process.env.HOME, '.fontrends', 'profiles');
const DEFAULT_PROFILE_PATH = path.join(PROFILES_DIR, '_default.json');

// ══════════════════════════════════════════════════════
// 預設 Profile 模板
// ══════════════════════════════════════════════════════

const DEFAULT_PROFILE = {
  user_id: '_default',
  display_name: '新使用者',
  created_at: null,
  updated_at: null,
  preferences: {
    presentation: {
      format: 'pptx',
      tone: 'professional',
      language: 'zh-TW',
      chart_over_table: false,
    },
    analysis: {
      preferred_methods: ['three_layer_comparison'],
      depth: 'standard',
    },
  },
  learned_rules: [],
  history: {
    total_runs: 0,
    last_run: null,
    industries: [],
    brands_analyzed: [],
  },
};

// ══════════════════════════════════════════════════════
// 核心函式
// ══════════════════════════════════════════════════════

function ensureDir() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

/**
 * 讀取 profile，不存在就用 _default
 */
function loadProfile(userId) {
  if (!userId || userId === 'guest') return { ...DEFAULT_PROFILE, user_id: 'guest' };

  ensureDir();
  const filePath = path.join(PROFILES_DIR, `${userId}.json`);

  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return { ...DEFAULT_PROFILE, ...data };
    } catch {
      return { ...DEFAULT_PROFILE, user_id: userId };
    }
  }

  // 不存在就建立新的
  const newProfile = {
    ...DEFAULT_PROFILE,
    user_id: userId,
    display_name: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveProfile(userId, newProfile);
  return newProfile;
}

/**
 * 寫入 profile
 */
function saveProfile(userId, profile) {
  ensureDir();
  profile.updated_at = new Date().toISOString();
  const filePath = path.join(PROFILES_DIR, `${userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
  return profile;
}

/**
 * 追加一條學習規則
 */
function addLearnedRule(userId, rule) {
  const profile = loadProfile(userId);
  if (!profile.learned_rules) profile.learned_rules = [];

  profile.learned_rules.push({
    added_at: new Date().toISOString(),
    ...rule,
  });

  return saveProfile(userId, profile);
}

/**
 * 列出所有 profile
 */
function listProfiles() {
  ensureDir();
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json') && f !== '_default.json');
  return files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf-8'));
      return {
        user_id: data.user_id,
        display_name: data.display_name,
        rules_count: (data.learned_rules || []).length,
        total_runs: data.history?.total_runs || 0,
        last_run: data.history?.last_run || null,
      };
    } catch {
      return { user_id: f.replace('.json', ''), display_name: '(error)', rules_count: 0 };
    }
  });
}

/**
 * 取得特定偏好值（支援 dot path，如 'presentation.format'）
 */
function getPreference(profile, key) {
  const parts = key.split('.');
  let current = profile?.preferences;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * 更新執行歷史
 */
function updateHistory(userId, { brand, industry } = {}) {
  const profile = loadProfile(userId);
  if (!profile.history) profile.history = { total_runs: 0, industries: [], brands_analyzed: [] };

  profile.history.total_runs = (profile.history.total_runs || 0) + 1;
  profile.history.last_run = new Date().toISOString().split('T')[0];

  if (brand && !profile.history.brands_analyzed.includes(brand)) {
    profile.history.brands_analyzed.push(brand);
  }
  if (industry && !profile.history.industries.includes(industry)) {
    profile.history.industries.push(industry);
  }

  return saveProfile(userId, profile);
}

// ══════════════════════════════════════════════════════
// 匯出/匯入
// ══════════════════════════════════════════════════════

/**
 * 匯出 profile（JSON 或 Markdown）
 */
function exportProfile(userId, format = 'json') {
  const profile = loadProfile(userId);

  if (format === 'json') {
    // 移除敏感資訊（目前沒有，但預留）
    const clean = { ...profile };
    return JSON.stringify(clean, null, 2);
  }

  if (format === 'md') {
    const pres = profile.preferences?.presentation || {};
    const analysis = profile.preferences?.analysis || {};
    const rules = profile.learned_rules || [];
    const history = profile.history || {};

    let md = `# ${profile.display_name} 的數據分析偏好\n\n`;
    md += `> 匯出時間：${new Date().toISOString()}\n\n`;

    md += `## 呈現風格(Presentation)\n`;
    md += `- 格式：${pres.format || 'pptx'}\n`;
    md += `- 語氣：${pres.tone || 'professional'}\n`;
    md += `- 語言：${pres.language || 'zh-TW'}\n`;
    md += `- 圖表優先：${pres.chart_over_table ? '是' : '否'}\n\n`;

    md += `## 分析方法(Analysis)\n`;
    md += `- 偏好方法：${(analysis.preferred_methods || []).join(', ') || '無'}\n`;
    md += `- 分析深度：${analysis.depth || 'standard'}\n\n`;

    if (rules.length > 0) {
      md += `## 學習紀錄（${rules.length} 條）\n`;
      for (const r of rules) {
        md += `- ${r.added_at?.split('T')[0] || '?'}：${r.rule}\n`;
      }
      md += '\n';
    }

    if (history.total_runs > 0) {
      md += `## 使用歷史\n`;
      md += `- 執行次數：${history.total_runs}\n`;
      md += `- 最後執行：${history.last_run || 'N/A'}\n`;
      md += `- 分析過的品牌：${(history.brands_analyzed || []).join(', ') || '無'}\n`;
      md += `- 涉及產業：${(history.industries || []).join(', ') || '無'}\n`;
    }

    return md;
  }

  throw new Error(`不支援的格式: ${format}`);
}

/**
 * 匯入 profile（自動合併）
 */
function importProfile(filePath) {
  const resolvedPath = filePath.replace(/^~/, process.env.HOME);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`檔案不存在: ${resolvedPath}`);
  }

  const imported = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  if (!imported.user_id) {
    throw new Error('profile 缺少 user_id');
  }

  const existing = loadProfile(imported.user_id);

  // 合併 learned_rules（追加不重複的）
  const existingRuleTexts = new Set((existing.learned_rules || []).map(r => r.rule));
  const newRules = (imported.learned_rules || []).filter(r => !existingRuleTexts.has(r.rule));
  existing.learned_rules = [...(existing.learned_rules || []), ...newRules];

  // 合併 preferences（匯入的覆蓋）
  if (imported.preferences) {
    existing.preferences = {
      ...existing.preferences,
      ...imported.preferences,
      presentation: { ...existing.preferences?.presentation, ...imported.preferences?.presentation },
      analysis: { ...existing.preferences?.analysis, ...imported.preferences?.analysis },
    };
  }

  // 合併 history
  if (imported.history) {
    existing.history.total_runs = Math.max(existing.history.total_runs || 0, imported.history.total_runs || 0);
    const allBrands = new Set([...(existing.history.brands_analyzed || []), ...(imported.history.brands_analyzed || [])]);
    existing.history.brands_analyzed = [...allBrands];
    const allIndustries = new Set([...(existing.history.industries || []), ...(imported.history.industries || [])]);
    existing.history.industries = [...allIndustries];
  }

  saveProfile(imported.user_id, existing);
  return { user_id: imported.user_id, new_rules: newRules.length, total_rules: existing.learned_rules.length };
}

// ══════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  if (args.includes('--list')) {
    const profiles = listProfiles();
    console.log('\n📋 個人檔案列表：');
    if (profiles.length === 0) {
      console.log('   （無）');
    }
    for (const p of profiles) {
      console.log(`   ${p.display_name} (${p.user_id}) — ${p.rules_count} 條規則, ${p.total_runs} 次執行`);
    }
    process.exit(0);
  }

  const exportUser = getArg('--export');
  if (exportUser) {
    const format = getArg('--format') || 'json';
    const output = exportProfile(exportUser, format);
    console.log(output);
    process.exit(0);
  }

  const importPath = getArg('--import');
  if (importPath) {
    const result = importProfile(importPath);
    console.log(`\n✅ 匯入完成：${result.user_id}`);
    console.log(`   新增規則: ${result.new_rules} 條`);
    console.log(`   總規則數: ${result.total_rules} 條`);
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  node profile-manager.js --list');
  console.log('  node profile-manager.js --export <user_id> [--format json|md]');
  console.log('  node profile-manager.js --import <file_path>');
  process.exit(1);
}

module.exports = {
  loadProfile,
  saveProfile,
  addLearnedRule,
  listProfiles,
  getPreference,
  updateHistory,
  exportProfile,
  importProfile,
  PROFILES_DIR,
};
