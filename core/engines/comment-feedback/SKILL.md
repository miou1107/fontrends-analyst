---
name: Comment Feedback
description: |
  讀取 Google Slides/Docs 上的未解決留言，AI 分類意圖後原地修改文件、
  回覆+解決留言、歸納學習點寫入 skill 知識庫。
  當使用者說「處理留言」「跑 comment feedback」「讀留言改文件」時觸發。
---

# Comment Feedback Engine

## Overview

使用者提供 Google Slides/Docs URL，系統自動：
1. 從 URL 擷取 fileId + fileType
2. Drive Comments API 讀取未解決留言
3. AI 分類意圖（style / content / structure / delete / question）
4. 生成 batchUpdate requests 並執行修改
5. 回覆每則留言 + resolve
6. 歸納學習點 → 使用者確認 → 寫入 skill

## File Structure

```
engines/comment-feedback/
├── index.js                # Main orchestrator
├── url-parser.js           # Extract fileId + fileType from Google URL
├── comment-reader.js       # Drive Comments API
├── intent-classifier.js    # AI intent classification
├── modifiers/
│   ├── slides-modifier.js  # Slides batchUpdate
│   └── docs-modifier.js    # Docs batchUpdate
├── comment-responder.js    # Reply + resolve
├── safety.js               # Dry-run, snapshot, retry
└── learning-capture.js     # Write corrections.jsonl + formats/*.md
```

## Processing Order

同一文件多則 comment 依序處理：
1. **delete** — 先刪，避免後續修改白做
2. **structure** — 調結構
3. **content** — 改內容
4. **style** — 調樣式
5. **question** — 回覆問題（不修改）

## Docs API Pitfalls

### Index Management（重要）

- **多個修改從後往前執行**（descending index order），避免 index 偏移
- 不能在 table 的 startIndex 插入內容，必須用前一個 paragraph 的 endIndex - 1
- Hyperlink 更新不會改變 index，可以在獨立 batch 中處理（不需要跟 insertion 混在一起）

### Batch Operations

- insertions 必須從 bottom to top（descending index）處理，否則先插入的內容會把後面的 index 全部往後推
- hyperlink updateTextStyle 不影響 index，可以在 insertion batch 之後用獨立 batch 處理
- 一個 batchUpdate call 內的 requests 按照 array 順序執行

---

## Screenshot Pipeline（Browser → Google Docs 截圖插入）

### Architecture

```
Puppeteer headless browser
  → screenshot saved to /tmp/*.png
    → Google Drive API upload (get fileId)
      → Google Docs API insertInlineImage (use Drive URL)
```

### Why Not Chrome MCP upload_image?

Chrome MCP 的 `upload_image` 工具會失敗於跨 tab 截圖場景：
- screenshot ID 在跨 tab 傳遞時會過期（ID expiration）
- 無法可靠地從一個 tab 截圖後在另一個 tab 上傳
- **正確做法**：用 Puppeteer headless 截圖存到 /tmp，再用 Drive API 上傳

### Platform-Specific Settings

| Platform | URL Format | Login | Viewport | Notes |
|----------|-----------|-------|----------|-------|
| Instagram | `/p/{POST_ID}/embed/` | 不需要 | 540x750 | 用 `/p/` 不是 `/reels/`，embed 路徑免登入 |
| Twitter/X | 原始推文 URL | 不需要 | 800x900 | 直接截圖，不需登入 |
| Looker Studio | 公開分享連結 | 不需要 | 依報表大小 | 需等待 **8 秒以上**讓圖表完全渲染 |

### IG Embed 注意事項

- 正確：`https://www.instagram.com/p/{ID}/embed/`
- 錯誤：`https://www.instagram.com/reels/{ID}/embed/`（reels 路徑不支援 embed）
- embed 頁面不需要登入，可在 headless browser 直接載入

### Puppeteer Screenshot Flow

```javascript
// 1. Launch headless browser
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();

// 2. Set viewport per platform
await page.setViewport({ width: 540, height: 750 }); // IG example

// 3. Navigate and wait
await page.goto(url, { waitUntil: 'networkidle2' });
// Looker Studio 需要額外等待
await page.waitForTimeout(8000); // Looker Studio: 8+ seconds

// 4. Save screenshot
const screenshotPath = `/tmp/screenshot-${Date.now()}.png`;
await page.screenshot({ path: screenshotPath, fullPage: true });
await browser.close();
```

### Drive API Upload

```javascript
// Upload screenshot to Drive (get fileId for Docs insertion)
const drive = google.drive({ version: 'v3', auth });
const res = await drive.files.create({
  requestBody: { name: 'screenshot.png', mimeType: 'image/png' },
  media: { mimeType: 'image/png', body: fs.createReadStream(screenshotPath) },
  fields: 'id',
});
const imageFileId = res.data.id;

// Make it publicly readable (required for Docs insertInlineImage)
await drive.permissions.create({
  fileId: imageFileId,
  requestBody: { role: 'reader', type: 'anyone' },
});
```

### Docs API insertInlineImage

```javascript
// IMPORTANT: 不能在 table startIndex 插入，要用前一個 paragraph 的 endIndex - 1
const insertIndex = previousParagraphEndIndex - 1;

const requests = [
  {
    insertInlineImage: {
      uri: `https://drive.google.com/uc?id=${imageFileId}`,
      location: { index: insertIndex },
      objectSize: {
        width: { magnitude: 300, unit: 'PT' },
        height: { magnitude: 200, unit: 'PT' },
      },
    },
  },
];

// Batch operations: process from bottom to top (descending index)
requests.sort((a, b) => {
  const idxA = a.insertInlineImage?.location?.index ?? 0;
  const idxB = b.insertInlineImage?.location?.index ?? 0;
  return idxB - idxA;
});

await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
```

### Batch Insertion Rules（重要）

1. **從底部往頂部處理**（descending index）— 先處理文件尾端的插入，再處理前面的，這樣前面的插入不會影響後面的 index
2. **Hyperlink 更新不移動 index** — updateTextStyle 設定 link 不會改變文件結構，可以在 insertion 完成後用獨立 batch 處理
3. **不要在 table startIndex 插入** — table element 的 startIndex 是 table 本身，插入會失敗；改用 table 前一個 paragraph 的 endIndex - 1

---

## Safety Mechanisms

- **Dry-run mode**: > 5 個 request 時先列清單讓使用者確認
- **Snapshot**: 修改前用 Drive Revisions API 建立版本，可回滾
- **Retry**: batchUpdate 失敗時重讀最新版本 + 重新生成 requests，最多重試 2 次

## Learning Capture

處理完所有 comment 後：
1. AI 歸納可泛化規則
2. 使用者逐條 approve/reject
3. 寫入 `learned/corrections.jsonl`（v2 schema）+ `learned/formats/*.md`

## Error Handling

| Error | Handling |
|-------|---------|
| 401 | Auto refresh token |
| 403 | 回覆無權限，不 resolve |
| 404 | 通知 fileId 錯誤 |
| 429 | Exponential backoff, max 3 retries |
| 409 Conflict | 重讀 + 重新生成 requests |
