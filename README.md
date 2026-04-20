# FonTrends Analyst

AI-powered brand analysis skill for Looker Studio → PowerPoint report generation.

## Requirements

- Claude Max subscription with Claude in Chrome
- GitHub Personal Access Token (provided after purchase)

## Installation

1. Clone this repo:
   ```
   git clone https://github.com/miou1107/fontrends-analyst.git
   ```

2. Run setup:
   ```
   bash fontrends-analyst/setup.sh
   ```

3. Copy the skill to your Claude skills directory:
   ```
   cp -r fontrends-analyst/adapters/claude-code/ ~/.claude/skills/brand-analysis-looker-studio/
   ```

4. Restart Claude Code / Claude in Chrome

## Usage

In Claude in Chrome, say:
- 「幫我分析 LV 品牌」
- 「分析這個 Looker Studio：[URL]」
- 「做一份品牌報告」

The skill will guide you through the full analysis workflow.

## Updates

Core knowledge base updates automatically every time the skill runs.

## Architecture（SoC 六層 — 規劃中）

2026-04-20 開始依 Separation of Concerns 重構：code 只做 pipeline / 框架，所有會變動的知識參數化。詳見 [openspec/specs/knowledge-layer/spec.md](openspec/specs/knowledge-layer/spec.md) 與 [實作 plan](openspec/plans/2026-04-20-knowledge-layer-extraction.md)。

- **L4 Presentation** — 報告 / UI
- **L3 Engines**（工程師）— 純演算法，不碰業務詞彙
- **L2.5 Run Context** — 每次 run 的外部素材（`runs/<id>/context/`）
- **L2 Knowledge**（User）— `core/knowledge/{stances,modules,profiles}/*.yaml`
- **L1 Learned**（系統自動）— `core/learned/learned-rules.json`
- **L0 Run Inputs** — 被分析的主體數據

每次執行 = 一個完整版本（`runs/<id>/{inputs,context,temp,outputs,logs}/`），支援 rerun / lineage / is_final / archive。
Skill itself updates via `git pull` in this repo.

## Self-Learning（2026-04-08 升級）

系統會在每份報告完成後自動沉澱學習紀錄，並透過以下三個機制持續升級核心能力：

- **紀錄時效性（TTL 90 天）**：corrections / insights 皆帶 `ttl_days` / `scope` / `superseded_by`。過期自動封存到 `core/learned/archived/`，衝突結論自動指向最新版本，避免 learned/ 無限膨脹。
- **規則命中追蹤（rule-hits.jsonl）**：每次 run 由 orchestrator 產生 pre-run checklist，report-audit 在稽核時比對本次報告是否避開歷史已知坑，結果寫入 `core/learned/rule-hits.jsonl`。可量化「學過的東西有沒有真的避開」與偵測 regression。
- **週一 Digest PR**：`skill-suggestions` 不再一條一 PR，改為每週一 09:00 自動彙整上週累積，單 PR ≤5 條，body 強制含 rule-hits 證據與修改前後 diff。升級門檻寫死為 `confidence=high` + 跨品牌，單一品牌經驗留在 corrections。

詳見：
- `openspec/plans/2026-04-08-self-learning-gap-fixes.md`
- `openspec/specs/self-learning/spec.md`（v3）
- `openspec/specs/orchestrator/spec.md`（v2 — Pre-Run Checklist）
- `openspec/specs/report-audit/spec.md`（v2 — 規則命中追蹤）
