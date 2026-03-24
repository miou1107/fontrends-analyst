# Data Extraction Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `data-extraction-engine` skill that extracts brand data from multiple sources (Looker Studio, GA4, GSC, Google Trends), writes results incrementally to `data.json`, and supports checkpoint resume.

**Architecture:** Adapter pattern — one engine skill orchestrates extraction, each data source has its own adapter (md file with operation rules). Engine handles run initialization, incremental write, and resume logic. Adapters contain source-specific browser operation SOPs. Not a code project — these are AI skill files that guide Claude's behavior.

**Tech Stack:** Claude Code skills (md files), Claude in Chrome MCP tools (computer, find, read_page, get_page_text, javascript_tool), JSON for data persistence.

**Spec:** `/Projects/fontrends-analyst/openspec/specs/data-extraction-engine/spec.md`

---

## File Structure

```
# 注意：使用 user-level skills 路徑（~/.claude/skills/），非 project-level
~/.claude/skills/data-extraction-engine/
├── SKILL.md                        ← Engine: flow control, data.json schema, resume logic
├── adapters/
│   ├── looker-studio.md            ← Looker Studio SOP (filter v2, page extraction, reconnaissance)
│   ├── ga4.md                      ← GA4 browser extraction SOP
│   ├── gsc.md                      ← Google Search Console browser extraction SOP
│   └── google-trends.md            ← Google Trends browser extraction SOP
└── learned/
    └── corrections.jsonl           ← Cross-adapter pitfall accumulation (empty initial)
```

**Existing files to modify:**
- `~/.claude/skills/brand-analysis-looker-studio/SKILL.md` — Update §2 to delegate to new skill

**Existing files to reference (read-only):**
- `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/looker-operations.md` — Current Looker SOP (basis for adapter)
- `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/data-extraction.md` — Current extraction methods
- `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/browser-strategies.md` — Browser interaction patterns

---

## Task 1: Create SKILL.md — Engine Core

**Files:**
- Create: `~/.claude/skills/data-extraction-engine/SKILL.md`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p ~/.claude/skills/data-extraction-engine/adapters
mkdir -p ~/.claude/skills/data-extraction-engine/learned
touch ~/.claude/skills/data-extraction-engine/learned/corrections.jsonl
```

- [ ] **Step 2: Write SKILL.md with the following sections**

The file must contain:

**Frontmatter:**
- name: `data-extraction-engine`
- description: Trigger phrases — 「擷取數據」「抓資料」「data extraction」「跑 Dashboard」「從 Looker 拿資料」「從 GA4 拿資料」

**§0 初始化 Run:**
- 建立 `~/.fontrends/runs/{brand}-{date}/` 資料夾
- 初始化 `data_partial.json`：meta（brand, competitor, period, sources, urls）+ 所有頁面 status=pending
- 如果資料夾已存在且有 `data_partial.json` → 進入斷點續接模式

**§1 斷點偵測:**
- 讀取 `data_partial.json`
- 掃描每頁 status：completed → 跳過、in_progress → 重跑、pending → 排隊、failed → 報告 user
- 顯示進度：「已完成 X/Y 頁，從 {page} 繼續」
- 支援手動重跑：user 說「重跑 social_overview」→ 將該頁 status 設為 pending，清除 data → 重新擷取 → 完成後檢查是否全部 completed

**§2 Adapter 調用:**
- 依 interview.json 的 sources 清單，依序載入 adapter（V1 循序；V2 將支援 subagent 並行）
- 載入順序：先找 `adapters/{source}-api.md`，不存在則找 `adapters/{source}.md`
- Adapter 不存在 → 通知 user，跳過
- 每個 adapter 失敗不中斷其他 adapter
- 認證失敗（頁面導向登入畫面）→ 標記整個 source 為 failed，reason=authentication_required，通知 user 重新登入
- 欄位映射：`interview.json.dashboard_urls` → `data.json.meta.urls`

**§3 逐頁寫入:**
- 每完成一頁 → 立即更新 data_partial.json（該頁 status=completed + data 填入）
- 同時寫入 extraction-log.jsonl（timestamp, source, page, status, method, duration_ms, warnings）
- 資料正規化：非數字值（N/A、—、空字串）→ 存為 null + 加入 warnings 陣列
- 頁面載入超時：等 30 秒 → 重試 1 次 → 仍失敗則標記 failed
- Context 剩餘 < 20% → 主動寫入 data_partial.json + run-status.json

**§4 完成處理:**
- 所有頁面 completed → rename data_partial.json → data.json + 寫入 run-status.json（status=completed）
- 寫入 extraction-log.jsonl summary record（type=summary, total_pages, completed, failed, skipped, total_duration_ms, success_rate）
- 有 failed 頁面 → 保留 data_partial.json + 寫入 run-status.json（status=failed）+ 列出失敗頁面
- Context window 中斷 → 寫入 run-status.json（status=interrupted, current_stage, completed pages list）

**data.json schema:**
```json
{
  "meta": {
    "brand": "string",
    "competitor": "string",
    "period": "string",
    "extracted_at": "ISO8601",
    "sources": ["looker-studio", "ga4", "gsc", "google-trends"],
    "urls": {
      "looker-studio": "https://...",
      "ga4": "https://...",
      "gsc": "https://...",
      "google-trends": "https://..."
    }
  },
  "pages": {
    "{page_key}": {
      "source": "looker-studio|ga4|gsc|google-trends",
      "status": "pending|in_progress|completed|failed",
      "confidence": "high|medium|low",
      "extracted_at": "ISO8601|null",
      "data": { ... }
    }
  }
}
```

- [ ] **Step 3: Verify SKILL.md is valid**

```bash
cat ~/.claude/skills/data-extraction-engine/SKILL.md | head -5
# Should show frontmatter with name and description
```

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/skills/data-extraction-engine
# Not a git repo, no commit needed. Verify file exists:
ls -la SKILL.md adapters/ learned/
```

---

## Task 2: Create Looker Studio Adapter

**Files:**
- Create: `~/.claude/skills/data-extraction-engine/adapters/looker-studio.md`
- Reference: `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/looker-operations.md`
- Reference: `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/data-extraction.md`

- [ ] **Step 1: Read existing SOPs for content migration**

```bash
cat ~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/looker-operations.md
cat ~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/data-extraction.md
```

- [ ] **Step 2: Write looker-studio.md with the following sections**

**§0 Dashboard 偵察（新）:**
- 開啟 Looker Studio URL
- 掃描左側導覽列 → 列出所有頁面
- 開啟篩選器 → 列出所有品牌選項
- 確認目標品牌存在
  - 不存在 → 列出所有可用品牌 → 建議替代品牌 → 等 user 選擇 → 記錄 warning（reason=brand_not_found_in_filter, suggested=[]）
- 回報偵察結果：「X 頁，Y 個品牌可選，建議競品：Z」

**§1 Filter SOP v2（從 v1 升級）:**

```
1. 點擊篩選器區域開啟下拉
2. 點擊搜尋框
3. 輸入品牌英文名（參照 brand name mapping）
4. ★ 使用 find 工具取得品牌 checkbox ref → 用 ref 點擊（不用座標）
5. Triple-click 搜尋框 → 輸入「台北101」
6. ★ 使用 find 工具取得台北101 checkbox ref → 用 ref 點擊取消
7. 按 Escape 關閉 → 失敗則點擊頁面空白區域 (400, 600)
8. 驗證篩選器顯示「(1)」
```

**§1.1 搜尋意圖分析頁特殊處理:**

```
此頁預設為「全選」狀態，標準 SOP 不適用。
1. 開啟篩選器
2. ★ 使用 find 工具取得「全選」checkbox ref → 點擊取消全部
3. 搜尋品牌名
4. ★ 使用 find 工具取得品牌 checkbox ref → 點擊勾選
5. Escape 或點空白關閉
```

**§2 頁面分類與擷取方法:**

| 頁面類型 | 方法 | 優先級 |
|----------|------|--------|
| KPI 卡片 | get_page_text / DOM | 1（最穩定） |
| 表格 | read_page + `[class*="row"]` | 2 |
| 長條/圓餅圖 | 截圖 + hover tooltip | 3 |
| 趨勢折線圖 | hover 逐月取值 | 3 |
| 地圖評價 | **跳過**（品牌分析無用） | - |

**§2.1 SVG Fallback Chain:**

```
DOM extraction → 失敗
  → hover tooltip 取值 → 失敗
    → 截圖視覺讀取 → 失敗
      → 標記 confidence=low，繼續下一頁
```

**§3 Brand Name Mapping:**

```
Louis Vuitton → 搜尋 "louis"
Gucci → 搜尋 "gucci"
Chanel → 搜尋 "chanel"
Hermès → 搜尋 "hermes"（注意：部分 Dashboard 可能沒有）
Dior → 搜尋 "dior"
```

**§4 已知問題（從 corrections.jsonl 遷移）:**
- 「僅」按鈕會導航離開 Dashboard → 絕對不要點
- 每換頁必須重設篩選器
- 搜尋意圖頁預設全選
- SVG 渲染延遲 2-5 秒，篩選器設定後需等待
- ref 點擊成功率 ~100%，座標點擊 ~50%

**§5 Journey101 Dashboard 頁面清單（預設）:**

```
1. 社群總覽 → social_overview
2. 國際語系 → language_distribution
3. 趨勢分析 → trend
4. 月份分布 → monthly_distribution
5. 好感度 → sentiment
6. 平台聲量 → platform
7. KOL 影響力 → kol
8. 搜尋意圖分析 → search_intent（特殊 filter）
9. 關鍵字意圖分布 → keyword_intent（特殊 filter）
10. 地圖評價 → 跳過
```

- [ ] **Step 3: Verify adapter file**

```bash
wc -l ~/.claude/skills/data-extraction-engine/adapters/looker-studio.md
# Should be 150-250 lines
```

---

## Task 3: Create GA4 Adapter

**Files:**
- Create: `~/.claude/skills/data-extraction-engine/adapters/ga4.md`

- [ ] **Step 1: Write ga4.md with the following sections**

**§0 前置條件:**
- User 需提供 GA4 property URL 或 property ID
- User 需在瀏覽器中已登入 Google Analytics
- 認證失敗（導向登入頁）→ 通知 user 重新登入

**§1 操作流程:**

```
1. 開啟 GA4 報表頁面
2. 設定日期範圍（與 interview.json period 同步）
3. 切換到「流量獲取」報表
4. 使用 get_page_text / read_page 擷取表格數據
5. 切換到「頁面和畫面」報表
6. 擷取到達頁面 Top 10
7. 切換到「使用者屬性 > 地理位置」
8. 擷取地區分布
```

**§2 預設擷取頁面（可依偵察結果動態調整）:**

```
traffic_overview → { sessions, users, pageviews, bounce_rate, avg_session_duration }
traffic_source → { organic, paid, social, direct, referral, email }
landing_pages → [{ page, sessions, bounce_rate, avg_time }] Top 10
geo_distribution → [{ country, sessions, percentage }] Top 10
```

**§3 擷取技巧:**
- GA4 表格多為標準 HTML `<table>`，比 Looker 好擷取
- 日期選擇器：點擊日期範圍 → 輸入起始/結束日期
- 排序：點擊欄位標題切換排序方向
- 分頁：如有「顯示更多」按鈕，點擊展開

**§4 已知限制:**
- Free tier GA4 資料有取樣（數據旁會顯示綠色盾牌 = 無取樣）
- 部分報表載入慢（10-15 秒），需等待
- 自訂報表結構不可預測 → 先偵察再擷取

- [ ] **Step 2: Verify file**

```bash
ls -la ~/.claude/skills/data-extraction-engine/adapters/ga4.md
```

---

## Task 4: Create GSC Adapter

**Files:**
- Create: `~/.claude/skills/data-extraction-engine/adapters/gsc.md`

- [ ] **Step 1: Write gsc.md with the following sections**

**§0 前置條件:**
- User 需提供 Search Console property URL
- User 需在瀏覽器中已登入 GSC
- 認證失敗 → 通知 user

**§1 操作流程:**

```
1. 開啟 Search Console 成效頁面
2. 設定日期範圍（與 interview.json period 同步）
3. 在「查詢」篩選器中加入品牌名稱
4. 擷取頂部 KPI（點擊次數、曝光次數、CTR、平均排名）
5. 擷取「查詢」分頁表格 Top 20
6. 切換到「頁面」分頁 → 擷取 Top 10
7. 切換到「裝置」分頁 → 擷取分布
```

**§2 預設擷取頁面:**

```
search_performance → { clicks, impressions, ctr, avg_position }
top_queries → [{ query, clicks, impressions, ctr, position }] Top 20
top_pages → [{ page, clicks, impressions, ctr, position }] Top 10
device_distribution → [{ device, clicks, percentage }]
```

**§3 擷取技巧:**
- GSC 表格為標準 HTML，read_page 可直接擷取
- 日期範圍選擇：點擊「日期：過去 X 個月」→ 自訂 → 輸入日期
- 篩選器：點擊「+新增」→ 選「查詢」→ 「包含」→ 輸入品牌名

**§4 已知限制:**
- GSC 資料有 2-3 天延遲
- 匿名查詢不會顯示（可能佔 10-30%）
- 最多顯示 1000 筆查詢（通常夠用）

- [ ] **Step 2: Verify file**

```bash
ls -la ~/.claude/skills/data-extraction-engine/adapters/gsc.md
```

---

## Task 5: Create Google Trends Adapter

**Files:**
- Create: `~/.claude/skills/data-extraction-engine/adapters/google-trends.md`

- [ ] **Step 1: Write google-trends.md with the following sections**

**§0 前置條件:**
- 不需要登入（Trends 公開）
- 需要品牌名和競品名（from interview.json）

**§1 操作流程:**

```
1. 開啟 Google Trends（https://trends.google.com/trends/explore）
2. 輸入品牌名稱
3. 設定地區（台灣）和時間範圍
4. 加入競品做比較（+ 比較按鈕）
5. 擷取趨勢圖表數據（hover 逐月）
6. 擷取「相關主題」
7. 擷取「相關搜尋」
8. 擷取「各地區興趣」
```

**§2 預設擷取頁面:**

```
trend_comparison → { brand_interest: [monthly values], competitor_interest: [monthly values] }
related_topics → [{ topic, type: "rising|top", value }] Top 5
related_queries → [{ query, type: "rising|top", value }] Top 5  ← spec 原無此項，plan 新增
regional_interest → [{ region, interest }]
```

**§3 擷取技巧:**
- Trends 數值是 0-100 的相對指數，不是絕對值
- hover 折線圖可以取得精確月份數值
- 「相關主題」和「相關搜尋」是文字表格，get_page_text 可擷取
- 地區興趣可能顯示為地圖 → 切換到表格視圖

**§4 已知限制:**
- 數值為相對指數（最高值=100），不同查詢間不可比較
- 搜尋量太低的品牌可能無資料
- 一次最多比較 5 個關鍵字

- [ ] **Step 2: Verify file**

```bash
ls -la ~/.claude/skills/data-extraction-engine/adapters/google-trends.md
```

---

## Task 6: Update brand-analysis-looker-studio Skill

**Files:**
- Modify: `~/.claude/skills/brand-analysis-looker-studio/SKILL.md`

- [ ] **Step 1: Read current §2 section**

```bash
grep -n "§2" ~/.claude/skills/brand-analysis-looker-studio/SKILL.md
```

- [ ] **Step 2: Replace §2 Data Extraction section**

Change from:
```
## §2: 資料擷取
依照 `data-extraction.md` 的方法，逐頁擷取...
```

To:
```
## §2: 資料擷取

**委派給 `data-extraction-engine` skill 執行。**

該 skill 會：
1. 初始化 run 資料夾（~/.fontrends/runs/{brand}-{date}/）
2. 根據訪談確認的資料來源，載入對應 adapter
3. 逐頁擷取並即時寫入 data_partial.json
4. 全部完成後產出 data.json
5. 支援斷點續接（context window 耗盡時自動保存進度）

如 `data-extraction-engine` skill 不可用，使用以下 fallback：
- 讀取 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/operations/data-extraction.md` 手動擷取
- 每頁擷取結果記錄到工作底稿
```

- [ ] **Step 3: Also update §0 interview to add data sources question**

Add to the interview section:
```
Q8: 有哪些資料來源？（Looker Studio / GA4 / GSC / Google Trends）
Q9: 各資料來源的 URL？
```

- [ ] **Step 4: Verify changes**

```bash
grep -A 10 "§2" ~/.claude/skills/brand-analysis-looker-studio/SKILL.md
```

---

## Task 7: End-to-End Smoke Test

- [ ] **Step 1: Verify complete file structure**

```bash
echo "=== Skill Structure ==="
find ~/.claude/skills/data-extraction-engine -type f | sort

echo "=== File sizes ==="
wc -l ~/.claude/skills/data-extraction-engine/SKILL.md
wc -l ~/.claude/skills/data-extraction-engine/adapters/*.md
```

Expected:
```
~/.claude/skills/data-extraction-engine/SKILL.md           (~150-200 lines)
~/.claude/skills/data-extraction-engine/adapters/ga4.md     (~80-120 lines)
~/.claude/skills/data-extraction-engine/adapters/gsc.md     (~80-120 lines)
~/.claude/skills/data-extraction-engine/adapters/google-trends.md (~80-120 lines)
~/.claude/skills/data-extraction-engine/adapters/looker-studio.md (~200-250 lines)
~/.claude/skills/data-extraction-engine/learned/corrections.jsonl (empty)
```

- [ ] **Step 2: Verify skill is discoverable**

The skill should appear in Claude Code's skill list. Check:
```bash
grep "data-extraction-engine" ~/.claude/skills/data-extraction-engine/SKILL.md | head -1
# Should show: name: data-extraction-engine
```

- [ ] **Step 3: Verify brand-analysis delegation**

```bash
grep "data-extraction-engine" ~/.claude/skills/brand-analysis-looker-studio/SKILL.md
# Should show: 委派給 `data-extraction-engine` skill 執行
```

- [ ] **Step 4: Create test run folder to verify path**

```bash
mkdir -p ~/.fontrends/runs/test-brand-2026-03-20
echo '{"meta":{"brand":"test","sources":["looker-studio"]},"pages":{}}' > ~/.fontrends/runs/test-brand-2026-03-20/data_partial.json
cat ~/.fontrends/runs/test-brand-2026-03-20/data_partial.json | python3 -m json.tool
rm -rf ~/.fontrends/runs/test-brand-2026-03-20
```

Expected: Valid JSON output, then clean removal.

---

## Summary

| Task | 產出 | 預估時間 |
|------|------|---------|
| 1 | SKILL.md（engine core） | 10 min |
| 2 | looker-studio.md（最大的 adapter） | 15 min |
| 3 | ga4.md | 5 min |
| 4 | gsc.md | 5 min |
| 5 | google-trends.md | 5 min |
| 6 | 更新 brand-analysis skill | 3 min |
| 7 | Smoke test | 2 min |
| **Total** | **6 files + 1 update** | **~45 min** |
