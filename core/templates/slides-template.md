# Google Slides 模板：googleapis 13 張投影片

> 使用 Google Slides API 產出品牌分析簡報。
> 色碼使用 RGB 0-1 浮點數（與 pptxgenjs 的 hex 不同）。
> 首次執行需要 OAuth 授權。

---

## 依賴

```bash
npm install googleapis
```

---

## OAuth 授權設定

```javascript
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file'
];
const TOKEN_PATH = path.join(process.env.HOME, '.fontrends', 'google-token.json');

// OAuth Client Secret 路徑（desktop app 類型）
// 從 ~/Downloads/ 讀取，不進 repo
const CREDENTIALS_PATH = path.join(
  process.env.HOME,
  'Downloads',
  'client_secret_1095596038837-vckg8l9pheilrjpa3cj0bgkdpooa7pbj.apps.googleusercontent.com.json'
);
```

### 授權流程

```javascript
async function authorize() {
  const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = content.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3000');

  // 檢查快取 token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);

    // 自動 refresh
    oAuth2Client.on('tokens', (tokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      if (tokens.refresh_token) existing.refresh_token = tokens.refresh_token;
      existing.access_token = tokens.access_token;
      existing.expiry_date = tokens.expiry_date;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(existing, null, 2));
    });

    return oAuth2Client;
  }

  // 首次授權：啟動本地 server 接收 callback
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'  // 強制取得 refresh_token
  });

  console.log('請在瀏覽器開啟以下網址進行授權：');
  console.log(authUrl);

  const code = await waitForAuthCode();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  // 儲存 token
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('Token 已儲存至', TOKEN_PATH);

  return oAuth2Client;
}

// 啟動本地 HTTP server 等待 OAuth callback
function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>授權成功！可以關閉此視窗。</h1>');
        server.close();
        resolve(query.code);
      }
    });
    server.listen(3000, () => {
      console.log('等待 OAuth callback（http://localhost:3000）...');
    });
    setTimeout(() => { server.close(); reject(new Error('授權超時')); }, 120000);
  });
}
```

---

## 色彩系統

品牌色從 `brand-colors.json` 載入，需轉換為 Google Slides API 格式。

### 色碼轉換 Helper

```javascript
function hexToRgb(hex) {
  // 'BFA06A' → { red: 0.749, green: 0.627, blue: 0.416 }
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255
  };
}

// 便捷：建立 solidFill 物件
function solidFill(hex) {
  return { solidFill: { color: { rgbColor: hexToRgb(hex) } } };
}

// 便捷：建立文字顏色 foregroundColor
function textColor(hex) {
  return { foregroundColor: { opaqueColor: { rgbColor: hexToRgb(hex) } } };
}
```

### 與 pptxgenjs 的差異

| 項目 | pptxgenjs | Google Slides API |
|------|-----------|------------------|
| 色碼格式 | `'BFA06A'`（無 #） | `{ red: 0.749, green: 0.627, blue: 0.416 }` |
| 單位 | inches（小數） | EMU（1 inch = 914400）或 PT |
| 文字 | `addText()` 一步完成 | `insertText` + `updateTextStyle` 兩步 |
| 換行 | `breakLine: true` | 直接用 `\n` |
| Shadow | 每次 new（mutation bug） | 直接設定，無 bug |
| 表格 | `addTable(rows, opts)` | `createTable` + 逐格 `insertText` |
| 背景 | `background: { fill }` | `updatePageProperties` |

---

## 單位 Helper

```javascript
const EMU_PER_INCH = 914400;
const EMU_PER_PT = 12700;

function inches(n) { return Math.round(n * EMU_PER_INCH); }
function pt(n) { return { magnitude: n, unit: 'PT' }; }
function emu(n) { return { magnitude: n, unit: 'EMU' }; }
```

---

## 簡報尺寸

```javascript
// WIDE 16:9（與 pptxgenjs 相同）
const SLIDE_WIDTH = inches(10);
const SLIDE_HEIGHT = inches(5.625);
```

---

## 建立流程

```javascript
async function generateSlides(auth, data, colors, options) {
  const slides = google.slides({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });

  // 1. 建立簡報
  const presentation = await slides.presentations.create({
    requestBody: {
      title: `品牌分析報告 — ${data.brandName}`,
      pageSize: {
        width: emu(SLIDE_WIDTH),
        height: emu(SLIDE_HEIGHT)
      }
    }
  });
  const presentationId = presentation.data.presentationId;
  const defaultSlideId = presentation.data.slides[0].objectId;

  // 2. 建立所有投影片 + 刪除預設空白頁
  const slideIds = [];
  const createRequests = [];

  for (let i = 0; i < 13; i++) {
    const slideId = `slide_${i + 1}`;
    slideIds.push(slideId);
    createRequests.push({
      createSlide: {
        objectId: slideId,
        insertionIndex: i
      }
    });
  }

  // 刪除預設空白頁
  createRequests.push({
    deleteObject: { objectId: defaultSlideId }
  });

  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests: createRequests }
  });

  // 3. 逐頁填入內容
  const contentRequests = [];

  // --- Slide 1: 封面（深色背景）---
  contentRequests.push(...buildCoverSlide(slideIds[0], data, colors));

  // --- Slide 2: 執行摘要 ---
  contentRequests.push(...buildSummarySlide(slideIds[1], data, colors));

  // --- Slide 3: 社群 KPI ---
  contentRequests.push(...buildKpiSlide(slideIds[2], data, colors));

  // --- Slide 4: 聲量趨勢 ---
  contentRequests.push(...buildTrendSlide(slideIds[3], data, colors));

  // --- Slide 5: 語系分布 ---
  contentRequests.push(...buildLanguageSlide(slideIds[4], data, colors));

  // --- Slide 6: 平台分析 ---
  contentRequests.push(...buildPlatformSlide(slideIds[5], data, colors));

  // --- Slide 7: KOL 排行 ---
  contentRequests.push(...buildKolSlide(slideIds[6], data, colors));

  // --- Slide 8: 好感度分析 ---
  contentRequests.push(...buildSentimentSlide(slideIds[7], data, colors));

  // --- Slide 9: 品牌 × 場域 ---
  contentRequests.push(...buildVenueSlide(slideIds[8], data, colors));

  // --- Slide 10: 外部驗證 ---
  contentRequests.push(...buildValidationSlide(slideIds[9], data, colors));

  // --- Slide 11: 競品比較（選配）---
  if (data.competitor) {
    contentRequests.push(...buildCompetitorSlide(slideIds[10], data, colors));
  }

  // --- Slide 12: 行動建議 ---
  contentRequests.push(...buildActionSlide(slideIds[11], data, colors));

  // --- Slide 13: 結語（深色背景）---
  contentRequests.push(...buildClosingSlide(slideIds[12], data, colors));

  // 批次寫入
  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests: contentRequests }
  });

  // 4. 如果不需要競品頁，刪除 slide_11
  if (!data.competitor) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [{ deleteObject: { objectId: slideIds[10] } }]
      }
    });
  }

  const slideUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  console.log('簡報已建立：', slideUrl);
  return slideUrl;
}
```

---

## Slide Builder Functions

### 通用：設定頁面背景

```javascript
function setBackground(slideId, hexColor) {
  return {
    updatePageProperties: {
      objectId: slideId,
      pageProperties: {
        pageBackgroundFill: solidFill(hexColor)
      },
      fields: 'pageBackgroundFill'
    }
  };
}
```

### 通用：新增文字方塊

```javascript
function addTextBox(slideId, boxId, text, opts) {
  // opts: { x, y, w, h, fontSize, fontFamily, color, bold, alignment }
  const requests = [];

  // 建立文字方塊
  requests.push({
    createShape: {
      objectId: boxId,
      shapeType: 'TEXT_BOX',
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: emu(inches(opts.w)),
          height: emu(inches(opts.h))
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: inches(opts.x),
          translateY: inches(opts.y),
          unit: 'EMU'
        }
      }
    }
  });

  // 插入文字
  requests.push({
    insertText: {
      objectId: boxId,
      text: text,
      insertionIndex: 0
    }
  });

  // 設定文字樣式
  requests.push({
    updateTextStyle: {
      objectId: boxId,
      style: {
        fontFamily: opts.fontFamily || 'Microsoft JhengHei',
        fontSize: pt(opts.fontSize || 14),
        bold: opts.bold || false,
        ...textColor(opts.color || '000000')
      },
      textRange: { type: 'ALL' },
      fields: 'fontFamily,fontSize,bold,foregroundColor'
    }
  });

  // 對齊
  if (opts.alignment) {
    requests.push({
      updateParagraphStyle: {
        objectId: boxId,
        style: { alignment: opts.alignment },
        textRange: { type: 'ALL' },
        fields: 'alignment'
      }
    });
  }

  return requests;
}
```

### 通用：新增裝飾線（Header 底線）

```javascript
function addHeaderLine(slideId, lineId, hexColor) {
  return {
    createShape: {
      objectId: lineId,
      shapeType: 'RECTANGLE',
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: emu(inches(2)),
          height: emu(inches(0.04))
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: inches(0.5),
          translateY: inches(0.95),
          unit: 'EMU'
        }
      }
    }
  };
  // 後續需要 updateShapeProperties 設定 fill
}
```

### 通用：addHeader（對應 pptxgenjs 版）

```javascript
function addHeader(slideId, prefix, text, colors) {
  const titleId = `${prefix}_title`;
  const lineId = `${prefix}_line`;

  const requests = [
    ...addTextBox(slideId, titleId, text, {
      x: 0.5, y: 0.3, w: 9, h: 0.6,
      fontSize: 24, bold: true,
      color: colors.text_on_light
    }),
    addHeaderLine(slideId, lineId, colors.primary),
    {
      updateShapeProperties: {
        objectId: lineId,
        shapeProperties: {
          shapeBackgroundFill: solidFill(colors.primary),
          outline: { outlineFill: solidFill(colors.primary), weight: { magnitude: 0.01, unit: 'PT' } }
        },
        fields: 'shapeBackgroundFill,outline'
      }
    }
  ];

  return requests;
}
```

---

## 13 張投影片內容結構

### Slide 1: 封面

```javascript
function buildCoverSlide(slideId, data, colors) {
  return [
    setBackground(slideId, colors.dark_bg),
    ...addTextBox(slideId, 's1_brand', data.brandName, {
      x: 1, y: 1.5, w: 8, h: 1.2,
      fontSize: 44, bold: true,
      color: colors.primary,
      alignment: 'CENTER'
    }),
    ...addTextBox(slideId, 's1_subtitle', `社群聲量分析報告\n${data.period}`, {
      x: 1, y: 2.8, w: 8, h: 0.8,
      fontSize: 18,
      color: colors.text_on_dark,
      alignment: 'CENTER'
    }),
    ...addTextBox(slideId, 's1_credit', 'Powered by FonTrends × Journey101', {
      x: 1, y: 4.5, w: 8, h: 0.4,
      fontSize: 12,
      color: colors.accent || colors.primary,
      alignment: 'CENTER'
    })
  ];
}
```

### Slide 2: 執行摘要

```javascript
function buildSummarySlide(slideId, data, colors) {
  return [
    setBackground(slideId, colors.light_bg),
    ...addHeader(slideId, 's2', '執行摘要', colors),
    ...addTextBox(slideId, 's2_body', data.summary.join('\n\n'), {
      x: 0.5, y: 1.3, w: 9, h: 3.5,
      fontSize: 16,
      color: colors.text_on_light
    })
  ];
}
```

### Slide 3: 社群 KPI（卡片用 createTable）

```javascript
function buildKpiSlide(slideId, data, colors) {
  const requests = [
    setBackground(slideId, colors.light_bg),
    ...addHeader(slideId, 's3', '社群總覽 KPI', colors)
  ];

  // 用 2×3 table 模擬 KPI 卡片
  const tableId = 's3_kpi_table';
  requests.push({
    createTable: {
      objectId: tableId,
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: emu(inches(9)),
          height: emu(inches(3.2))
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: inches(0.5),
          translateY: inches(1.3),
          unit: 'EMU'
        }
      },
      rows: 2,
      columns: 3
    }
  });

  // 逐格填入 KPI（data.kpis = [{label, value}, ...]）
  data.kpis.forEach((kpi, idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    requests.push({
      insertText: {
        objectId: tableId,
        cellLocation: { rowIndex: row, columnIndex: col },
        text: `${kpi.value}\n${kpi.label}`,
        insertionIndex: 0
      }
    });
  });

  return requests;
}
```

### Slide 4-10: 結構同上模式

> 每頁遵循：`setBackground` → `addHeader` → 內容（`addTextBox` / `createTable`）
> 詳細實作參考 `generate-slides.js`，此模板定義結構和 API 用法。

### Slide 11: 競品比較（選配）

- 只在 `data.competitor` 存在時建立
- 否則該頁在建立後會被刪除

### Slide 12: 行動建議（雙色背景）

```javascript
function buildActionSlide(slideId, data, colors) {
  const requests = [
    setBackground(slideId, colors.light_bg),
    ...addHeader(slideId, 's12', '行動建議', colors)
  ];

  // 用 table 呈現 WHO / WHAT / WHEN / KPI
  const tableId = 's12_action_table';
  const rows = data.actions.length + 1; // +1 for header
  requests.push({
    createTable: {
      objectId: tableId,
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: emu(inches(9)),
          height: emu(inches(3.5))
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: inches(0.5),
          translateY: inches(1.3),
          unit: 'EMU'
        }
      },
      rows: rows,
      columns: 5  // 優先級, WHO, WHAT, WHEN, KPI
    }
  });

  // Header row
  ['優先級', 'WHO', 'WHAT', 'WHEN', 'KPI'].forEach((header, col) => {
    requests.push({
      insertText: {
        objectId: tableId,
        cellLocation: { rowIndex: 0, columnIndex: col },
        text: header,
        insertionIndex: 0
      }
    });
  });

  return requests;
}
```

### Slide 13: 結語

```javascript
function buildClosingSlide(slideId, data, colors) {
  return [
    setBackground(slideId, colors.dark_bg),
    ...addTextBox(slideId, 's13_thanks', '感謝閱讀', {
      x: 1, y: 1.5, w: 8, h: 1,
      fontSize: 36, bold: true,
      color: colors.primary,
      alignment: 'CENTER'
    }),
    ...addTextBox(slideId, 's13_contact', data.contactInfo || '如有問題請聯繫分析團隊', {
      x: 1, y: 2.8, w: 8, h: 0.6,
      fontSize: 16,
      color: colors.text_on_dark,
      alignment: 'CENTER'
    }),
    ...addTextBox(slideId, 's13_next', `建議下次報告日期：${data.nextReportDate || '待定'}`, {
      x: 1, y: 3.8, w: 8, h: 0.4,
      fontSize: 14,
      color: colors.accent || colors.primary,
      alignment: 'CENTER'
    })
  ];
}
```

---

## QA 工作流程

Google Slides 版的 QA 與 pptxgenjs 不同：

1. **開啟簡報連結** → 在瀏覽器中檢視
2. **逐頁檢查：**
   - [ ] 文字沒有被裁切或溢出
   - [ ] 品牌色正確套用
   - [ ] 表格欄位對齊
   - [ ] 免責聲明存在（語系頁、好感度頁）
   - [ ] 行動建議包含 WHO/WHAT/WHEN/KPI
3. **線上直接修正** → Google Slides 可即時編輯
4. **如需程式修正** → 修改 batchUpdate requests 後重新產出

---

## 注意事項

### batchUpdate 順序很重要
- `insertText` 的 `insertionIndex` 會受前面插入的文字影響
- 建議每個文字方塊用獨立 objectId，避免 index 計算錯誤

### 字型
- Google Slides 支援 `Noto Sans TC`（繁體中文，Google 原生）
- 如用 `Microsoft JhengHei` 需確認用戶系統有安裝
- **建議優先用 `Noto Sans TC`**，相容性最好

### Rate Limits
- Google Slides API：每分鐘 60 次 read / 60 次 write
- batchUpdate 算一次 write，所以盡量把所有 requests 打包在一次 batchUpdate
- 13 張投影片通常 2-3 次 batchUpdate 足夠

### Token 過期
- access_token 有效期 1 小時
- 有 refresh_token 會自動續期
- 如 refresh_token 也過期（6 個月未使用），需重新授權

---

## ⚠️ Google Slides 踩坑紀錄（2025-03-19 實戰）

### 1. outline weight 不能為 0
```
❌ outline: { weight: { magnitude: 0, unit: 'PT' } }   → badRequest
✅ outline: { weight: { magnitude: 0.01, unit: 'PT' } } → OK
```
Google Slides API 不接受 outline weight <= 0，pptxgenjs 則無此限制。

### 2. 表格行數限制（最重要）
Google Slides 表格 **不會壓縮 row 高度**，每行至少約 0.35 inch。

| 情境 | 建議最大行數（含 header） |
|------|------------------------|
| 標準投影片（5.625 inch） | 8 行 |
| 有 header + note 文字 | 6 行 |
| cell 內有換行 `\n` | 4-5 行 |

**超過就會溢出投影片底部。**

### 3. Cell 內換行
```
❌ 'Q4聖誕跨年聯名快閃\n結合101跨年' → row 高度翻倍，整體跑版
✅ 'Q4聖誕跨年聯名快閃'              → 單行，高度正常
```
pptxgenjs 的 `breakLine` 不會撐高 row，但 Google Slides 會。

### 4. Emoji 在表格中
```
❌ '🔥 聖誕 + 大使官宣'   → emoji 佔位異常，欄寬被撐開
✅ '聖誕 + 品牌大使官宣'  → 純文字，排版穩定
```
Emoji 在 note 文字或獨立 textbox 中 OK，但在表格 cell 中會造成欄寬異常。

### 5. Note 文字 y 座標公式
```javascript
// 動態計算 note 位置，避免與表格重疊
const noteY = tableY + (rowCount * 0.35) + 0.3;
```
不要寫死座標，表格行數變動時 note 就會重疊。

### 6. OAuth 首次授權
```javascript
// 用 open 指令幫使用者開瀏覽器
require('child_process').execSync(`open "${authUrl}"`);
```
僅印出 URL 使用者可能不會注意到，直接 `open` 更可靠。

### 7. pptxgenjs vs Google Slides 表格對照

| 行為 | pptxgenjs | Google Slides |
|------|-----------|---------------|
| Row 高度 | 自動壓縮到 table 指定高度 | 自動撐高，不壓縮 |
| \n 換行 | `breakLine: true`，row 不撐高 | 直接 `\n`，row 會翻倍 |
| Emoji | 正常渲染 | 表格中佔位異常 |
| outline=0 | OK | ❌ badRequest |
| 最大安全行數 | 12-15 行 | 6-8 行 |
