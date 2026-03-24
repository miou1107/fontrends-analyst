# PPT 模板：pptxgenjs 13 張投影片

> 使用 pptxgenjs 產出品牌分析簡報。
> 色碼不加 `#` 前綴（pptxgenjs 規範）。

---

## 色彩系統

品牌色從 `brand-colors.json` 載入，以下為變數名稱對應：

| 變數 | 用途 | 範例（LV） |
|------|------|-----------|
| `primary` | 主色、標題底色 | `BFA06A` |
| `secondary` | 輔色、圖表次色 | `0A0A0A` |
| `dark_bg` | 深色背景頁 | `0A0A0A` |
| `light_bg` | 淺色背景頁 | `F5F0E8` |
| `accent` | 強調色、圖表亮點 | `D4B483` |
| `text_on_dark` | 深色背景上的文字 | `FFFFFF` |
| `text_on_light` | 淺色背景上的文字 | `0A0A0A` |

---

## Shadow Helper

> ⚠️ pptxgenjs 的 shadow 物件會被 mutate（已知 bug）。
> 每次使用都必須建立新物件，不可共用引用。

```javascript
function makeShadow() {
  return {
    type: 'outer',
    blur: 3,
    offset: 2,
    color: '000000',
    opacity: 0.3  // pptxgenjs 用 0-1 小數，不是百分比
  };
}

// ✅ 正確用法
slide.addText('標題', { shadow: makeShadow() });
slide.addText('副標', { shadow: makeShadow() });

// ❌ 錯誤用法（shadow 會被 mutate）
const shadow = makeShadow();
slide.addText('標題', { shadow: shadow });
slide.addText('副標', { shadow: shadow }); // 這裡的 shadow 已被改變
```

---

## Header 樣式

```javascript
function addHeader(slide, text, colors) {
  slide.addText(text, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 24,
    fontFace: 'Microsoft JhengHei',  // 微軟正黑體
    color: colors.text_on_light,
    bold: true
  });
  // 底線裝飾
  slide.addShape('rect', {
    x: 0.5,
    y: 0.95,
    w: 2,
    h: 0.04,
    fill: { color: colors.primary }
  });
}
```

---

## 13 張投影片結構

### Slide 1: 封面
- **背景：** `dark_bg` 全滿
- **內容：** 品牌名稱（大字）、分析期間、「Powered by FonTrends × Journey101」
- **備註：** 品牌 Logo 如有則置中上方

### Slide 2: 執行摘要
- **背景：** `light_bg`
- **內容：** 3-5 個 bullet points，概述核心發現
- **語氣：** 結論先行，數字佐證

### Slide 3: 社群總覽 KPI
- **背景：** `light_bg`
- **內容：** 4-6 個 KPI 卡片（聲量、互動、好感度、觸及等）
- **排版：** 2×3 或 2×2 grid，每張卡片含數字 + 趨勢箭頭

### Slide 4: 聲量趨勢
- **背景：** `light_bg`
- **內容：** 折線圖 + 標註高低峰事件
- **必須：** 每個高峰旁標註對應事件名稱

### Slide 5: 語系分布
- **背景：** `light_bg`
- **內容：** 圓餅圖 / 長條圖 + 語系偵測免責聲明
- **免責：** 「語系分類由 AI 自動偵測，可能存在誤判，僅供趨勢參考。」

### Slide 6: 平台分析
- **背景：** `light_bg`
- **內容：** 各平台聲量佔比 + 互動率比較
- **圖表：** 水平長條圖或 treemap

### Slide 7: KOL 影響力
- **背景：** `light_bg`
- **內容：** Top 5-10 KOL 排行表格
- **欄位：** 排名、名稱、平台、互動數、影響力分數

### Slide 8: 好感度分析
- **背景：** `light_bg`
- **內容：** 正/負/中性圓餅圖 + 情緒趨勢折線
- **免責：** 「情緒分析由 AI 自動分類，反諷與複雜語境可能誤判，建議搭配原文確認。」

### Slide 9: 品牌 × 場域關聯
- **背景：** `light_bg`
- **內容：** 品牌在特定場域（如台北101）的聲量表現
- **備註：** 此頁依客戶場域調整，非通用頁

### Slide 10: 外部驗證 & 季節性
- **背景：** `light_bg`
- **內容：** 聲量高峰 vs 真實事件對照表
- **格式：** 時間軸 + 事件標注

### Slide 11: 競品比較（選配）
- **背景：** `light_bg`
- **內容：** 多品牌聲量、互動、好感度比較
- **備註：** 訪談 Q7 為「是」時才製作

### Slide 12: 行動建議
- **背景：** `light_bg` 上半 + `dark_bg` 下半（雙色分割）
- **內容：** 行動建議表格，含 WHO / WHAT / WHEN / KPI
- **排版：** 依優先級分組（🥇立即 / 📈中期 / 💡補位 / ⚠️需驗證）

### Slide 13: 結語 & 下一步
- **背景：** `dark_bg` 全滿
- **內容：** 感謝語 + 聯絡資訊 + 下次報告建議日期
- **語氣：** 正式收尾

---

## 換行注意事項

pptxgenjs 的文字換行需使用 `breakLine` 屬性：

```javascript
// ✅ 正確：使用 breakLine
slide.addText([
  { text: '第一行', options: { breakLine: true } },
  { text: '第二行', options: { breakLine: true } },
  { text: '第三行' }
], { x: 0.5, y: 1, w: 9, h: 3 });

// ❌ 錯誤：用 \n 換行（部分版本不穩定）
slide.addText('第一行\n第二行\n第三行', { x: 0.5, y: 1, w: 9, h: 3 });
```

---

## 色碼格式注意

```javascript
// ✅ 正確：不加 # 前綴
fill: { color: 'BFA06A' }
color: 'FFFFFF'

// ❌ 錯誤：加了 # 前綴
fill: { color: '#BFA06A' }  // pptxgenjs 不認得
color: '#FFFFFF'
```

---

## Opacity 注意

```javascript
// ✅ 正確：0-1 小數
opacity: 0.3

// ❌ 錯誤：百分比整數
opacity: 30  // 不是 30%，會被當成 30 倍
```

---

## QA 工作流程

產出 PPTX 後的檢查流程：

1. **執行 `ppt-qa.sh`** → 轉 PDF → 轉 JPEG
2. **逐頁檢查：**
   - [ ] 文字有沒有被裁切
   - [ ] 色碼是否正確（不是黑底白字就好）
   - [ ] 圖表是否正確渲染
   - [ ] 免責聲明是否存在（語系頁、好感度頁）
   - [ ] 行動建議是否包含 WHO/WHAT/WHEN/KPI
3. **修正後重新產出** → 再次 QA 直到通過

---

## 自訂指南

### 更換品牌色
1. 在 `brand-colors.json` 新增或修改品牌色碼
2. 程式載入時指定品牌 key（如 `louis-vuitton`）
3. 所有投影片自動套用對應色彩

### 調整張數
- 精簡版：保留 Slide 1, 2, 3, 4, 8, 12, 13（共 7 張）
- 完整版：全部 13 張
- 競品版：全部 13 張 + Slide 11 為必做

### 調整語言
- 繁體中文（預設）：fontFace 使用 `Microsoft JhengHei`
- 英文版：fontFace 改用 `Arial` 或 `Calibri`
- 雙語版：標題中文 + 內文英文，需兩種 fontFace
