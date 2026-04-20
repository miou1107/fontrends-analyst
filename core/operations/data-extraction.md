# 數據提取策略（§2）

> 本文件定義從 Dashboard 提取數據的方法、格式與已知限制。

---

## 提取方法總覽

| 資料類型 | 提取方式 | 可靠度 | 備註 |
|---------|---------|--------|------|
| KPI 卡片 | DOM `scorecard` 元件 | ⭐⭐⭐ | 最穩定的提取方式 |
| 圖表數據 | SVG text 元素 | ⭐⭐ | 部分圖表數據點隱藏 |
| 表格數據 | 自定義 row 元件 | ⭐⭐ | 不能用 `table` selector |
| 截圖讀取 | 視覺 OCR / 人工判讀 | ⭐⭐⭐ | 最後手段但最可靠 |

---

## KPI 卡片提取

KPI 卡片（scorecard）是 Dashboard 最核心的數據來源。

```javascript
// 提取所有 scorecard 數值
const scorecards = document.querySelectorAll('[class*="scorecard"]');
const data = [];
scorecards.forEach((el, i) => {
  data.push({
    index: i,
    value: el.textContent.trim()
  });
});
console.log(JSON.stringify(data, null, 2));
```

提取後需對照頁面位置確認每個數字代表的指標（聲量、互動、好感度等）。

---

## 圖表數據提取

### 折線圖 / 長條圖
```javascript
// 從 SVG 提取可見文字標籤
const svgTexts = document.querySelectorAll('svg text');
const chartData = [];
svgTexts.forEach(el => {
  const text = el.textContent.trim();
  if (text) chartData.push(text);
});
console.log(chartData);
```

### 圓餅圖
```javascript
// 圓餅圖的百分比通常在 SVG text 或 tooltip 中
document.querySelectorAll('svg text').forEach(el => {
  const t = el.textContent.trim();
  if (t.includes('%')) console.log(t);
});
```

### 注意事項
- SVG 渲染的數據點可能不完整，部分數值僅在 hover 時顯示
- 若 JS 提取不完整，改用截圖 + 人工判讀
- 圖表的 X 軸日期和 Y 軸數值可能需要分開提取

---

## 表格數據提取

### ⚠️ 已知限制

**`querySelectorAll('table')` 在 Looker Studio 中總是回傳空結果！**

Looker Studio 不使用標準 HTML `<table>` 元素，而是自定義元件。

### 替代方案
```javascript
// 用 class 包含 "row" 的元素取代
document.querySelectorAll('[class*="row"]').forEach(el => {
  const text = el.textContent.trim();
  if (text) console.log(text);
});
```

### 表格資料整理
提取的原始文字通常是連續字串，需手動拆分欄位：
1. 先識別表頭欄位
2. 根據欄位數量拆分每行資料
3. 對照截圖驗證拆分是否正確

---

## SVG 渲染限制

Looker Studio 的圖表使用 SVG 渲染，已知限制：
- SVG 內容在頁面載入後可能延遲渲染
- 部分數據點僅在滑鼠 hover 時才出現在 DOM 中
- 複雜圖表（如堆疊長條圖）的數據層可能重疊
- 動態篩選後 SVG 需等待重新渲染（約 2-5 秒）

**建議：** JS 提取和截圖判讀雙管齊下，互相驗證。

---

## 工作日誌模板

每次提取數據後，記錄工作日誌：

```markdown
## 數據提取日誌

### 基本資訊
- **日期：** YYYY-MM-DD
- **品牌：** [品牌名稱]
- **Dashboard：** [Dashboard URL]
- **分析期間：** YYYY-MM-DD ~ YYYY-MM-DD

### 提取紀錄

| 頁面 | 提取狀態 | 方法 | 備註 |
|------|---------|------|------|
| 社群總覽 | ✅ 完成 | DOM | KPI 卡片 x5 |
| 趨勢 | ✅ 完成 | 截圖 | SVG 提取不完整 |
| 語系 | ✅ 完成 | DOM | — |
| 平台 | ✅ 完成 | DOM | — |
| KOL | ⚠️ 部分 | DOM + 截圖 | 僅 Top 10 |
| 好感度 | ✅ 完成 | DOM | — |
| 搜尋 | ❌ 失敗 | — | 頁面載入錯誤 |

### 數據異常
- [ ] 是否有單日聲量暴增 > 3 倍？
- [ ] 是否有平台數據歸零？
- [ ] 是否有好感度突然反轉？

### 待辦
- [ ] 補提取失敗頁面
- [ ] 驗證 Top 5 原始貼文
- [ ] 交叉驗證聲量高峰事件
```
