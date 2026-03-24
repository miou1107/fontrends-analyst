# Narrative Packaging — 敘事包裝

## Input / Output Contract

### Input
- `analysis.json` (enriched)：含 insights、swot、purpose_bindings
- `interview.json`：讀取 `client.knowledge_level`、`proposal.scenario`、`proposal.purpose`

### Output → `narrative.json`
```json
{
  "meta": { "purpose": "string", "audience_level": "string", "tone": "string", "generated_at": "ISO8601" },
  "narrative_blocks": [
    {
      "page_ref": "string（對應 script.json 的頁面 ID）",
      "title": "string",
      "subtitle": "string（可選）",
      "insight_text": "string（主要洞察，含數據佐證 + so what + 場域連結）",
      "supporting_data": [ { "label": "string", "value": "string" } ],
      "action_link": "string（連結到提案者資源的句子，可選）",
      "note": "string（頁面底部備註，可選）"
    }
  ],
  "executive_summary": [ "string（5 bullet points）" ],
  "story_arc": { "hook": "string", "problem": "string", "evidence": "string", "solution": "string", "call_to_action": "string" }
}
```

### 下游消費者
- §7 腳本企劃：讀取 narrative_blocks + executive_summary + story_arc

## Purpose

站在客戶的角度，考慮客戶的理解能力和需求，將數據洞察和目的綑綁的結果用故事化、好理解的方式包裝。讓客戶不只是看到數據，而是被引導走過一段「發現問題 → 看到機會 → 理解方案 → 準備行動」的敘事旅程。

---

## Requirements

### Requirement: 受眾適配

AI MUST 根據客戶的知識深度和角色，自動調整用語和解釋層級。

#### Scenario: 行銷專業受眾（行銷總監、品牌經理）
- **GIVEN** interview.json 的 `client_bg` 標示為行銷專業背景
- **WHEN** AI 撰寫敘事文案
- **THEN** 直接使用行銷專業術語（KOL、UGC、MoM%、Engagement Rate）不另做解釋
- **AND** 聚焦在「數據背後的策略意涵」而非數據本身

#### Scenario: 非行銷專業受眾（老闆、財務長、總經理）
- **GIVEN** interview.json 的 `client_bg` 標示為非行銷專業
- **WHEN** AI 撰寫敘事文案
- **THEN** 將專業術語轉為白話（「KOL」→「社群上有影響力的人」）
- **AND** 數據簡化為趨勢方向（「成長 23.7%」→「大幅成長」）
- **AND** 重點放在「對生意的影響」而非行銷指標細節

#### Scenario: 混合受眾（提案現場有多種角色）
- **GIVEN** interview.json 的 `scenario` 為當面提案，且 `client_bg` 描述涉及多角色
- **WHEN** AI 撰寫敘事文案
- **THEN** Slide 文字用白話，speaker_notes 補充專業術語和數據細節
- **AND** 確保非專業者看 Slide 能懂，專業者聽口述能得到深度

---

### Requirement: 敘事結構

AI MUST 依循 AIDA 變形架構組織敘事，確保每份報告有完整的故事弧線。

#### Scenario: 標準敘事結構（完整版 13 張）
- **GIVEN** script schema 為 full-13
- **WHEN** AI 規劃敘事結構
- **THEN** 依序覆蓋以下六階段：
  1. **開場震撼**（Attention）：一個讓客戶「哦？」的數據或觀點
  2. **痛點共鳴**（Interest）：點出客戶可能面臨但沒注意到的問題
  3. **數據佐證**（Evidence）：用數據證明痛點的真實性和規模
  4. **機會浮現**（Opportunity）：從數據中導出尚未被抓住的機會
  5. **方案連結**（Solution）：將機會與提案者資源自然連結
  6. **行動召喚**（Action）：具體告訴客戶「下一步做什麼」
- **AND** 每個階段至少對應一張 Slide

#### Scenario: 精簡版敘事結構（compact-8 或 executive-5）
- **GIVEN** script schema 為 compact-8 或 executive-5
- **WHEN** AI 規劃敘事結構
- **THEN** 合併六階段為三大段：
  1. **現況與問題**（合併開場震撼 + 痛點共鳴 + 數據佐證）
  2. **機會與方案**（合併機會浮現 + 方案連結）
  3. **行動建議**（行動召喚）
- **AND** 確保精簡但不遺漏關鍵敘事元素

#### Scenario: 敘事階段之間的過渡
- **GIVEN** 兩個敘事階段之間需要銜接
- **WHEN** AI 撰寫 speaker_notes
- **THEN** 提供自然過渡句，例如：
  - 痛點→數據：「這不只是感覺，數據也證實了…」
  - 數據→機會：「但反過來看，這也代表…」
  - 機會→方案：「剛好，我們有個資源可以接住這個機會…」

---

### Requirement: 語氣風格

AI MUST 根據應用場景調整敘事語氣。

#### Scenario: 當面提案風格
- **GIVEN** interview.json 的 `scenario` 為「當面提案」
- **WHEN** AI 撰寫文案
- **THEN** 語氣偏「對話感」，像在跟對方聊天
- **AND** Slide 文字精簡（核心訊息 1-2 句），細節留在 speaker_notes
- **AND** 適度使用反問句增加互動感（「你覺得這個數據代表什麼？」）

#### Scenario: 傳閱文件風格
- **GIVEN** interview.json 的 `scenario` 為「傳給對方看」
- **WHEN** AI 撰寫文案
- **THEN** 語氣偏「書面正式」，需要自解釋
- **AND** Slide 文字完整（每頁需包含足夠上下文讓讀者獨立理解）
- **AND** 不使用反問句，改用陳述句

#### Scenario: 內部討論風格
- **GIVEN** interview.json 的 `scenario` 為「內部討論」
- **WHEN** AI 撰寫文案
- **THEN** 語氣偏「技術分析」，可使用更多專業術語
- **AND** 數據呈現更詳盡，可包含方法論說明
- **AND** 增加「討論引導問題」在 speaker_notes 中

---

### Requirement: 故事化包裝技巧

AI MUST 使用具體的故事化技巧讓數據有畫面感。

#### Scenario: 比喻法（Analogy）
- **GIVEN** 洞察包含抽象數據概念
- **WHEN** AI 判斷數據對受眾可能難以感受
- **THEN** 使用貼近受眾生活的比喻：
  - 「IG 影響力佔 75%」→「如果社群是一場選舉，IG 拿了四分之三的選票」
  - 「月均聲量 1.2 萬」→「等於每天有 400 個人在網路上提到這個品牌」
- **AND** 比喻 MUST 在 speaker_notes 而非 Slide 本文（Slide 保持乾淨）

#### Scenario: 對比法（Contrast）
- **GIVEN** 洞察涉及品牌 vs 競品、或時間區段的差異
- **WHEN** AI 組織敘事
- **THEN** 先說「他們是 X」，再說「但你是 Y」，製造認知落差
- **AND** 對比數據並排呈現，突出差異幅度

#### Scenario: 時間線敘事（Timeline Narrative）
- **GIVEN** 洞察涉及趨勢變化或事件序列
- **WHEN** AI 組織敘事
- **THEN** 使用時間線結構：「三個月前→現在→如果不做→如果做了」
- **AND** 將趨勢數據轉化為「正在發生的故事」而非靜態數字

#### Scenario: 客戶視角轉換（Perspective Shift）
- **GIVEN** 洞察是從分析者角度描述
- **WHEN** AI 進行敘事包裝
- **THEN** 轉換為客戶視角：
  - 分析者角度：「IG Reels 觀看次數月增 40%」
  - 客戶視角：「你的潛在消費者正在 Reels 上花越來越多時間」
- **AND** 所有洞察 MUST 回答客戶心中的「So What?」

---

### Requirement: narrative.json 輸出格式

AI MUST 將敘事包裝結果以 narrative.json 存到 runs 資料夾。

#### Scenario: narrative.json 寫入前防呆（2026-03-20 實戰教訓）
- **GIVEN** AI 準備寫入 narrative.json
- **WHEN** 該檔案可能已存在（上次執行的半成品、或 context compaction 後 resume）
- **THEN** MUST 先 Read 目標檔案（即使預期不存在，也要嘗試）
- **AND** 如果存在 → 覆寫（以最新數據為準）
- **AND** 如果不存在 → 正常建立

> Write tool 要求在寫入前必須先 Read 過目標檔案，否則會拒絕寫入。

#### Scenario: Context Compaction 斷點恢復
- **GIVEN** 從 context compaction 後 resume
- **WHEN** AI 恢復工作
- **THEN** 不要假設之前讀過的檔案還在 context 裡 — 必須重新 Read 所有 input 檔案
- **AND** 在 §0 階段一次性平行讀取所有 input + 目標 output
- **AND** 不要問 user 現在跑到哪 — 直接讀取已有的產出物判斷進度

#### Scenario: narrative.json 結構
- **GIVEN** 敘事包裝完成
- **WHEN** AI 寫入檔案
- **THEN** 存到 `~/.fontrends/runs/{brand}-{date}/narrative.json`
- **AND** JSON 結構如下：

```json
{
  "version": "1.0",
  "timestamp": "2026-03-19T14:00:00+08:00",
  "brand": "Louis Vuitton",
  "audience_profile": {
    "knowledge_level": "marketing_professional",
    "scenario": "in_person_presentation",
    "tone": "conversational"
  },
  "narrative_arc": [
    {
      "stage": "attention",
      "stage_label": "開場震撼",
      "insight_ids": ["insight_001"],
      "core_message": "LV 在台灣的社群影響力正處於 3 年高點",
      "storytelling_technique": "contrast",
      "speaker_note_hook": "我們先看一個數據，可能會讓你意外..."
    }
  ],
  "bindings_used": ["binding_001", "binding_003"],
  "quality_check": {
    "every_insight_has_so_what": true,
    "every_insight_has_data": true,
    "every_insight_has_action_link": true,
    "no_empty_claims": true
  }
}
```

#### Scenario: narrative.json 讀取來源
- **GIVEN** AI 準備撰寫 narrative.json
- **WHEN** AI 組裝資料
- **THEN** MUST 讀取以下來源：
  - `interview.json`（受眾背景、風格偏好）
  - `analysis.json`（數據洞察）
  - `analysis.json` 的 `purpose_bindings`（目的綑綁配對結果）

---

### Requirement: 分析框架與維度

AI MUST 在每個章節運用標準分析框架，確保洞察立體、可驗證。

#### Scenario: 三層對比框架（每章節必備）
- **GIVEN** 任一章節包含數據洞察
- **WHEN** AI 撰寫敘事文案
- **THEN** 每個章節 MUST 同時覆蓋三個對比層：
  1. **自比**（自身時間對比）：本期 vs 上期、YoY、MoM；「三個月前是 X，現在是 Y」
  2. **競比**（品牌對品牌）：目標品牌 vs 競品；「同期對手是 Z，差距 N%」
  3. **環比**（品牌 vs 大盤）：品牌表現 vs 市場整體；「市場聲量成長 10%，品牌成長 25%，跑贏大盤」
- **AND** 若某層資料缺失（如競品資料不完整），MUST 標記「競比資料待補」而非省略

#### Scenario: 人事時地物分析維度
- **GIVEN** 洞察涉及社群聲量或搜尋行為
- **WHEN** AI 組織分析視角
- **THEN** 優先沿以下五個維度尋找洞察：
  - **人**：誰在說？（KOL 等級、官方 vs UGC、語系/國籍分布）
  - **事**：說了什麼？（正負評、關鍵字意圖、長尾字主題）
  - **時**：什麼時候說？（趨勢高峰、季節性、事件對應）
  - **地**：在哪裡說？（平台分布、地區分布）
  - **物**：關於什麼？（品項、系列、活動、聯名）
- **AND** 五維度中至少覆蓋三個，並用數據佐證每個維度的主要發現

#### Scenario: 報告引導決策策略
- **GIVEN** 報告目的為「提案」或「說服決策者」
- **WHEN** AI 撰寫結論與建議段落
- **THEN** 每個洞察 MUST 連結到一個可執行的決策選項（「做 A 或 B」），而不只是描述現象
- **AND** 建議 MUST 附上優先順序依據（ROI 預估 / 機會視窗 / 競品差距）
- **AND** 最後一頁 MUST 包含「下一步行動清單」，每項行動具體到「誰、做什麼、何時完成」

#### Scenario: 品牌指名度分析（有數據時必放）
- **GIVEN** data.json 包含搜尋關鍵字（search_intent 或 GSC top_queries）
- **WHEN** AI 進行品牌分析
- **THEN** 計算並呈現品牌指名度：
  - **簡化版公式**：品牌指名搜尋量 ÷ 總搜尋量 × 100%
  - **完整版公式**：(品牌名稱相關字 + 品牌產品系列字) ÷ (全部關鍵字加權搜尋量) × 100%
- **AND** 與競品指名度對比（若有競品搜尋資料）
- **AND** 趨勢方向：本期指名度 vs 上期，是否在成長

#### Scenario: 搜尋長尾字意圖分析
- **GIVEN** data.json 包含 keyword_intent 或 search_intent 頁面資料
- **WHEN** AI 分析關鍵字結構
- **THEN** 將關鍵字分層解讀：
  - **品牌核心字**：品牌名本身，代表「指名搜尋」
  - **品牌 + 品項字**：「品牌 + 包款/錶款/系列」，代表「購物意圖」
  - **比較字**：「品牌 vs 競品」，代表「猶豫期消費者」
  - **資訊字**：「品牌 + 歷史/評價/真假」，代表「研究型消費者」
  - **長尾低量字**：小眾需求，代表「利基市場機會」
- **AND** 呈現各層佔比，找出成長最快的意圖層

#### Scenario: 聲量真實性鑑別
- **GIVEN** data.json 包含社群貼文資料或 notable_posts
- **WHEN** AI 評估聲量品質
- **THEN** 標記以下業配/非自然聲量訊號：
  - **業配痕跡**：「#AD」「#sponsored」「文末導購連結」「統一格式開頭文案」
  - **抽獎文**：「留言/分享抽xxx」「tag 朋友得xxx」
  - **大量重複文案**：多帳號發出幾乎相同的文字
- **AND** 在報告中標注「自然聲量」vs「業配/活動聲量」比例（若可計算）
- **AND** 重要指標 MUST 使用「自然聲量」計算，業配聲量單獨列示

#### Scenario: 爆文分析
- **GIVEN** data.json 的 notable_posts 中有 type=high_engagement 或 trend_spike 的貼文
- **WHEN** AI 分析爆文
- **THEN** 對每篇爆文分析：
  1. **爆文因子**：是什麼讓它爆（KOL等級、話題性、時間點、格式）
  2. **可複製性**：這個因子是否可被品牌策略化利用
  3. **競品關聯**：同期競品是否有類似爆文，品牌是否錯失機會
- **AND** 提煉「爆文 pattern」作為建議（如「IG Reels + 名人標記 + 上市日」）

#### Scenario: 數據準確率限制聲明
- **GIVEN** data.json 中任何頁面的 confidence 為 low 或 medium
- **WHEN** AI 撰寫涉及這些數據的段落
- **THEN** MUST 在段落末加入限制聲明，例如：
  - 「以上數據來自社群監測工具，實際觸及範圍可能有所差異，建議與品牌第一方數據交叉驗證」
  - 「搜尋量數據來自 Google Trends，為相對指數，非絕對搜尋次數」
- **AND** 報告封底或備註頁 MUST 包含一段「數據說明與限制」，列出各來源的數據性質與準確率範圍

---

### Requirement: 品質規則

每個敘事包裝的洞察 MUST 通過品質三角檢查，禁止空話。

#### Scenario: 品質三角（Data + So What + Action Link）
- **GIVEN** 任何一條包裝後的洞察
- **WHEN** AI 執行品質檢查
- **THEN** 該洞察 MUST 同時具備：
  1. **數據佐證**（Data）：明確的數據來源和數字
  2. **意義闡述**（So What）：這個數據對客戶代表什麼
  3. **行動連結**（Action Link）：客戶看完可以做什麼
- **AND** 任一缺失則標記為不合格，需補齊後才能進入 script planning

#### Scenario: 禁止空話檢測
- **GIVEN** 敘事文案已撰寫
- **WHEN** AI 執行品質檢查
- **THEN** 掃描以下空話模式並標記：
  - 「值得關注」但沒說為什麼值得
  - 「表現亮眼」但沒給比較基準
  - 「建議持續觀察」但沒給觀察指標
  - 「有很大的潛力」但沒量化潛力大小
- **AND** 標記為空話的文案 MUST 改寫為具體陳述

---

### Requirement: 自動串接下游

narrative.json 完成後，如果是從 pipeline 自動觸發，MUST 直接串接 presentation-generator，不中斷問 user。

#### Scenario: Pipeline 自動串接（2026-03-20 實戰驗證）
- **GIVEN** narrative.json 產出完成，且是從 pipeline 自動觸發（非使用者手動呼叫）
- **WHEN** 寫入完成
- **THEN** 不要停下來問 user — 直接觸發 presentation-generator skill
- **AND** 通知 user narrative 已完成（但不等待回覆）

> User feedback：「extraction 完成後自動串接 narrative → presentation，不要中斷問」

#### Scenario: 品質檢查結果寫入
- **GIVEN** 品質檢查完成
- **WHEN** AI 更新 narrative.json
- **THEN** 將檢查結果寫入 `quality_check` 欄位
- **AND** 如果有不合格項目，寫入 `quality_issues` 陣列，每筆包含 insight_id、issue_type、suggestion
