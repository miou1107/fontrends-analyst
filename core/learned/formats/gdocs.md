# Google Docs 格式規則

> 由 Comment Feedback 機制自動維護，記錄使用者偏好與修正規則。

## Index Management

- 多個修改必須從後往前執行（descending index order），避免 index 偏移
- 不能在 table 的 startIndex 插入內容（會失敗），必須用前一個 paragraph 的 endIndex - 1
- Hyperlink updateTextStyle 不會改變 index，可以在獨立 batch 中處理

## Batch Operations

- insertions 從 bottom to top（descending index）處理
- hyperlink 更新與 insertion 分開 batch 執行（hyperlink 不影響 index）
- 一個 batchUpdate call 內的 requests 按 array 順序執行

## Screenshot 插入 Pipeline

- Chrome MCP upload_image 不可靠（跨 tab screenshot ID 會過期）
- 正確流程：Puppeteer headless → /tmp 存檔 → Drive API upload → Docs API insertInlineImage
- insertInlineImage 的 location.index 不能是 table startIndex，用前一個 paragraph endIndex - 1
- Drive 上傳後需設定 permissions（reader/anyone）才能在 Docs 中顯示

## 平台截圖設定

| Platform | URL | Login | Viewport |
|----------|-----|-------|----------|
| Instagram | `/p/{ID}/embed/`（非 `/reels/`） | 免登入 | 540x750 |
| Twitter/X | 原始推文 URL | 免登入 | 800x900 |
| Looker Studio | 公開分享連結 | 免登入 | 依報表 |

- Looker Studio 需等待 8 秒以上讓圖表完全渲染
- IG 用 `/p/` embed 路徑，`/reels/` 不支援 embed

## 圖片與表格格式規範

### 圖片
- 每張圖片下方必須加圖說：`圖 N  描述文字`
- 圖說格式：置中、斜體、9pt
- 圖片段落：置中對齊
- 社群截圖應使用完整 embed/瀏覽器畫面（含帳號、內容、互動數），不要只放 og:image

### 表格
- 每個表格上方必須加標題：`表 N  描述文字`
- 格式：置中、粗體、10pt

### 超連結
- 所有 URL 必須設為可點擊超連結（`updateTextStyle` with `link.url`）

### 段落美化
- 子章節標題用 `【】` 包裹時，設為 HEADING_3
- 編號清單中的名稱項目加粗
- URL 行字型縮小（9pt）
