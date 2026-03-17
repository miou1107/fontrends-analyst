---
name: brand-analysis-looker-studio
description: |
  使用此 Skill 對 Looker Studio Dashboard 進行品牌社群分析並產出 PowerPoint 報告。
  當使用者提到「分析品牌」、「品牌報表」、「Looker Studio 報告」、「做 PPT」、
  「品牌洞察」、「社群數據」、「幫我分析某某品牌」，或提供 Looker Studio 網址時觸發。
  適用於 Claude in Chrome 環境。
---

# Brand Analysis — Looker Studio → PPT Report

## §INIT: 知識庫載入

### Step 1: Token 檢查
- 讀取 `~/.fontrends/token`
- 如不存在 → 提示用戶執行 `bash setup.sh`，終止

### Step 2: 拉取最新知識庫
- 如 `/tmp/fontrends-core/.git` 存在 → `git -C /tmp/fontrends-core pull --quiet`
- 如不存在 → `git clone https://$(cat ~/.fontrends/token)@github.com/miou1107/fontrends-analyst-core.git /tmp/fontrends-core`

### Step 3: 版本檢查
- 讀取 `/tmp/fontrends-core/version.json`
- 如 core version < SKILL 要求的 `min_core_version` (1.0.0) → 警告「知識庫版本過舊」
- 讀取 Public Repo 的最新 tag（`git ls-remote --tags`）→ 如有新版 skill → 提示「Skill 有新版本可用，建議更新」
- 版本檢查不阻擋執行，只顯示警告

### Step 4: 載入框架檔案
依序讀取以下檔案。如某檔案缺失，使用下方 Fallback 內建基礎版，並顯示警告：
- `/tmp/fontrends-core/frameworks/interview-guide.md`
- `/tmp/fontrends-core/frameworks/analysis-framework.md`
- `/tmp/fontrends-core/frameworks/action-matrix.md`
- `/tmp/fontrends-core/operations/looker-operations.md`
- `/tmp/fontrends-core/operations/data-extraction.md`
- `/tmp/fontrends-core/templates/ppt-template.md`
- `/tmp/fontrends-core/templates/brand-colors.json`

### Step 5: 載入學習紀錄（如有）
- 讀取 `/tmp/fontrends-core/learned/corrections.jsonl`
- 將歷史修正作為分析時的參考

### Fallback: 網路不可用
- 如 git 操作失敗但 `/tmp/fontrends-core/` 存在 → 使用離線快取，顯示警告
- 如完全無快取 → 使用下方內建基礎版，顯示「離線模式，使用內建基礎框架」

### Fallback: 內建基礎版（檔案缺失或完全離線時使用）

**最小訪談（interview-guide fallback）：**
1. 報告給誰看？ 2. 分析目的？ 3. 品牌名稱？ 4. PPT 語言和長度？

**最小分析框架（analysis-framework fallback）：**
核心維度：Dashboard 數據彙整、外部交叉驗證、品牌健康度、行動建議。

**最小 PPT 結構（ppt-template fallback）：**
5 張精簡版：封面、執行摘要、社群影響力、數據品質聲明、行動建議。
使用「中性專業」配色（深藍 1B365D + 金 BFA06A）。

---

## §0: 分析前訪談

依照 `interview-guide.md` 的 7 個問題依序訪談。
不一次全丟，逐題問答。
訪談後用確認話術回覆，等用戶確認。

---

## §1: Dashboard 導覽

依照 `looker-operations.md` 操作：
1. 開啟用戶提供的 Looker Studio URL
2. 識別左側導覽欄所有分頁
3. 設定品牌篩選器（7 步驟 SOP）
4. 確認篩選器正確後開始資料擷取

**注意：每換頁必須重新設定篩選器。**

---

## §2: 資料擷取

依照 `data-extraction.md` 的方法，逐頁擷取：
- KPI 卡片 → 截圖視覺讀取
- 圖表 → 截圖 + hover tooltip
- 表格 → read_page / get_page_text
- 每頁記錄到工作底稿

---

## §3: 交叉驗證

依照 `analysis-framework.md` 的驗證規則：
- 每個聲量高峰 → web_search 找事件對應
- 異常數據 → 檢查基準線是否同步異動
- 競品驗證（如訪談確認需要）

---

## §4: 14 維度分析

依照 `analysis-framework.md` 執行：
- 核心維度 1-7（必做）
- 進階維度 8-14（依訪談需求和資料可用性）
- 數據品質 4 大警示（必做）

---

## §5: PPT 產出

依照 `ppt-template.md` 的結構和程式碼：
1. 讀取 `brand-colors.json` 取得品牌配色
2. 用 pptxgenjs 產出 PPT（完整版 13 張 or 精簡版 8 張）
3. 執行 QA 流程（tools/ppt-qa.sh）
4. 視覺檢查每頁
5. 交付用戶

---

## §6: 執行清單

- [ ] §INIT 知識庫載入完成
- [ ] §0 訪談完成 + 用戶確認
- [ ] §1 Dashboard 導覽 + 篩選器設定
- [ ] §2 所有頁面資料擷取完成
- [ ] §3 交叉驗證完成
- [ ] §4 14 維度分析完成
- [ ] §5 PPT 產出 + QA 通過
- [ ] 交付用戶
