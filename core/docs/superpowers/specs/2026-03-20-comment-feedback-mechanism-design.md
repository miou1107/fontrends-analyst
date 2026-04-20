# Comment Feedback Mechanism (S5.1) Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Scope:** Google Slides + Google Docs comment-driven in-place modification with learning capture

---

## 1. Overview

使用者在 Google Slides / Google Docs 上留言評論後，系統自動讀取未解決留言、分類意圖、透過 API 原地修改文件、回覆留言並標記已解決，最後歸納學習點寫入 skill 知識庫。

### Trigger Flow

```
使用者提供文件 URL
  → 從 URL 擷取 fileId + 判斷 fileType (slides/docs)
  → Drive Comments API 讀取未解決留言
  → 逐則 AI 分類意圖
  → 生成 batchUpdate requests
  → 執行修改
  → 回覆每則留言 + resolve
  → 歸納學習點 → 使用者確認 → 寫入 skill
```

### OAuth Scope

現有 scope 需新增 `https://www.googleapis.com/auth/drive`（需完整 scope，因為要讀寫 comments + 修改非本 app 建立的文件）。

### File Paths

- **corrections.jsonl**: `learned/corrections.jsonl`（既有檔案，新增 `schemaVersion: 2` 欄位區分新舊 schema，舊格式 `{date,type,lesson,severity}` 保留不遷移，讀取時依 schemaVersion 判斷）
- **formats/**: `learned/formats/gslides.md`, `learned/formats/gdocs.md`（新建目錄，首次寫入時 bootstrap 空結構）

---

## 2. Comment Reading & Parsing

### API Call

```
GET https://www.googleapis.com/drive/v3/files/{fileId}/comments
  ?fields=comments(id,content,anchor,resolved,replies,author,createdTime,modifiedTime)
  &includeDeleted=false
```

只處理 `resolved === false` 的留言。

### Anchor Format

| File Type | Anchor Structure | Locating Strategy |
|-----------|-----------------|-------------------|
| Google Slides | `{"r":"page_objectId","a":{"aid":"...","lo":{"ps":{"o":{"i":"elementId"}}}}}` | 用 `elementId` 定位到具體 shape/table |
| Google Docs | `{"r":"head","a":{"aid":"...","lo":{"n":{"s":{"bgc":...},"si":startIndex,"ei":endIndex}}}}` | 用 `startIndex/endIndex` 定位到文字範圍 |

### Parsed Comment Structure

```json
{
  "id": "comment_123",
  "content": "這個標題字太小了",
  "anchor": { ... },
  "targetType": "slide_element | doc_range",
  "targetID": "elementId | {start, end}",
  "pageIndex": 3
}
```

### AI Intent Classification

每則 comment 經 LLM 判斷意圖：

```json
{
  "intent": "style | content | structure | delete | question",
  "action": "具體要做什麼",
  "confidence": 0.95,
  "targetDescription": "第3頁的標題文字"
}
```

分類 prompt 附帶目標元素的 context（從 Slides/Docs API 讀取），讓 AI 精準理解留言指涉。

- `question` intent：留言是疑問而非修改指令，系統回覆回答但不修改文件，不 resolve（等使用者確認後手動 resolve）。

### Anchor Parsing

Drive Comments API 的 anchor 欄位為 opaque string（可能是 JSON 或 base64 編碼）。解析策略：
1. 嘗試 `JSON.parse(anchor)` — 大多數情況可直接解析
2. 若失敗，嘗試 `JSON.parse(Buffer.from(anchor, 'base64').toString())` — base64 encoded 情況
3. 若仍失敗 → 視為「無 anchor」，走全域建議路徑

### Slides pageIndex Resolution

從 anchor 取得 `objectId` 後，需用 `presentations.get` 讀取完整 presentation，建立 `objectId → pageIndex` mapping。此 mapping 在首次讀取時快取，後續 comment 共用。

### LLM Classification Context

分類 prompt 的 input 包含：
- comment.content（使用者留言文字）
- 目標元素的完整 JSON（Slides: shape/table object; Docs: 前後 200 字的文字 context）
- 該頁/段落的整體結構摘要（元素列表 + 類型）

多則 comment 可 batch 送入同一 prompt 分類（最多 10 則/batch），減少 LLM 呼叫次數。

---

## 3. Modification Execution

### Google Slides

| Intent | API Actions |
|--------|------------|
| style | `updateTextStyle`, `updateShapeProperties`, `updateTableCellProperties` |
| content | `deleteText` + `insertText`, `replaceAllText` |
| structure | `createSlide` / `deleteObject` / `updateSlidesPosition`, `duplicateObject` |
| delete | `deleteObject` |
| question | 無 API action（僅回覆） |

Flow:
1. `presentations.get` 讀取目標頁面完整結構
2. AI 根據 comment + 頁面結構生成 batchUpdate requests
3. `presentations.batchUpdate` 送出修改
4. 修改後重新讀取該頁驗證

### Google Docs

| Intent | API Actions |
|--------|------------|
| style | `updateTextStyle`, `updateParagraphStyle` |
| content | `deleteContentRange` + `insertText`, `insertInlineImage` |
| structure | `insertSectionBreak`, `insertTable`, `insertPageBreak`, heading level 調整 |
| delete | `deleteContentRange` |
| question | 無 API action（僅回覆） |

Flow:
1. `documents.get` 讀取文件結構
2. AI 根據 `startIndex/endIndex` 定位修改區域
3. **多個修改從後往前執行**（descending index order），避免 index 偏移
4. `documents.batchUpdate` 送出

### Safety Mechanisms

- **Dry-run mode**: 大規模修改（>5 個 request）先列清單讓使用者確認
- **Snapshot**: 修改前用 Drive Revisions API 建立版本，可回滾
- **Single-page isolation**: Slides 修改限定在 comment 所在頁面

---

## 4. Reply & Resolve

### Reply Format

修改成功：
```
✅ 已調整：{一句話總結}

修改項目：
- {change_1}
- {change_2}
```

無法處理：
```
❌ 無法自動處理：{原因}
建議：{替代方案或手動操作指引}
```

規則：
- 字數 ≤ 100 字
- 無法處理的 comment **不 resolve**，留給使用者

### Reply API

```
POST /drive/v3/files/{fileId}/comments/{commentId}/replies
{ "content": "✅ 已調整：..." }
```

### Resolve API

```
PATCH /drive/v3/files/{fileId}/comments/{commentId}
{ "resolved": true }
```

注意：resolve 是對 comment 本身做 PATCH（`comments.update`），不是透過 replies endpoint。

### Processing Order

同一文件多則 comment，按照以下順序：
1. **delete** — 先刪，避免後續修改白做
2. **structure** — 調結構
3. **content** — 改內容
4. **style** — 調樣式
5. **question** — 最後回覆問題（不涉及修改，順序無影響）

每處理完一則立即 reply + resolve，不等全部完成。

### Delete Cascade

當 delete intent 移除了某個元素/頁面後，後續 comment 若指向已刪除的目標：
- 自動偵測 targetID 已不存在
- 回覆：「✅ 該元素已被其他留言刪除，此留言無需處理」
- 自動 resolve

### Concurrent Edit Conflict

- 衝突偵測：batchUpdate 回傳 HTTP 409 或版本不一致錯誤
- 處理：重新 `get` 最新版本 → 重新生成 requests → 再次 batchUpdate
- 最多重試 2 次，仍失敗則回覆說明並跳過

---

## 5. Learning Capture

### Trigger

所有 comment 處理完畢後自動進入學習階段。

### Step 1 — Summarize Learnings

AI 掃描本次所有 comment + 修改，歸納可泛化規則。每個學習點標註：
- **類型**: style / content / structure / layout
- **適用範圍**: gslides / gdocs / both
- **來源 comment ID**: 可追溯

### Step 2 — User Confirmation

列出學習點，使用者逐條 approve / reject / 修改。只有 approved 的才寫入。

### Step 3 — Dual-Track Write

**corrections.jsonl** (append, 完整歷史):
```json
{
  "timestamp": "2026-03-20T14:30:00+08:00",
  "fileId": "abc123",
  "fileType": "gslides",
  "commentId": "comment_456",
  "original": "header 用淺灰底黑字",
  "correction": "header 改深色底白字",
  "rule": "表格 header 應用深色背景 + 白字",
  "category": "style",
  "approved": true,
  "schemaVersion": 2
}
```

`schemaVersion: 2` 用以區分新 schema（comment feedback）與舊 schema（`{date,type,lesson,severity}`，無版本號視為 v1）。讀取時依此欄位判斷。

**formats/*.md** (upsert, 活知識庫):

寫入邏輯：
- 已有相關 section → 更新該段落
- 沒有 → append 新 section
- 新舊規則衝突 → 新規則覆蓋（使用者最新偏好優先）

### Cumulative Effect

下次產出文件時，renderer 讀取 `formats/gslides.md` 和 `formats/gdocs.md` 套用已學會的規則。

---

## 6. Error Handling & Edge Cases

### API Errors

| Error | Handling |
|-------|---------|
| 401 Unauthorized | Auto refresh token; 失敗提示重新授權 |
| 403 Forbidden | 回覆 comment 說明無權限，不 resolve |
| 404 Not Found | 告知使用者 fileId 錯誤或文件已刪，終止 |
| 429 Rate Limit | Exponential backoff (1s→2s→4s), max 3 retries |
| 500 Server Error | Retry 2x, 仍失敗跳過該 comment 並回覆說明 |

### Edge Cases

| Scenario | Handling |
|----------|---------|
| 無未解決留言 | 回報「沒有新留言需要處理」，結束 |
| 留言沒有 anchor | 當全域建議，AI 判斷位置；confidence < 0.7 不自動處理 |
| 同一元素多則留言 | 合併理解，一次修改，分別回覆。若留言互相矛盾（例如一個要放大、一個要縮小），以最新留言為準（`createdTime` 較晚者），另一則回覆說明被覆蓋 |
| 留言是問句不是指令 | 分類為 `question`，回覆但不修改，不 resolve |
| 留言語言非中文 | 回覆語言跟隨留言語言 |
| Docs index 偏移 | 從後往前執行修改 |
| Slides objectId | 用 objectId 定位，不受影響 |
| 文件同時被編輯 | 修改前讀最新版本，conflict 則重讀 + 重新生成 |

### Partial Failure

成功的 comment 正常 reply + resolve，失敗的回覆原因但不 resolve。最後彙總：「✅ 8/10 則已處理，❌ 2 則需手動處理」。

---

## 7. Screenshot Pipeline (Browser → Google Docs)

### GIVEN 留言要求插入社群平台截圖或報表截圖
### WHEN 系統執行 insertInlineImage
### THEN 使用 Puppeteer headless → Drive upload → Docs API 流程

### Architecture

Chrome MCP `upload_image` 不適用（跨 tab screenshot ID 會過期），改用：

```
Puppeteer headless → /tmp/*.png → Drive API upload → Docs API insertInlineImage
```

### Platform Settings

| Platform | URL Format | Login | Viewport | Wait |
|----------|-----------|-------|----------|------|
| Instagram | `/p/{ID}/embed/` | 免登入 | 540x750 | networkidle2 |
| Twitter/X | 原始推文 URL | 免登入 | 800x900 | networkidle2 |
| Looker Studio | 公開分享連結 | 免登入 | 依報表 | 8+ 秒 |

### Docs API Insertion Rules

1. **不能在 table startIndex 插入** — 用前一個 paragraph 的 endIndex - 1
2. **Batch insertions 從底部往頂部**（descending index）— 避免 index 偏移
3. **Hyperlink 更新不移動 index** — 可在 insertion batch 完成後用獨立 batch 處理
