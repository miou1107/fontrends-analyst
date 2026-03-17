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
Skill itself updates via `git pull` in this repo.
