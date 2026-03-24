# Learning Feedback — 學習回饋機制

## Purpose

讓用戶修改報告後，AI 能學習修正內容並回饋到 Core 知識庫，透過 Git PR 機制讓管理者審核後合併，實現 Skill 的持續進化。

---

## Requirements

### Requirement: 觸發學習

用戶 MUST 明確觸發學習流程，AI 不自動學習。

#### Scenario: 用戶明確要求學習
- **GIVEN** 用戶已修改報告（PPT 或 Google Slides）
- **WHEN** 用戶說「學起來」、「記住這個修改」、「learn」、「optimize」
- **THEN** AI 進入學習模式，開始讀取用戶的修改

#### Scenario: 用戶未觸發學習
- **GIVEN** 用戶修改了報告但沒說「學起來」
- **WHEN** 分析任務結束
- **THEN** AI 不進行任何學習動作
- **AND** 不主動詢問是否要學習（避免打擾）

---

### Requirement: 讀取修改內容

AI MUST 能識別用戶修改了什麼，並分類修改類型。

#### Scenario: PPT 修改（手動回報）
- **GIVEN** 用戶在 PowerPoint 中修改了報告
- **WHEN** 用戶觸發學習並描述修改內容
- **THEN** AI 根據用戶描述整理修改清單
- **AND** 詢問確認：「你修改了 [X]，原因是 [Y]，我的理解對嗎？」

#### Scenario: Google Slides 修改（自動偵測，Phase 2）
- **GIVEN** 用戶在 Google Slides 中修改了報告
- **WHEN** 用戶觸發學習
- **THEN** AI 透過 Google Slides Revision API 取得版本差異
- **AND** 自動識別修改的 Slide、文字、排版
- **AND** 產出結構化 diff

#### Scenario: 修改分類
- **GIVEN** AI 已識別修改內容
- **WHEN** 進行分類
- **THEN** 將修改歸類為以下類型之一或多個：
  - `structure` — 刪增 Slide、調整順序
  - `analysis` — 改變分析結論、推論邏輯
  - `template` — 調整排版、字體、顏色、間距
  - `wording` — 措辭修正、用語偏好
  - `data` — 數據解讀方向修正
  - `action` — 行動建議修改

---

### Requirement: 結構化學習紀錄

修改內容 MUST 以標準格式記錄到 `learned/` 目錄。

#### Scenario: 寫入 corrections.jsonl
- **GIVEN** 修改已分類完成
- **WHEN** AI 寫入學習紀錄
- **THEN** 以 JSONL 格式 append 到 `~/SourceCode/Work/fontrends-analyst/core/learned/corrections.jsonl`
- **AND** 每筆紀錄格式：

```json
{
  "date": "2026-03-17",
  "brand": "Louis Vuitton",
  "user": "vin",
  "type": "analysis",
  "slide": 4,
  "original": "聲量高峰主因為代言人宣布",
  "corrected": "聲量高峰主因為 Pharrell 系列發布，非代言人宣布",
  "reason": "用戶指出事件對應有誤",
  "impact": "frameworks/analysis-framework.md — 交叉驗證需更仔細比對品牌官網時間線"
}
```

#### Scenario: 多筆修改一次記錄
- **GIVEN** 用戶一次修改了多處
- **WHEN** AI 寫入學習紀錄
- **THEN** 每處修改各一筆 JSONL 紀錄
- **AND** 同一批次的紀錄共用 `batch_id`

---

### Requirement: 發起 Pull Request

學習紀錄 MUST 透過 Git PR 提交到 Core Repo，由管理者審核。

#### Scenario: 自動發 PR
- **GIVEN** 學習紀錄已寫入 `learned/corrections.jsonl`
- **WHEN** AI 完成學習整理
- **THEN** 執行以下步驟：
  1. 在 `~/SourceCode/Work/fontrends-analyst/core/` 建立新 branch：`learned/[date]-[brand]-[user]`
  2. `git add learned/corrections.jsonl`
  3. `git commit -m "learn: [品牌] [修改類型] by [user]"`
  4. `git push origin [branch]`
  5. 透過 `gh pr create` 發起 PR

#### Scenario: PR 內容格式
- **GIVEN** PR 已建立
- **WHEN** 管理者查看 PR
- **THEN** PR body 包含：
  - 修改摘要（幾處修改、什麼類型）
  - 修改明細表格
  - 建議的知識庫更新方向（哪些 framework 檔案可能需要調整）

#### Scenario: 用戶無 GitHub write 權限
- **GIVEN** 用戶的 token 只有 read 權限（無法 push）
- **WHEN** AI 嘗試發 PR
- **THEN** 改為將學習紀錄存成本地檔案
- **AND** 提示用戶：「學習紀錄已存到 [路徑]，請傳給管理者」

---

### Requirement: 管理者審核與合併

管理者 MUST 審核 PR 內容後決定如何處理。

#### Scenario: 直接合併
- **GIVEN** PR 內容合理，修正有價值
- **WHEN** 管理者 review 後同意
- **THEN** Merge PR 到 main branch
- **AND** 所有用戶下次啟動 Skill 時自動獲得這些學習紀錄

#### Scenario: 合併並更新框架
- **GIVEN** PR 揭示了框架本身的問題（如分析邏輯需調整）
- **WHEN** 管理者認為需要更新 framework 檔案
- **THEN** 管理者在同一 PR 中追加修改 `frameworks/` 下的對應檔案
- **AND** 同時更新 `version.json`（Minor 版本遞增）

#### Scenario: 拒絕 PR
- **GIVEN** PR 內容不合理或為個案特例
- **WHEN** 管理者決定不合併
- **THEN** Close PR 並留下原因說明
- **AND** 學習紀錄不進入 main branch

#### Scenario: 建立新版本分支
- **GIVEN** 大量學習紀錄累積，需要 Skill 版本迭代
- **WHEN** 管理者決定發布新版
- **THEN** 建立 release branch 或 tag（如 `v1.1.0`）
- **AND** 更新 `version.json` 的 version 和 changelog
- **AND** Public Repo 的 `version.json` 中 `min_core_version` 同步更新（如需要）

---

### Requirement: 學習紀錄應用

Skill 執行分析時 SHOULD 參考歷史學習紀錄。

#### Scenario: 避免重複錯誤
- **GIVEN** `learned/corrections.jsonl` 中有某品牌的修正紀錄
- **WHEN** Skill 分析同一品牌
- **THEN** 系統讀取該品牌的歷史修正
- **AND** 在分析過程中主動避免同類錯誤
- **AND** 例：如果過去被修正「LV 的聲量高峰不是代言人宣布」，下次就更仔細驗證事件對應

#### Scenario: 風格偏好累積
- **GIVEN** 多次修正中有 `type: "wording"` 的紀錄
- **WHEN** Skill 產出報告
- **THEN** 參考用戶的措辭偏好（如「建議」改「推薦」、正式用語 vs 口語）
- **AND** 逐漸適應用戶風格
