# Looker Studio 操作 SOP

> 本文件為 Journey101 Dashboard 的操作指南。
> 適用於 FonTrends 品牌分析報告的數據提取流程。

---

## Dashboard URL 結構

Journey101 Dashboard URL 格式：
```
https://lookerstudio.google.com/reporting/{REPORT_ID}/page/{PAGE_ID}
```

每份報告有固定的 Report ID，不同頁面有不同的 Page ID。

---

## 標準頁面

Journey101 Dashboard 通常包含以下頁面：

1. **社群總覽** — 聲量總數、互動總數、KPI 卡片
2. **趨勢** — 時間軸折線圖（日/週/月）
3. **語系** — 語言分布圓餅圖 / 長條圖
4. **平台** — 各社群平台聲量佔比
5. **KOL** — 影響力排行、Top KOL 列表
6. **好感度** — 正面/負面/中性情緒分布
7. **搜尋** — Google 搜尋趨勢相關

---

## 品牌名稱對照表（篩選器用）

Dashboard 篩選器需使用英文品牌名搜尋，對照如下：

| 篩選器輸入 | 品牌 | 注意事項 |
|-----------|------|----------|
| `louis` | Louis Vuitton | 不要輸入 LV，搜不到 |
| `chanel` | Chanel | 全小寫即可 |
| `hermes` | Hermès | 不需打重音符號 |
| `gucci` | Gucci | 全小寫即可 |
| `coach` | Coach | — |
| `pandora` | Pandora | — |

> ⚠️ **品牌可用性不固定！** 不是每個 Dashboard 都有上述所有品牌。
> 例如 Journey101 Super Dashboard 沒有 Hermès，但有 Gucci。
> **務必先執行 §0.5 Dashboard 偵察，確認實際可用品牌後再進訪談。**

---

## 🚨 篩選器操作 SOP（7 步驟）

> **每換一頁都要重做篩選器！** 篩選狀態不會跨頁保留。

### 步驟

1. **點擊主題篩選器** — 頁面頂部的下拉篩選器
2. **搜尋框輸入英文品牌名** — 例如輸入 `louis`（不是 LV）
3. **勾選目標品牌 checkbox** — 勾選搜尋結果中的目標品牌
4. **清空搜尋框，輸入 `台北101`**
5. **取消勾選台北101** — 確保排除場域本身的聲量
6. **按 Escape 關閉篩選器**
7. **確認顯示「Louis Vuit...(1)」** — 括號內數字應為 1，代表只選了一個品牌

### 🔧 Checkbox 點擊可靠性（重要）

**座標點擊 checkbox 在 Looker Studio 極不穩定！** 推薦使用 `find` + `ref` 方式：

1. 用 `find` 工具搜尋 checkbox 元素（搜尋品牌名或「台北101」文字）
2. 拿到元素 `ref`（如 `ref_2015`）
3. 用 `computer` 工具的 `ref` 參數點擊（不用座標）

此方式成功率接近 100%，座標點擊成功率約 50%。

### ⚠️ 搜尋意圖分析頁的特殊篩選器預設

**搜尋意圖分析頁的篩選器預設是「全選」，不是只選台北101！**

標準 7 步驟在此頁會失效，需改用：
1. 打開篩選器
2. 用 `find` 找到「全選」checkbox → 點擊取消全選
3. 搜尋目標品牌 → 用 `find` + `ref` 勾選
4. 按 Escape 關閉（若無效 → 點擊頁面空白區域如座標 400,600）

### 🖱️ Escape 關閉篩選器的 Fallback

若按 Escape 後篩選器仍開啟，改用：點擊頁面空白區域（如座標 400, 600）強制關閉。

### ❌ 禁止操作

**絕對不要使用「僅」按鈕！**
- 點擊「僅」按鈕會導致跳回 Looker Studio 首頁
- 這是已知的 Looker Studio bug / 非預期行為
- 只能用 checkbox 勾選/取消勾選的方式操作

---

## DOM 數據提取 JS 片段

### 提取 KPI 卡片數值
```javascript
// 提取頁面上所有 KPI 大數字
document.querySelectorAll('[class*="scorecard"]').forEach(el => {
  console.log(el.textContent.trim());
});
```

### 提取圖表數據
```javascript
// 嘗試從 SVG 圖表提取數據點
document.querySelectorAll('svg text').forEach(el => {
  const text = el.textContent.trim();
  if (text && text !== '') console.log(text);
});
```

### 提取表格數據
```javascript
// 注意：querySelectorAll('table') 在 Looker Studio 中總是失敗
// Looker Studio 使用自定義元件，不是標準 HTML table
// 改用以下方式：
document.querySelectorAll('[class*="row"]').forEach(el => {
  console.log(el.textContent.trim());
});
```

---

## 每頁提取指引

| 頁面 | 提取重點 | 提取方式 | 品牌分析適用 |
|------|---------|----------|-------------|
| 社群總覽 | KPI 卡片（聲量、互動、好感度） | scorecard 元件 | ✅ 必做 |
| 趨勢 | 折線圖數據點、高低峰日期 | SVG text 或截圖讀取 | ✅ 必做 |
| 語系 | 各語系百分比 | 圓餅圖 SVG 或截圖 | ✅ 必做 |
| 平台 | 各平台聲量數字 | 長條圖 SVG 或截圖 | ✅ 必做 |
| KOL | Top KOL 名單、互動數 | 列表元件 | ✅ 必做 |
| 好感度 | 正/負/中性比例 | 圓餅圖或數字 | ✅ 必做 |
| 搜尋 | 搜尋趨勢關鍵字 | 列表或文字元件 | ✅ 建議 |
| 地圖評價 | 地標評論/評分 | — | ❌ 品牌非地標，跳過 |

---

## Extension 斷線恢復

若 Claude in Chrome extension 斷線：

1. 檢查 extension 是否仍在運行（Chrome 右上角圖示）
2. 重新整理 Dashboard 頁面
3. 等待頁面完全載入（約 5-10 秒）
4. 重新執行篩選器 SOP（7 步驟）
5. 如果仍無法操作 → 截圖後改用 upload mode 手動提取

---

## 非 Journey101 Dashboard 注意事項

- 本 SOP 針對 Journey101 Dashboard 設計
- 其他 Dashboard 的篩選器結構可能不同
- 品牌名稱對照表可能不適用
- DOM 提取 JS 片段可能需要調整 selector
- 遇到非 Journey101 Dashboard 時，先截圖確認頁面結構再操作
