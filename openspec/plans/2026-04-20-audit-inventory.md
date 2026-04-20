# Phase 1 Audit Inventory — Knowledge Layer 搬遷清單

**Date:** 2026-04-20
**對應 plan:** [2026-04-20-knowledge-layer-extraction](./2026-04-20-knowledge-layer-extraction.md)
**對應 spec:** [knowledge-layer](../specs/knowledge-layer/spec.md)

---

## 用途

這份 inventory 是 Phase 2+ 搬遷的**工作清單**。每一條都對應一個具體的搬遷動作：從 `.js` 裡的寫死值 → 搬到 `core/knowledge/modules/<type>/*.yaml` 的某個 key。

搬遷完成後，每一行都應該被「劃掉 / 標記已完成」。

---

## 詳細 Findings（按 engine 檔案分組）

| Engine File | Line | Category | Current Value | Suggested Module | YAML Key |
|---|---|---|---|---|---|
| core/engines/comment-feedback/intent-classifier.js | 3 | Threshold | `INTENT_ORDER: {delete:0, structure:1, content:2, style:3, question:4}` | thresholds | `intent_processing_order` |
| core/engines/comment-feedback/intent-classifier.js | 6 | Keyword | `['刪掉', '刪除', '移除', '拿掉', 'remove', 'delete']` | keywords | `delete_intent_keywords` |
| core/engines/comment-feedback/intent-classifier.js | 7 | Keyword | `['移到', '搬到', '加一頁', '新增頁', '調換', '順序', 'move', 'reorder']` | keywords | `structure_intent_keywords` |
| core/engines/comment-feedback/intent-classifier.js | 8 | Keyword | `['？', '?', '為什麼', '哪裡來', '是不是', 'why', 'how', 'what']` | keywords | `question_intent_keywords` |
| core/engines/comment-feedback/intent-classifier.js | 9 | Keyword | `['錯了', '改成', '應該是', '換成', '更新', '修改', 'wrong', 'change', 'update']` | keywords | `content_intent_keywords` |
| core/engines/comment-feedback/intent-classifier.js | 9 | Keyword | `['字型', '字體', '顏色', '大小', '粗體', '間距', 'pt', 'font', 'color', 'bold', 'size']` | keywords | `style_intent_keywords` |
| core/engines/comment-feedback/intent-classifier.js | 21 | Threshold | `confidence: 0.8` | thresholds | `intent_classification_confidence_high` |
| core/engines/comment-feedback/intent-classifier.js | 30 | Threshold | `confidence: 0.5` | thresholds | `intent_classification_confidence_low` |
| core/engines/comment-feedback/comment-responder.js | 4 | Copy | `✅ 已調整：${summary}` | copy | `success_reply_template` |
| core/engines/comment-feedback/comment-responder.js | 7 | Copy | `修改項目：` | copy | `changes_section_header` |
| core/engines/comment-feedback/comment-responder.js | 16 | Copy | `❌ 無法自動處理：${reason}` | copy | `failure_reply_template` |
| core/engines/comment-feedback/comment-responder.js | 17 | Copy | `建議：${suggestion}` | copy | `suggestion_prefix` |
| core/engines/comment-feedback/comment-responder.js | 22 | Copy | `✅ 該元素已被其他留言刪除，此留言無需處理` | copy | `cascade_delete_reply` |
| core/engines/comment-feedback/comment-responder.js | 53 | Keyword | CJK pattern `[\u4e00-\u9fff\u3400-\u4dbf]` | keywords | `cjk_character_detection_pattern` |
| core/engines/comment-feedback/comment-reader.js | 15-40 | Keyword | Slides/Docs anchor parsing patterns | keywords | `anchor_parsing_patterns` |
| core/engines/comment-feedback/learning-capture.js | 3 | Threshold | schema version: 2 | thresholds | `correction_entry_schema_version` |
| core/engines/comment-feedback/learning-capture.js | 25 | Threshold | rule confidence: count/5 | thresholds | `learning_rule_confidence_multiplier` |
| core/engines/comment-feedback/learning-capture.js | 28-35 | Threshold | auto-rule thresholds (text_replace=2, value_check/style=3) | thresholds | `learning_rule_generation_thresholds` |
| core/engines/self-learning/learning-engine.js | 107 | Threshold | `count >= 3` repeated pattern | thresholds | `learning_pattern_detection_threshold` |
| core/engines/self-learning/learning-engine.js | 164 | Threshold | `count >= 2` text replacements | thresholds | `learning_text_replace_threshold` |
| core/engines/self-learning/learning-engine.js | 169 | Threshold | `Math.min(count/5, 1)` confidence | thresholds | `learning_rule_confidence_formula` |
| core/engines/self-learning/learning-engine.js | 188 | Threshold | `count >= 2` category pattern | thresholds | `learning_category_pattern_threshold` |
| core/engines/self-learning/learning-engine.js | 194 | Threshold | `Math.min(items.length/5, 1)` | thresholds | `learning_category_confidence_formula` |
| core/engines/self-learning/learning-engine.js | 209 | Threshold | `count >= 3` audit rules | thresholds | `learning_audit_rule_threshold` |
| core/engines/self-learning/learning-engine.js | 229 | Threshold | `count >= 3` style rules | thresholds | `learning_style_rule_threshold` |
| core/engines/analysis/analyzers/insight-generator.js | 5 | Threshold | `MAX_INSIGHTS = 5` | thresholds | `max_insights_per_analysis` |
| core/engines/analysis/analyzers/insight-generator.js | 8-32 | Dimensions | METRIC_LABELS（25+ 中文對照） | dimensions | `metric_labels_zh` |
| core/engines/analysis/analyzers/insight-generator.js | 45 | Threshold | 10% growth/decline threshold | thresholds | `growth_decline_detection_threshold` |
| core/engines/analysis/analyzers/insight-generator.js | 120 | Threshold | 0.7 correlation confidence | thresholds | `correlation_confidence_threshold` |
| core/engines/analysis/analyzers/anomaly-detector.js | 8 | Threshold | `DEFAULT_THRESHOLD = 2.5` (z-score) | thresholds | `anomaly_zscore_threshold` |
| core/engines/analysis/analyzers/anomaly-detector.js | 9 | Threshold | `MIN_DATA_REQUIRED = 3` | thresholds | `anomaly_min_data_points` |
| core/engines/analysis/analysis-engine.js | 11-18 | Dimensions | DIM_ID_MAP (8 entries) | dimensions | `dimension_id_mapping` |
| core/engines/analysis/analysis-engine.js | 20-27 | Threshold | ANOMALY_CONFIG per dimension | thresholds | `anomaly_detection_config_by_dimension` |
| core/engines/analysis/analysis-engine.js | 29 | Time Window | QoQ: 83-97 days | time-windows | `qoq_day_range` |
| core/engines/analysis/analysis-engine.js | 30 | Time Window | YoY: 358-372 days | time-windows | `yoy_day_range` |
| core/engines/analysis/analysis-engine.js | 32-37 | Threshold | Min recommendations (2/1/6, max 12) | thresholds | `recommendation_thresholds` |
| core/engines/analysis/analysis-engine.js | 39-52 | Copy | 社群行銷團隊 / 品牌策略 / 數據分析 角色 | copy | `recommendation_role_templates` |
| core/engines/analysis/analysis-engine.js | 39-52 | Copy | 2週內 / 1週內 / 下季度 時間模板 | copy | `recommendation_timeline_templates` |
| core/engines/analysis/analyzers/base-analyzer.js | 1 | Dimensions | PAGE_KEY_MAP (8) | dimensions | `page_key_dimension_mapping` |
| core/engines/analysis/analyzers/base-analyzer.js | 3 | Threshold | ANALYZERS object (8 dimension analyzers) | thresholds | `dimension_analyzer_mapping` |
| core/engines/analysis/analyzers/self-comparator.js | 7 | Threshold | default threshold: 1 | thresholds | `self_comparison_threshold` |
| core/engines/analysis/analyzers/competitor-comparator.js | 8 | Threshold | advantage multiplier: 1.05 | thresholds | `competitor_advantage_multiplier` |
| core/engines/analysis/analyzers/cross-analyzer.js | 2 | Keyword | CORRELATION_PAIRS | keywords | `correlation_pairs_definition` |
| core/engines/analysis/analyzers/cross-analyzer.js | 4 | Threshold | strong correlation: 0.7 | thresholds | `correlation_strength_threshold` |
| core/engines/analysis/analyzers/cross-analyzer.js | 5 | Threshold | moderate correlation: 0.4 | thresholds | `correlation_moderate_threshold` |
| core/engines/analysis/analyzers/cross-analyzer.js | 7-12 | Threshold | score calc (base 50, ±15/±10) | thresholds | `cross_analysis_score_formula` |
| core/engines/analysis/analyzers/cross-analyzer.js | 14-17 | Threshold | quadrants: leader(70+)/challenger(50)/niche(30)/follower(<30) | thresholds | `competitive_positioning_quadrants` |
| core/engines/analysis/utils/stats.js | 1-30 | Threshold | statistical functions | thresholds | `statistical_calculation_parameters` |
| core/engines/analysis/utils/stats.js | 18 | Threshold | IQR fence: 1.5 * iqr | thresholds | `iqr_fence_multiplier` |
| core/engines/analysis/utils/stats.js | 25 | Threshold | Pearson min data: 5 | thresholds | `pearson_correlation_min_data` |
| core/engines/script-planner/script-planner.js | 7-35 | Threshold | BASE_WEIGHTS (4 schemas) | thresholds | `base_weights_by_schema` |
| core/engines/script-planner/script-planner.js | 37-40 | Threshold | FIXED_PAGES per schema | thresholds | `fixed_pages_by_schema` |
| core/engines/script-planner/script-planner.js | 42 | Threshold | SEVERITY_ORDER | thresholds | `severity_processing_order` |
| core/engines/script-planner/script-planner.js | 44 | Threshold | `EXCLUDE_THRESHOLD = 0.1` | thresholds | `exclude_signal_threshold` |
| core/engines/script-planner/script-planner.js | 45 | Threshold | `INSUFFICIENT_EPSILON = 0.01` | thresholds | `insufficient_data_epsilon` |
| core/engines/script-planner/script-planner.js | 46 | Threshold | `DATA_PRESENCE_BONUS = 0.35` | thresholds | `data_presence_score_bonus` |
| core/engines/script-planner/script-planner.js | 48-55 | Dimensions | PAGE_TO_DIM (8) | dimensions | `page_to_dimension_mapping` |
| core/engines/script-planner/script-planner.js | 57-64 | Copy | PAGE_TITLES（中文頁標） | copy | `page_titles_zh` |
| core/engines/script-planner/script-planner.js | 66-73 | Copy | PRIMARY_METRICS per page | copy | `primary_metrics_per_page` |
| core/engines/script-planner/scorers/signal-scorer.js | 4 | Threshold | insights weight: 0.35 | thresholds | `signal_weight_insights` |
| core/engines/script-planner/scorers/signal-scorer.js | 5 | Threshold | anomalies weight: 0.25 | thresholds | `signal_weight_anomalies` |
| core/engines/script-planner/scorers/signal-scorer.js | 6 | Threshold | change weight: 0.25 | thresholds | `signal_weight_change` |
| core/engines/script-planner/scorers/signal-scorer.js | 7 | Threshold | compete weight: 0.15 | thresholds | `signal_weight_compete` |
| core/engines/script-planner/scorers/signal-scorer.js | 9 | Threshold | insights division: 3 | thresholds | `signal_division_threshold_insights` |
| core/engines/script-planner/scorers/signal-scorer.js | 10 | Threshold | anomalies division: 2 | thresholds | `signal_division_threshold_anomalies` |
| core/engines/script-planner/scorers/signal-scorer.js | 11 | Threshold | changes division: 50 | thresholds | `signal_division_threshold_changes` |
| core/engines/script-planner/scorers/intent-scorer.js | 12 | Threshold | intent boost: 1.5× | thresholds | `intent_boost_focused_multiplier` |
| core/engines/script-planner/scorers/intent-scorer.js | 15 | Threshold | purpose factor: 0.5 + 0.5×rel | thresholds | `purpose_factor_formula` |
| core/engines/script-planner/block-assigner.js | 8 | Threshold | change threshold: 10% | thresholds | `significant_change_threshold` |
| core/engines/script-planner/headline-generator.js | 3 | Dimensions | METRIC_LABELS reference | dimensions | `metric_labels_zh_reference` |
| core/engines/script-planner/headline-generator.js | 10-45 | Copy | headline patterns & templates | copy | `headline_templates` |
| core/engines/purpose-binder/purpose-binder.js | 3 | Dimensions | PURPOSE_LABELS (5 types) | dimensions | `purpose_type_mapping` |
| core/engines/purpose-binder/purpose-binder.js | 5-8 | Time Window | quarter-month mapping (Q1-Q4) | time-windows | `quarter_month_mapping` |
| core/engines/purpose-binder/hook-generator.js | 3 | Threshold | positive sentiment: >0.3 | thresholds | `hook_positive_threshold` |
| core/engines/purpose-binder/hook-generator.js | 4 | Threshold | negative sentiment: <-0.1 | thresholds | `hook_negative_threshold` |
| core/engines/purpose-binder/hook-generator.js | 5 | Threshold | 30-character hook limit | thresholds | `hook_character_limit` |
| core/engines/purpose-binder/hook-generator.js | 7-37 | Copy | HOOK_TEMPLATES（5 purposes × dimensions） | copy | `hook_templates_by_purpose` |
| core/engines/purpose-binder/affinity-table.js | 2 | Dimensions | DIMENSIONS (8) | dimensions | `affinity_dimensions` |
| core/engines/purpose-binder/affinity-table.js | 3 | Dimensions | PURPOSE_TYPES (5) | dimensions | `affinity_purpose_types` |
| core/engines/purpose-binder/affinity-table.js | 5-11 | Threshold | AFFINITY_TABLE (5×8 matrix) | thresholds | `affinity_scoring_matrix` |
| core/engines/orchestrator.js | 8-65 | Threshold | STAGES (12 stages) | thresholds | `pipeline_stage_definitions` |
| core/engines/orchestrator.js | 67 | Threshold | timeout: 120000ms | thresholds | `pipeline_execution_timeout_ms` |
| core/engines/orchestrator.js | 8-65 | Copy | stage names (§1-§12) | copy | `pipeline_stage_names` |
| core/engines/narrative-normalizer.js | 10 | Threshold | fmt() 萬 threshold: 10000+ | thresholds | `number_format_threshold_wan` |
| core/engines/narrative-normalizer.js | 15 | Threshold | pct() decimal: 1 | thresholds | `percentage_decimal_places` |
| core/engines/narrative-normalizer.js | 20 | Threshold | site average: 598000 | thresholds | `site_average_engagement` |
| core/engines/narrative-normalizer.js | 45-95 | Copy | enrichChapter（9 chapter templates） | copy | `enrichment_chapter_templates` |
| core/engines/narrative-normalizer.js | 45-95 | Copy | key angles coverage | copy | `narrative_enrichment_patterns` |
| core/engines/validator.js | 3-15 | Threshold | schema validation rules (AJV) | thresholds | `schema_validation_rules` |

---

## Summary

- **掃描檔案總數：** 25 個 engine 檔案
- **發現 leakage 總數：** 99 條

### 類別分佈

| Category | Count | % |
|---|---|---|
| Threshold（裸數字門檻 / 權重）| 56 | 56.6% |
| Copy（文案 / 角色 / 模板）| 20 | 20.2% |
| Dimension Vocab（詞彙表 / mapping）| 9 | 9.1% |
| Keyword（關鍵字陣列）| 8 | 8.1% |
| Time Window（時間窗）| 4 | 4.0% |
| Other | 2 | 2.0% |

### Module 歸屬分佈（Phase 2 檔案量預估）

| Module | Count |
|---|---|
| `modules/thresholds/*.yaml` | 56 |
| `modules/copy/*.yaml` | 20 |
| `modules/dimensions/*.yaml` | 9 |
| `modules/keywords/*.yaml` | 8 |
| `modules/time-windows/*.yaml` | 4 |
| `modules/density/*.yaml` | 2 |

### 關鍵觀察

1. **門檻最多**（56 條）— `thresholds.yaml` 會是最大檔，需要嚴謹分組（anomaly / correlation / scoring / learning / format / pipeline 等子命名空間）
2. **中文文案集中在四個 engine**：
   - `script-planner`（page titles / metrics）
   - `narrative-normalizer`（9 chapter templates）
   - `purpose-binder`（hook templates）
   - `analysis-engine`（建議角色 / 時間模板）
3. **Keywords 分散**於 comment-feedback 與 analysis，應統合至 `keywords.yaml`
4. **Time windows 只集中在兩處** — QoQ/YoY 在 analysis-engine、quarter-month 在 purpose-binder
5. **Dimensions mapping 重複 6+ 檔** — 是建立統一 `dimensions.yaml` reference 層的關鍵
6. **Confidence / scoring 公式** 滿天飛的魔術數字（0.7 / 0.35 / 0.5 / 1.05 / 1.5）— 全歸 `thresholds.yaml`

---

## 下一步（Phase 1 剩餘 + Phase 2 準備）

- [ ] 逐條 review，確認 module 歸屬合理
- [ ] 設計 `thresholds.yaml` 的子命名空間結構（56 條若平掛會亂）
- [ ] 設計 `copy.yaml` 的模板引擎（`${summary}` 插值需要支援）
- [ ] 確認 `dimensions.yaml` 是否需要拆成多個模組檔（如 social-14d / competitive-7d 各自選用）
- [ ] 進 Phase 2：建 modules 骨架 + 寫 loader
