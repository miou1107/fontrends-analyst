# Skill Loader — 雲端知識庫更新機制

## Purpose

提供 Skill 啟動時自動從 GitHub Private Repo 拉取最新知識庫的機制，確保用戶無需手動更新即可獲得最新分析框架、操作 SOP、報告模板。

---

## Requirements

### Requirement: Token 授權管理

用戶必須持有有效的 GitHub Personal Access Token 才能存取 Private Core Repo。

#### Scenario: 首次使用，尚未設定 Token
- **GIVEN** 用戶已安裝 Skill，但 `~/.fontrends/token` 不存在
- **WHEN** 用戶啟動 Skill
- **THEN** 系統提示用戶執行 setup 流程，顯示 token 設定指令
- **AND** 不進入分析流程，直到 token 設定完成

#### Scenario: Token 已設定且有效
- **GIVEN** `~/.fontrends/token` 存在且內容為有效的 GitHub token
- **WHEN** 用戶啟動 Skill
- **THEN** 系統使用該 token 存取 Private Core Repo
- **AND** 繼續進入知識庫更新流程

#### Scenario: Token 已過期或被撤銷
- **GIVEN** `~/.fontrends/token` 存在但 token 已失效
- **WHEN** 系統嘗試 git clone/pull
- **THEN** 系統顯示「授權失敗，請聯繫管理者更新 token」
- **AND** 如果本地有快取版本，使用快取繼續（降級模式）
- **AND** 如果無快取，終止並提示用戶

---

### Requirement: 知識庫自動拉取

每次 Skill 啟動時 MUST 拉取最新的 Core Repo 內容。

#### Scenario: 首次拉取（無本地快取）
- **GIVEN** `/tmp/fontrends-core/` 目錄不存在
- **WHEN** Skill 啟動並通過 token 驗證
- **THEN** 系統執行 `git clone` 將 Core Repo 下載到 `/tmp/fontrends-core/`
- **AND** 讀取 `version.json` 確認版本號

#### Scenario: 已有本地快取，拉取更新
- **GIVEN** `/tmp/fontrends-core/.git` 目錄存在
- **WHEN** Skill 啟動
- **THEN** 系統執行 `git pull --quiet` 更新到最新版
- **AND** 讀取更新後的 `version.json`

#### Scenario: 網路不可用
- **GIVEN** 用戶處於離線狀態或 GitHub 不可達
- **WHEN** 系統嘗試 git clone/pull
- **THEN** 如果本地有快取，使用快取版本繼續（顯示警告：「使用離線快取，可能非最新版」）
- **AND** 如果無快取，終止並提示用戶檢查網路

---

### Requirement: Skill 本體版本檢查

Skill Loader（Public Repo）本身 SHOULD 定期檢查是否有新版。

#### Scenario: Skill 本體有新版
- **GIVEN** 本地 Skill 的 `version.json` 版本為 `1.0.0`
- **WHEN** 系統讀取遠端 Public Repo 的 `version.json` 版本為 `1.1.0`
- **THEN** 系統提示用戶：「Skill 有新版本 1.1.0 可用，建議更新」
- **AND** 顯示更新指令
- **AND** 不強制更新，繼續使用當前版本

#### Scenario: Skill 本體已是最新
- **GIVEN** 本地版本與遠端版本一致
- **WHEN** 系統檢查版本
- **THEN** 靜默通過，不顯示任何訊息

#### Scenario: Core 版本不相容
- **GIVEN** 本地 Skill 的 `min_core_version` 為 `2.0.0`
- **WHEN** Core Repo 的版本為 `1.5.0`
- **THEN** 系統警告：「知識庫版本過舊，部分功能可能異常」
- **AND** 建議管理者更新 Core Repo

---

### Requirement: 知識庫內容載入

Skill MUST 將 Core Repo 的框架檔案載入為當前分析的執行依據。

#### Scenario: 成功載入所有框架檔案
- **GIVEN** Core Repo 已成功 clone/pull
- **WHEN** 系統讀取 Core Repo 內容
- **THEN** 依序載入以下檔案：
  - `frameworks/interview-guide.md`
  - `frameworks/analysis-framework.md`
  - `frameworks/action-matrix.md`
  - `operations/looker-operations.md`
  - `operations/data-extraction.md`
  - `templates/ppt-template.md`
  - `templates/brand-colors.json`
- **AND** 將這些內容作為後續分析流程的指引

#### Scenario: 部分檔案缺失
- **GIVEN** Core Repo 中某些檔案被刪除或改名
- **WHEN** 系統嘗試讀取
- **THEN** 對缺失檔案記錄警告
- **AND** 使用 Skill 本體內建的 fallback 基礎版繼續執行
