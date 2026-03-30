'use strict';

/**
 * 階段註冊表(Stage Registry) — Pipeline 各階段的統一入口
 *
 * 每個階段是一個 { name, runner, requiresAi, skippable } 物件。
 * runner 的統一簽名: async function(runDir, options) → { status, output, error? }
 */

const STAGES = {
  '§1': {
    name: '需求訪談',
    runner: require('./interview'),
    requiresAi: false,
    skippable: false, // 不可跳過（但可用 PresetInput 自動回答）
  },
  '§3': {
    name: '數據擷取',
    runner: require('./extraction'),
    requiresAi: false,
    skippable: false,
  },
  '§4-6': {
    name: '數據分析 → 目的綁定 → 腳本規劃',
    runner: require('./analysis'),
    requiresAi: false,
    skippable: false,
  },
  '§7': {
    name: '敘事包裝',
    runner: require('./narrative'),
    requiresAi: true, // 需要 AI 介入產出 narrative.json
    skippable: true,
  },
  '§9-10': {
    name: '報告產出 + 品質審核',
    runner: require('./report'),
    requiresAi: false,
    skippable: false,
  },
};

/** 階段執行順序 */
const STAGE_ORDER = ['§1', '§3', '§4-6', '§7', '§9-10'];

module.exports = { STAGES, STAGE_ORDER };
