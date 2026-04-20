# Self-Learning Gap Fixes — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-04-08
**Author:** Vin
**IR 對齊:** IR-004 OpenSpec 流程 / IR-005 禁 blind edit / IR-006 學到東西全層同步 / IR-008 commit 同步 README/FILELIST/CHANGELOG / IR-012 品管三步驟

---

## Goal

補齊現有 `self-learning` / `orchestrator` / `report-audit` 三份 spec 的 6 個 gap，讓 fontrends-analyst 真的能『自主學習、越做越好』，而不只是『會記筆記』。

**不做：** 新蓋 evaluator 基礎設施、新 openspec gate、autoresearch loop、新 evaluator 指標系統（這些現有 `report-audit` 的 accuracy/quality/decision-value 三維評分已經涵蓋，分母太小硬加只會把閘門鎖死）。

## Background（為什麼只改三份 spec）

2026-04-08 與 Codex 四輪討論後，盤點現有 openspec/specs/ 發現 80% 的「自主學習」機制已經在：

- `self-learning` — 自動觸發學習、5 維度、corrections/insights/skill-suggestions.jsonl、PR 流程、品質趨勢追蹤、退化警示
- `report-audit` — accuracy/quality/decision-value 三維評分、「明天就能做」測試、連續 3 次同類錯誤自動寫 corrections
- `quality-optimization` — revisions.jsonl、3 輪迭代上限、連鎖修改偵測

**真正的 gap 只有 6 項**（本 plan 的 scope）：

1. corrections / insights 沒有 TTL / scope / superseded_by → 會無限堆積與衝突
2. 無「規則命中 telemetry」— 無法驗證學到的東西下次有沒有真的避開
3. 無 `mapping.json` 全域 index — orchestrator pre-run 查歷史要全檔掃描
4. orchestrator 沒有正式的 pre-run hook requirement 讀歷史 corrections/insights
5. `skill-suggestions` 升級門檻不明確 — 需寫死「confidence=high + 跨品牌」才產
6. `skill-suggestions` 目前一條一 PR — 需改成每週一自動 digest（合併 ≤5 條）

---

## Architecture

**不新增目錄、不新增 skill**。只改 3 份 spec + 加 2 個資料檔：

```
openspec/specs/
├── self-learning/spec.md        ← delta: TTL/scope/superseded_by、high+跨品牌門檻、週一 digest、衝突淘汰
├── orchestrator/spec.md          ← delta: 新增 pre-run hook requirement
└── report-audit/spec.md          ← delta: 寫入 rule-hits.jsonl scenario

core/learned/                     ← 新增資料檔（schema 在 spec，實體檔執行時生成）
├── corrections.jsonl             (已存在，欄位擴充)
├── insights.jsonl                (已存在，欄位擴充)
├── skill-suggestions.jsonl       (已存在，升級門檻寫死)
├── audit-history.jsonl           (已存在)
├── rule-hits.jsonl               ← 新增 telemetry
└── mapping.json                  ← 新增規則→技能路由 index
```

---

## Design Decisions（三個預設值，2026-04-08 Vin 拍板）

| # | 決策 | 值 | 備註 |
|---|---|---|---|
| 1 | corrections/insights TTL | **90 天** | 到期自動進入 archived，不參與 pre-run checklist |
| 2 | skill-suggestion 升級門檻 | **confidence=high**（≥3 source_tasks 驗證）**且** `applicable_to` ≠ 單一品牌 | 單一品牌的經驗只留在 corrections，不提升為跨專案 skill 規則 |
| 3 | skill-suggestion digest PR 節奏 | **每週一早上自動彙整上週累積** | 單 PR ≤ 5 條，避免碎片化 PR 淹沒 review |

---

## File Structure 變更

**Specs 修改（delta）**
- [ ] `openspec/specs/self-learning/spec.md`
- [ ] `openspec/specs/orchestrator/spec.md`
- [ ] `openspec/specs/report-audit/spec.md`

**專案文件同步（IR-006 / IR-008）**
- [ ] `README.md` — 在 Self-Learning 段落點出 TTL/telemetry/digest 三個新機制
- [ ] `FILELIST.md` — 新增 `core/learned/rule-hits.jsonl` 與 `core/learned/mapping.json`
- [ ] `CHANGELOG.md` — 記錄本次 spec 升級

**Adapters 同步（IR-006）**
- [ ] `adapters/claude-code/` 下對應 skill 的 SKILL.md 要引用新欄位（orchestrator、self-learning 相關 adapter）

---

## Implementation Tasks

### Phase 1 — Spec Delta（Day 1）

- [ ] **T1.1** `self-learning/spec.md` 新增 Requirement: 紀錄時效性
  - Scenario: corrections 紀錄加 `ttl_days`（預設 90）、`scope`（global/brand/industry）、`superseded_by`（被哪筆新紀錄取代）
  - Scenario: 過期紀錄進 `core/learned/archived/` 不再參與 pre-run
  - Scenario: 衝突偵測 — 新 insight 與舊 insight 在同 dimension+scope 相反結論時，自動把舊的 `superseded_by` 指向新的

- [ ] **T1.2** `self-learning/spec.md` 修改 Requirement: Skill 自我優化
  - Scenario: 升級門檻 — 只有 `confidence=high` 且 `applicable_to != <single brand>` 的 insight 才產生 skill-suggestions 紀錄
  - Scenario: 單一品牌經驗留在 corrections.jsonl，不升級

- [ ] **T1.3** `self-learning/spec.md` 修改 Requirement: PR 機制
  - Scenario: 每週一早上（週一 09:00）自動彙整上週 pending skill-suggestions
  - Scenario: 單一 digest PR 最多 5 條，超過自動拆成多 PR 並在 title 標 `(1/N)`
  - Scenario: PR body 含每條 suggestion 的 source_insights、rule-hits 證據、預期影響

- [ ] **T1.4** `orchestrator/spec.md` 新增 Requirement: Pre-Run Checklist
  - Scenario: pipeline 啟動時讀 `corrections.jsonl` + `insights.jsonl`（未過期 + scope 符合本次品牌/產業的條目）
  - Scenario: 產出本次 checklist.json 供下游 skills 讀取
  - Scenario: checklist 未讀不出報（hard gate）— 對齊 IR-027「提醒無效邏輯才有效」

- [ ] **T1.5** `report-audit/spec.md` 新增 Requirement: 規則命中追蹤
  - Scenario: 稽核時比對本次報告是否避開了 pre-run checklist 中的已知坑
  - Scenario: 每筆命中/未命中寫入 `core/learned/rule-hits.jsonl`，欄位：`run_id`, `rule_id`, `hit_type`（avoided/violated/na）, `evidence`
  - Scenario: 若「上次學過但這次又犯」→ 標記 `regression`，寫入 insights.jsonl 為 high priority

### Phase 2 — mapping.json Schema（Day 2）

- [ ] **T2.1** `self-learning/spec.md` 新增 Requirement: 規則索引表
  - Scenario: `core/learned/mapping.json` schema：
    ```json
    {
      "rules": {
        "<rule_id>": {
          "source": "corrections|insights|audit-pattern",
          "target_skills": ["narrative-packaging", "data-analysis"],
          "scope": "global|brand:LV|industry:luxury",
          "confidence": "high|medium|low",
          "ttl_until": "ISO8601",
          "created": "ISO8601"
        }
      },
      "last_rebuilt": "ISO8601"
    }
    ```
  - Scenario: 每次寫入新 correction/insight 時即時更新 mapping.json
  - Scenario: orchestrator pre-run 直接讀 mapping.json（O(1) 查詢），不掃 jsonl

### Phase 3 — 專案文件同步（Day 2，IR-006/IR-008）

- [ ] **T3.1** `README.md` Self-Learning 段落加「TTL 90 天 / rule-hits 追蹤 / 週一 digest PR」三項說明
- [ ] **T3.2** `FILELIST.md` 新增 `core/learned/rule-hits.jsonl` 與 `core/learned/mapping.json` 條目
- [ ] **T3.3** `CHANGELOG.md` 新增條目：
  ```
  ## 2026-04-08 — Self-Learning Gap Fixes
  - 新增紀錄 TTL/scope/superseded_by 機制
  - 新增 rule-hits.jsonl telemetry
  - 新增 mapping.json 規則索引表
  - orchestrator 新增 pre-run checklist hook
  - skill-suggestions 升級門檻寫死 high+跨品牌
  - skill-suggestions 改為每週一 digest PR
  ```

### Phase 4 — Adapter 同步（Day 3，IR-006）

- [ ] **T4.1** 盤點 `adapters/claude-code/` 下哪些 SKILL.md 引用了 corrections/insights schema
- [ ] **T4.2** 對應 SKILL.md 加上新欄位說明（ttl_days/scope/superseded_by）
- [ ] **T4.3** orchestrator adapter 加 pre-run checklist 讀取流程

### Phase 5 — 品管三步驟（Day 3，IR-012/IR-025）

- [ ] **T5.1** `superpowers:verification-before-completion` — 驗證三份 spec delta 在 OpenSpec 規則下仍可解析、無 requirement ID 衝突
- [ ] **T5.2** `superpowers:requesting-code-review` — 請求 code review，附本 plan + 三份 spec diff + README/FILELIST/CHANGELOG diff
- [ ] **T5.3** 若 review 有回饋：`superpowers:receiving-code-review` 處理

---

## 驗收條件

- [ ] 三份 spec delta 都有對應 Requirement 且 scenario 完整（GIVEN/WHEN/THEN）
- [ ] README / FILELIST / CHANGELOG 都已同步
- [ ] adapter SKILL.md 同步完成
- [ ] 品管三步驟全部跑過
- [ ] git commit message 不含 Co-Authored-By（IR-024）、contributors 顯示 Vin（IR-009）

## 成功判準（兩週後驗證）

相對本 plan 合併前的最後 2 份報告 vs 合併後的 2 份報告：

1. **重複類錯復發率** < 25%（report-audit 用 rule-hits.jsonl 的 regression 計數計算）
2. **pre-run checklist 產生率** = 100%（orchestrator hard gate）
3. **skill-suggestions 從產生到合併的週期** ≤ 7 天（週一 digest PR 機制生效）

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| TTL 過期導致有用經驗被丟棄 | archived/ 保留原檔，可人工召回 |
| mapping.json 與 jsonl 不同步 | 每次寫入 jsonl 時同步寫 mapping.json，並加 last_rebuilt timestamp |
| orchestrator hard gate 鎖死出報 | 若 checklist 生成失敗，fallback 為 warning-only 並記 incident |
| digest PR 內容太雜使用者不看 | 單 PR ≤ 5 條、PR body 強制含 rule-hits 證據 |

## 不在本 plan scope

- 不蓋新 Evaluator 系統（現有 report-audit 三維評分已足）
- 不加 openspec change gate（分母不足）
- 不做 autoresearch propose→experiment→merge 自動迴圈（成本>收益）
- 不改 data.json / narrative.json 等資料契約
