# core/knowledge/ — 參數化知識層

> 所有會因「報表類型 / 分析目的 / 對象」而變動的參數、詞彙、文案都放這裡。
> Engine 不讀這裡的檔案，透過 knowledge-loader 取得 snapshot。
> 詳見 [knowledge-layer spec](../../openspec/specs/knowledge-layer/spec.md)。

## 目錄

```
_defaults.yaml          # 保底預設值（對齊現有 code 值）
stance-map.yaml         # 描述符 → module 的查表規則

stances/                # 抽象意圖描述
├── audiences/          # 對象：ceo, analyst, marketing-lead, agency-client
├── purposes/           # 目的：decision-support, diagnosis, monitoring, pitch
└── focuses/            # 著重面向：competitive, brand-health, performance

modules/                # 知識原子（可替換、可組合）
├── thresholds/         # 數字門檻 / 權重 / 上限（6 命名空間）
│   ├── _statistical-constants.yaml  # 🔒 鎖定：統計慣例值（IQR 1.5、Pearson min 5…）不得修改
│   ├── standard.yaml                # 基準值（對齊現有 code）
│   ├── growth-sensitive.yaml        # 變體：成長敏感（門檻低）
│   └── growth-conservative.yaml     # 變體：保守（門檻高）
├── keywords/           # 關鍵字陣列（intent / domain / CJK patterns）
├── copy/               # 文案模板（支援 ${var} 插值）
├── time-windows/       # QoQ / YoY / quarter mapping
├── dimensions/
│   ├── canonical.yaml  # 📌 單一真實來源：8 個標準維度名稱與 slug
│   ├── social-14d.yaml # 引用 canonical，定義選用哪些 + 權重
│   └── competitive-7d.yaml
└── density/            # 報告密度：sparse / standard / deep

profiles/               # 報表類型配方（組合上述模組）
schema/                 # JSON Schema 驗證
```

## 編輯規則

1. **`_statistical-constants.yaml` 鎖定** — 是數學公式，改了結果會算錯。除非你知道在做什麼。
2. **`dimensions/canonical.yaml` 是單一來源** — 其他地方引用它的 id，不要各寫各的
3. **檔案只能是 yaml / json** — `.js` 不得出現在本目錄
4. **改完存檔 → loader 啟動會驗證** — schema 違反會 throw，不會靜默跑
