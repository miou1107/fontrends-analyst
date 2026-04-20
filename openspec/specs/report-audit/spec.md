# Report Audit — 報告稽核機制

## Purpose

在報告產出後、交付用戶前，由獨立的稽核角色對報告進行正確性驗證、分析品質評分、實用程度評估，確保每份報告達到交付標準。稽核結果作為品質紀錄，也回饋到學習機制中持續提升品質。

---

## Requirements

### Requirement: 稽核角色獨立性

稽核 MUST 由獨立於分析流程的角色執行，不得由產出報告的同一 agent 自我審核。

#### Scenario: 自動啟動稽核 agent
- **GIVEN** 報告產出完成（PPT 或 Google Slides）
- **WHEN** 進入稽核階段
- **THEN** 啟動獨立的稽核 subagent（不共享分析 agent 的 context）
- **AND** 稽核 agent 只收到：報告檔案、原始數據底稿、訪談紀錄
- **AND** 不收到分析過程的推論鏈（避免確認偏誤）

#### Scenario: 手動觸發稽核
- **GIVEN** 用戶想對已交付的報告補做稽核
- **WHEN** 用戶說「稽核這份報告」、「audit」、「review quality」
- **THEN** 啟動稽核流程，要求用戶提供報告檔案和資料來源

---

### Requirement: 正確性驗證（Accuracy）

稽核 MUST 驗證報告中每個數據引用和事實陳述的正確性。

#### Scenario: 數據一致性檢查
- **GIVEN** 報告中引用了「影響力指數 85.2」
- **WHEN** 稽核 agent 比對原始數據底稿
- **THEN** 確認數據底稿中確實有此數值
- **AND** 如果不一致，標記為 ❌ 數據錯誤，記錄原始值 vs 報告值

#### Scenario: 事件對應驗證
- **GIVEN** 報告 Slide 4 標注「3月聲量高峰因 Pharrell 系列發布」
- **WHEN** 稽核 agent 執行 web search 驗證
- **THEN** 確認該事件確實發生在對應時間區間
- **AND** 如果找不到佐證，標記為 ⚠️ 待驗證

#### Scenario: 計算邏輯驗證
- **GIVEN** 報告中有 YoY 成長率、佔比百分比等計算值
- **WHEN** 稽核 agent 重新計算
- **THEN** 使用原始數據獨立計算
- **AND** 與報告值比對，容許 ±2% 誤差（因截圖估算）
- **AND** 超過誤差範圍標記為 ❌ 計算錯誤

#### Scenario: 圖表與文字一致性
- **GIVEN** 報告中有圖表和對應的文字描述
- **WHEN** 稽核 agent 交叉比對
- **THEN** 確認文字描述（如「Q3 為最高峰」）與圖表視覺一致
- **AND** 不一致時標記為 ❌ 圖文矛盾

---

### Requirement: 分析品質評分（Quality）

稽核 MUST 從多個維度評估分析的深度和邏輯性。

#### Scenario: 洞察深度評分
- **GIVEN** 報告的核心洞察
- **WHEN** 稽核 agent 評估
- **THEN** 依以下標準評分（1-5 分）：
  - 1 分：只是數據複述（如「影響力指數上升」）
  - 2 分：有基本歸因（如「因代言人宣布而上升」）
  - 3 分：有因果推論 + 佐證（如「代言人宣布帶動 IG UGC 增加 40%」）
  - 4 分：有跨維度連結（如「代言人效應 × KOL 擴散 × 平台特性」）
  - 5 分：有預測性洞察（如「此效應預計持續 2 個月，建議在 X 時機追加」）

#### Scenario: 邏輯一致性評分
- **GIVEN** 報告的多頁分析
- **WHEN** 稽核 agent 檢查前後邏輯
- **THEN** 評估以下項目（每項 Pass/Fail）：
  - 執行摘要的結論是否與後續頁面的分析一致
  - 行動建議是否都能回扣到具體洞察
  - 數據品質聲明是否涵蓋所有已知限制
  - 不同頁面的數據是否互相矛盾

#### Scenario: 完整性評分
- **GIVEN** 訪談時確認的分析需求
- **WHEN** 稽核 agent 比對
- **THEN** 確認每個訪談需求都有對應的分析頁面
- **AND** 缺失的需求標記為 ⚠️ 未涵蓋

---

### Requirement: 決策價值評估（Decision Value）

稽核 MUST 從讀者的角度評估：**讀完這份報告，讀者能不能做出比讀之前更好的決策？**

稽核 agent 收到訪談紀錄（讀者是誰、要做什麼決策、關心什麼），以此為基準評估。

#### Scenario: 「所以呢」測試（So What Test）
- **GIVEN** 報告中的每一個洞察
- **WHEN** 稽核 agent 對每個洞察問「所以呢？讀者看到這個該做什麼？」
- **THEN** 如果洞察能直接連結到一個行動 → ✅ 有決策價值
- **AND** 如果洞察只是描述現象、沒有指出「該怎麼辦」→ ⚠️ 缺乏決策價值
- **AND** 範例：
  - ❌「LV 3月影響力指數為 85.2」← 所以呢？
  - ✅「LV 3月影響力指數 85.2，較上月+23%，主因 Pharrell 系列發布。建議在此熱度期間追加 KOL 合作」← 讀者知道該做什麼

#### Scenario: 讀者盲點覆蓋（Blind Spot Coverage）
- **GIVEN** 訪談中讀者提到「特別擔心被問到的問題」
- **WHEN** 稽核 agent 檢查報告內容
- **THEN** 確認報告有回答這些問題，或至少有數據支撐讀者回答
- **AND** 未覆蓋的盲點標記為 ⚠️ 關鍵問題未回答

#### Scenario: 行動建議的「明天就能做」測試
- **GIVEN** 報告的行動建議
- **WHEN** 稽核 agent 模擬讀者視角
- **THEN** 逐條檢查：讀者明天上班能不能直接拿這條去執行？
  - WHO 明確到具體部門或角色（不是「相關單位」）
  - WHAT 具體到可以寫成待辦事項（不是「優化社群策略」）
  - WHEN 有明確時機（不是「盡快」）
  - 預期效果可衡量（不是「提升品牌力」）
- **AND** 不合格的建議標記為 ⚠️ 無法執行

#### Scenario: 競品洞察的差異化（如有競品分析）
- **GIVEN** 報告包含競品比較
- **WHEN** 稽核 agent 評估競品分析
- **THEN** 確認不只是數字比較（LV 85 vs Chanel 72）
- **AND** 有指出：差異在哪、為什麼、讀者能利用這個差異做什麼
- **AND** 範例：
  - ❌「LV 影響力指數高於 Chanel」← 然後呢？
  - ✅「LV 在 IG 的 KOL 擴散力遠高於 Chanel，但 Chanel 在 FB 的好感度更高。建議 LV 加強 FB 內容策略，參考 Chanel 的 FB 社群經營模式」← 讀者有具體方向

#### Scenario: 受眾語言適配
- **GIVEN** 訪談確認讀者身份（如品牌方行銷總監 / 媒體業主 / 百貨採購）
- **WHEN** 稽核 agent 評估報告用語
- **THEN** 確認：
  - 不出現讀者不懂的技術術語（如「SVG DOM」、「sentiment model bias」）
  - 不出現讀者覺得太淺的解釋（如對行銷總監解釋什麼是 KOL）
  - 報告的「語氣高度」匹配讀者的決策層級
- **AND** 不適配時標記為 ⚠️ 語言不匹配，附具體修改建議

#### Scenario: 故事線「一句話測試」
- **GIVEN** 完整報告
- **WHEN** 稽核 agent 讀完整份報告
- **THEN** 嘗試用一句話總結：「這份報告告訴 [讀者] 應該 [做什麼] 因為 [數據發現]」
- **AND** 如果能清晰總結 → ✅ 故事線清楚
- **AND** 如果無法用一句話總結 → ⚠️ 報告缺乏主軸，各頁面分散無焦點

---

### Requirement: 稽核報告產出

稽核 MUST 產出結構化的稽核報告。

#### Scenario: 稽核報告格式
- **GIVEN** 所有稽核項目完成
- **WHEN** 產出稽核報告
- **THEN** 包含以下結構：

```markdown
# 稽核報告

## 總評
- 正確性：X/10
- 分析品質：X/10
- 決策價值：X/10
- 總分：X/30
- 交付建議：✅ 可交付 / ⚠️ 建議修正後交付 / ❌ 需重做

## 正確性明細
| Slide | 項目 | 狀態 | 說明 |
|-------|------|------|------|
| 2 | 影響力指數 | ✅ | 與底稿一致 |
| 4 | 事件對應 | ❌ | 時間點有誤 |

## 分析品質明細
- 洞察深度：X/5 — [說明]
- 邏輯一致性：X 項 Pass / X 項 Fail
- 完整性：X/X 需求已涵蓋

## 決策價值明細
- So What 測試：X/X 個洞察有決策價值
- 讀者盲點覆蓋：X/X 個關鍵問題已回答
- 行動建議可執行：X/X 條「明天就能做」
- 受眾語言適配：✅/⚠️
- 故事線一句話：「[總結]」

## 修正建議（依優先級排序）
1. 🔴 [必修] Slide 4 事件時間點錯誤，應為 3/15 非 3/1
2. 🟡 [建議] Slide 7 KOL 分析缺少互動率數據
3. 🟢 [可選] Slide 11 措辭可更精煉
```

#### Scenario: 稽核結果達標（≥24/30）
- **GIVEN** 總分 ≥ 24/30 且無 ❌ 項目
- **WHEN** 稽核完成
- **THEN** 標記為 ✅ 可交付
- **AND** 將稽核報告附在報告 metadata 中

#### Scenario: 稽核結果需修正（18-23/30）
- **GIVEN** 總分 18-23 或有 1-2 個 ❌ 項目
- **WHEN** 稽核完成
- **THEN** 標記為 ⚠️ 建議修正後交付
- **AND** 列出修正建議，回傳給分析 agent 執行修正
- **AND** 修正後重新稽核（最多 2 輪）

#### Scenario: 稽核結果不合格（<18/30）
- **GIVEN** 總分 < 18 或有 ≥3 個 ❌ 項目
- **WHEN** 稽核完成
- **THEN** 標記為 ❌ 需重做
- **AND** 列出根本問題，建議從 §2 資料擷取重新開始

---

### Requirement: 稽核紀錄歸檔

每次稽核結果 MUST 被記錄，用於追蹤品質趨勢。

#### Scenario: 寫入稽核紀錄
- **GIVEN** 稽核完成
- **WHEN** 歸檔稽核結果
- **THEN** 以 JSONL 格式 append 到 `learned/audit-history.jsonl`
- **AND** 每筆紀錄包含：

```json
{
  "date": "2026-03-17",
  "brand": "Louis Vuitton",
  "accuracy_score": 8,
  "quality_score": 7,
  "usefulness_score": 9,
  "total_score": 24,
  "verdict": "pass",
  "issues_count": { "critical": 0, "warning": 2, "optional": 1 },
  "rounds": 1
}
```

#### Scenario: 品質趨勢追蹤
- **GIVEN** `learned/audit-history.jsonl` 累積了多筆紀錄
- **WHEN** 管理者想查看品質趨勢
- **THEN** 可分析：
  - 平均分數趨勢（是否逐漸提升）
  - 最常見的錯誤類型
  - 哪些品牌的分析品質較低
  - 修正輪次是否在減少

---

### Requirement: 稽核與學習機制整合

稽核發現的問題 SHOULD 自動回饋到學習機制。

#### Scenario: 系統性問題回饋
- **GIVEN** 連續 3 次稽核都出現同類型錯誤（如事件對應時間不準確）
- **WHEN** 稽核 agent 偵測到重複模式
- **THEN** 自動生成一筆 `learned/corrections.jsonl` 紀錄
- **AND** `type` 標記為 `audit-pattern`
- **AND** `impact` 指出應調整的框架檔案

#### Scenario: 稽核結果影響下次分析
- **GIVEN** 前次稽核發現「行動建議的 KPI 不夠量化」
- **WHEN** 下次分析同品牌或同類報告
- **THEN** 分析 agent 讀取歷史稽核紀錄
- **AND** 在行動建議產出時特別注意 KPI 量化程度

---

> **v2 增補（2026-04-08）：** 新增規則命中追蹤，對齊 `self-learning` v3 的規則索引表與 `orchestrator` v2 的 Pre-Run Checklist。詳見 `openspec/plans/2026-04-08-self-learning-gap-fixes.md`。

### Requirement: 規則命中追蹤（rule-hits.jsonl）

Report-audit MUST 在稽核階段比對本次報告是否遵循 pre-run checklist 的每一條規則，並寫入 `core/learned/rule-hits.jsonl` 供後續學習與趨勢分析使用。

#### Scenario: 命中比對
- **GIVEN** orchestrator 已產出 `runs/{brand}-{date}/checklist.json` 且 `total_rules > 0`
- **WHEN** report-audit 執行稽核
- **THEN** 對 checklist 中每一條規則判定命中類型：
  - `avoided` — 報告明確遵循該規則（例：規則要求「不得用代言人宣布解釋聲量高峰」，本次報告確實沒有）
  - `violated` — 報告違反該規則（例：規則要求「行動建議須具體到部門」，本次某條建議只寫「相關單位」）
  - `na` — 本次報告不觸及該規則涵蓋的情境
- **AND** 每條判定附上 evidence（slide_id / element_id / 引用原文片段）

#### Scenario: rule-hits.jsonl 寫入
- **GIVEN** 命中比對完成
- **WHEN** report-audit 寫入結果
- **THEN** 以 JSONL 格式 append 到 `core/learned/rule-hits.jsonl`，每條規則一筆：

```json
{
  "run_id": "LV-2026-04-08",
  "rule_id": "insights-20260325-003",
  "hit_type": "avoided",
  "evidence": "slide 4 的事件標注引用了 Pharrell 系列發布，非代言人宣布",
  "audited_at": "2026-04-08T15:30:00+08:00",
  "auditor": "report-audit-subagent"
}
```

- **AND** 同一 run_id 的所有規則命中結果共用同一 batch 寫入

#### Scenario: Regression 偵測
- **GIVEN** 某筆 rule_id 在 rule-hits.jsonl 的歷史紀錄顯示「曾經 avoided ≥1 次」
- **WHEN** 本次 run 該 rule_id 為 `violated`
- **THEN** 標記為 `regression`
- **AND** 自動產生一筆 `insights.jsonl` 紀錄：
  - `dimension`: 原 rule 對應 dimension
  - `insight`: 「規則 {rule_id} 出現退化，{N} 次前曾成功避免」
  - `confidence`: `high`
  - `priority`: `high`
- **AND** 此 insight 直接觸發「向下相容 — 高優先即時 PR」流程（對齊 self-learning v3）

#### Scenario: Hard Gate 配合
- **GIVEN** checklist.json 存在且 `total_rules > 0`
- **WHEN** report-audit 發現本次 rule-hits.jsonl 缺漏 checklist 中任一規則的判定
- **THEN** 不得標記 verdict 為 `pass`
- **AND** 拒絕交付（verdict: ❌ 需重做，reason: `missing_rule_hits`）
- **AND** 此 gate 對齊 `orchestrator` v2 的 Hard Gate scenario

#### Scenario: 趨勢指標新增
- **GIVEN** rule-hits.jsonl 累積紀錄
- **WHEN** self-learning 品質趨勢追蹤流程執行
- **THEN** 計算額外三個指標：
  - **avoided_rate**：最近 N 次 run 的 `avoided / (avoided + violated)`
  - **regression_count**：最近 N 次 run 的 regression 次數
  - **na_rate**：`na / total_rules`（過高表示 mapping 與實際 run 不相關，mapping 需整理）
- **AND** 三個指標寫入 audit-history.jsonl 的 metadata 段落
