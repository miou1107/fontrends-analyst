'use strict';

// Knowledge Loader — L2 ↔ L3 唯一合法介面
// 詳見 openspec/specs/knowledge-layer/spec.md
//
// 執行順序（後蓋前）：
//   1. _defaults.yaml
//   2. Stance resolver 產出（audience + purpose + focus → modules + overrides）
//   3. profile.extends 指定的 modules
//   4. profile.overrides
//   5. learned-rules overlay（Phase 3 接入）
//   6. CLI flag overrides（debug）
//
// 產出 frozen snapshot，engines 透過 snapshot.get(path) 讀值。
// 找不到 key → throw（禁止內建 fallback 預設值）。

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const KNOWLEDGE_ROOT = path.join(__dirname, 'knowledge');

// ─────────────────────────────────────────────
// File loading helpers
// ─────────────────────────────────────────────

function loadYaml(relPath) {
  const full = path.join(KNOWLEDGE_ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`[knowledge-loader] missing file: ${relPath}`);
  }
  try {
    return yaml.load(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    throw new Error(`[knowledge-loader] YAML parse error in ${relPath}: ${err.message}`);
  }
}

function loadModule(type, name) {
  // profile key 用 underscore（time_windows），目錄用 hyphen（time-windows）
  const dirName = type.replace(/_/g, '-');
  return loadYaml(path.join('modules', dirName, `${name}.yaml`));
}

function loadModuleChain(type, name) {
  // 處理 _meta.extends 繼承鏈
  const chain = [];
  let current = name;
  const seen = new Set();
  while (current) {
    if (seen.has(current)) {
      throw new Error(`[knowledge-loader] circular extends in modules/${type}: ${[...seen, current].join(' → ')}`);
    }
    seen.add(current);
    const mod = loadModule(type, current);
    chain.unshift(mod); // 父在前、子在後（後蓋前）
    current = mod._meta?.extends || null;
  }
  return chain;
}

// ─────────────────────────────────────────────
// Deep merge（後蓋前）
// ─────────────────────────────────────────────

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, source) {
  if (!isObject(source)) return source;
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (isObject(out[key]) && isObject(source[key])) {
      out[key] = deepMerge(out[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function applyDottedOverrides(target, overrides) {
  if (!overrides) return target;
  let result = target;
  for (const [dotPath, value] of Object.entries(overrides)) {
    result = setByPath(result, dotPath, value);
  }
  return result;
}

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split('.');
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    cur[p] = isObject(cur[p]) ? { ...cur[p] } : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

// ─────────────────────────────────────────────
// Stance resolver
// ─────────────────────────────────────────────

function resolveStance(stance) {
  if (!stance) return { modules: {}, overrides: {} };

  const stanceMap = loadYaml('stance-map.yaml');
  const modules = {};
  let overrides = {};

  // Audience
  if (stance.audience) {
    const entry = stanceMap.audience?.[stance.audience];
    if (!entry) throw new Error(`[knowledge-loader] unknown audience: ${stance.audience}`);
    if (entry.copy) modules.copy = [entry.copy];
    if (entry.density) modules.density = entry.density;
    if (entry.thresholds_variant) modules.thresholds = entry.thresholds_variant;
    overrides = deepMerge(overrides, dottedToNested(entry.overrides));
  }

  // Purpose
  if (stance.purpose) {
    const entry = stanceMap.purpose?.[stance.purpose];
    if (!entry) throw new Error(`[knowledge-loader] unknown purpose: ${stance.purpose}`);
    overrides = deepMerge(overrides, dottedToNested(entry.overrides));
  }

  // Focus（可 array）
  const focuses = Array.isArray(stance.focus) ? stance.focus : (stance.focus ? [stance.focus] : []);
  for (const f of focuses) {
    const entry = stanceMap.focus?.[f];
    if (!entry) throw new Error(`[knowledge-loader] unknown focus: ${f}`);
    if (entry.dimensions) modules.dimensions = entry.dimensions;
    overrides = deepMerge(overrides, dottedToNested(entry.overrides));
  }

  return { modules, overrides };
}

function dottedToNested(dottedObj) {
  if (!dottedObj) return {};
  let result = {};
  for (const [k, v] of Object.entries(dottedObj)) {
    result = setByPath(result, k, v);
  }
  return result;
}

// ─────────────────────────────────────────────
// Main resolver: profile → frozen snapshot
// ─────────────────────────────────────────────

function resolveProfile(profileName, options = {}) {
  const profile = loadYaml(path.join('profiles', `${profileName}.yaml`));
  const trace = {}; // { 'a.b.c': 'default' | 'stance' | 'module' | 'override' | 'cli' }

  // 1. _defaults
  let snapshot = loadYaml('_defaults.yaml');
  markTrace(trace, snapshot, 'default');

  // 2. Statistical constants（永遠載入、永遠鎖定）
  const statConsts = loadModule('thresholds', '_statistical-constants');
  snapshot = deepMerge(snapshot, { thresholds: statConsts });
  markTrace(trace, { thresholds: statConsts }, 'statistical-locked');

  // 3. Stance resolver
  const stanceResolution = resolveStance(profile.stance);

  // 4. 決定 modules（profile.extends > stance 產出）
  const modulesSpec = { ...stanceResolution.modules, ...(profile.extends || {}) };

  // 5. 載入 modules（依指定順序合併）
  //    module 檔可選擇性用 `_overrides:` 區塊覆蓋其他 namespace 的 key（如 density 覆蓋 thresholds）
  for (const [type, specRaw] of Object.entries(modulesSpec)) {
    const names = Array.isArray(specRaw) ? specRaw : [specRaw];
    for (const name of names) {
      const chain = loadModuleChain(type, name);
      for (const mod of chain) {
        const clean = { ...mod };
        delete clean._meta;
        const crossOverrides = clean._overrides;
        delete clean._overrides;
        const wrapped = wrapModuleByType(type, clean);
        snapshot = deepMerge(snapshot, wrapped);
        markTrace(trace, wrapped, `module:${type}:${name}`);
        if (crossOverrides) {
          const nested = dottedToNested(crossOverrides);
          snapshot = deepMerge(snapshot, nested);
          markTrace(trace, nested, `module:${type}:${name}:_overrides`);
        }
      }
    }
  }

  // 6. Stance overrides
  snapshot = deepMerge(snapshot, stanceResolution.overrides);
  markTrace(trace, stanceResolution.overrides, 'stance');

  // 7. Profile overrides（支援 dotted key）
  const profileOverridesNested = dottedToNested(profile.overrides);
  snapshot = deepMerge(snapshot, profileOverridesNested);
  markTrace(trace, profileOverridesNested, 'profile-override');

  // 8. Learned overlay（Phase 3 接入，此處留介面）
  if (options.learnedRules) {
    snapshot = deepMerge(snapshot, options.learnedRules);
    markTrace(trace, options.learnedRules, 'learned');
  }

  // 9. Density 覆寫（CLI flag `--density`，runtime 切換報告詳盡度）
  if (options.density) {
    const chain = loadModuleChain('density', options.density);
    for (const mod of chain) {
      const clean = { ...mod };
      delete clean._meta;
      const crossOverrides = clean._overrides;
      delete clean._overrides;
      const wrapped = wrapModuleByType('density', clean);
      snapshot = deepMerge(snapshot, wrapped);
      markTrace(trace, wrapped, `cli-density:${options.density}`);
      if (crossOverrides) {
        const nested = dottedToNested(crossOverrides);
        snapshot = deepMerge(snapshot, nested);
        markTrace(trace, nested, `cli-density:${options.density}:_overrides`);
      }
    }
  }

  // 10. CLI flag overrides（最後一層，除錯用）
  if (options.cliOverrides) {
    const nested = dottedToNested(options.cliOverrides);
    snapshot = deepMerge(snapshot, nested);
    markTrace(trace, nested, 'cli');
  }

  // 10. Freeze + 包裝成 Snapshot 物件
  return new Snapshot(snapshot, trace, profile);
}

// 把模組內容依類型套上正確的命名空間
function wrapModuleByType(type, content) {
  // 各類型約定：
  //   thresholds → 內容直接屬於 thresholds.*
  //   copy → 內容屬於 copy.*
  //   keywords → keywords.*
  //   dimensions → dimensions.*
  //   time-windows → time_windows.*
  //   density → density.*
  const map = {
    thresholds: 'thresholds',
    copy: 'copy',
    keywords: 'keywords',
    dimensions: 'dimensions',
    'time-windows': 'time_windows',
    density: 'density',
  };
  const ns = map[type] || type;
  return { [ns]: content };
}

function markTrace(trace, obj, source, prefix = '') {
  if (!isObject(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (isObject(v)) {
      markTrace(trace, v, source, full);
    } else {
      trace[full] = source;
    }
  }
}

// ─────────────────────────────────────────────
// Snapshot — 凍結、禁止修改、找不到 key 丟錯
// ─────────────────────────────────────────────

class Snapshot {
  constructor(data, trace, profile) {
    this._data = deepFreeze(data);
    this._trace = trace;
    this._profile = profile;
    Object.freeze(this);
  }

  get(dotPath) {
    const parts = dotPath.split('.');
    let cur = this._data;
    for (const p of parts) {
      if (cur == null || !(p in cur)) {
        throw new Error(
          `[knowledge-loader] missing key: "${dotPath}" (profile=${this._profile?._meta?.name || 'unknown'}). ` +
          `禁止使用 fallback 預設。請在 knowledge 層補上此 key。`
        );
      }
      cur = cur[p];
    }
    return cur;
  }

  has(dotPath) {
    const parts = dotPath.split('.');
    let cur = this._data;
    for (const p of parts) {
      if (cur == null || !(p in cur)) return false;
      cur = cur[p];
    }
    return true;
  }

  trace(dotPath) {
    return this._trace[dotPath] || 'unknown';
  }

  get profile() {
    return this._profile;
  }

  get pipeline() {
    return this._profile?.pipeline || [];
  }

  get data() {
    return this._data;
  }
}

function deepFreeze(obj) {
  if (!isObject(obj) && !Array.isArray(obj)) return obj;
  for (const v of Object.values(obj)) deepFreeze(v);
  return Object.freeze(obj);
}

module.exports = {
  resolveProfile,
  Snapshot,
  // 輔助匯出給測試用
  _internals: { deepMerge, dottedToNested, resolveStance, loadModuleChain },
};
