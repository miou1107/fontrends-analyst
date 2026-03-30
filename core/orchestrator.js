'use strict';

const fs = require('fs');
const path = require('path');
const { STAGES, STAGE_ORDER } = require('./stages');

/**
 * 調度核心(Pipeline Orchestrator) — 不綁死任何 AI 或 UI 框架
 *
 * 負責：
 *   1. 管理 pipeline 流程（§1→§12）
 *   2. 追蹤每個階段的狀態（run-status.json）
 *   3. 支援斷點續接(resume)
 *   4. 透過 UserInputProvider 跟使用者互動（可替換為 CLI/Web/LINE）
 *
 * 用法：
 *   const { Pipeline } = require('./orchestrator');
 *   const { CliInput } = require('./interfaces/user-input');
 *
 *   const pipeline = new Pipeline(runDir, new CliInput(), { format: 'pptx' });
 *   await pipeline.run();
 */

class Pipeline {
  /**
   * @param {string} runDir — run 目錄路徑
   * @param {UserInputProvider} userInput — 使用者輸入介面
   * @param {object} options
   * @param {string} options.format — 報告格式 (pptx|gslides|gdocs)
   * @param {string} options.schema — 報告模板 (full-13|compact-8|mini-3)
   * @param {boolean} options.auto — 自動模式（跳過互動）
   * @param {boolean} options.skipNarrative — 跳過 §7（CLI 模式用）
   */
  constructor(runDir, userInput, options = {}) {
    this.runDir = runDir;
    this.userInput = userInput;
    this.options = {
      format: 'pptx',
      schema: 'full-13',
      auto: false,
      skipNarrative: false,
      ...options,
    };
    this.statusFile = path.join(runDir, 'run-status.json');
    this.status = this._loadStatus();
  }

  // ── 狀態管理 ──────────────────────────────────

  _loadStatus() {
    if (fs.existsSync(this.statusFile)) {
      return JSON.parse(fs.readFileSync(this.statusFile, 'utf-8'));
    }
    return this._initStatus();
  }

  _initStatus() {
    const status = {
      run_id: path.basename(this.runDir),
      status: 'pending',
      mode: this.options.auto ? 'auto' : 'guided',
      current_stage: null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stages: {},
    };

    for (const stageId of STAGE_ORDER) {
      status.stages[stageId] = { status: 'pending' };
    }

    return status;
  }

  _saveStatus() {
    this.status.updated_at = new Date().toISOString();
    fs.writeFileSync(this.statusFile, JSON.stringify(this.status, null, 2), 'utf-8');
  }

  _updateStage(stageId, updates) {
    this.status.stages[stageId] = { ...this.status.stages[stageId], ...updates };
    this.status.current_stage = stageId;
    this._saveStatus();
  }

  // ── Pipeline 執行 ─────────────────────────────

  /**
   * 跑完整 pipeline（從頭或從斷點續接）
   */
  async run() {
    this.status.status = 'in_progress';
    this._saveStatus();

    await this.userInput.notify(`\n🚀 Pipeline 開始：${this.status.run_id}\n`);

    for (const stageId of STAGE_ORDER) {
      const stageStatus = this.status.stages[stageId]?.status;

      // 跳過已完成的
      if (stageStatus === 'completed' || stageStatus === 'skipped') {
        const stage = STAGES[stageId];
        console.log(`⏭️  ${stageId} ${stage.name} — 已${stageStatus === 'completed' ? '完成' : '跳過'}`);
        continue;
      }

      const result = await this.runStage(stageId);

      if (result.status === 'failed') {
        this.status.status = 'failed';
        this._saveStatus();
        await this.userInput.notify(`\n❌ Pipeline 在 ${stageId} 失敗: ${result.error}`);
        return this.status;
      }
    }

    this.status.status = 'completed';
    this._saveStatus();

    await this._printSummary();
    return this.status;
  }

  /**
   * 跑單一階段
   * @param {string} stageId — 階段 ID（如 '§1', '§3', '§4-6'）
   * @returns {Promise<object>} { status, output, error? }
   */
  async runStage(stageId) {
    const stage = STAGES[stageId];
    if (!stage) {
      return { status: 'failed', error: `未知階段: ${stageId}` };
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  ${stageId} ${stage.name}`);
    console.log(`${'═'.repeat(50)}\n`);

    // 更新狀態為進行中
    this._updateStage(stageId, {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });

    try {
      const result = await stage.runner.run(this.runDir, {
        userInput: this.userInput,
        auto: this.options.auto,
        skipNarrative: this.options.skipNarrative,
        format: this.options.format,
        schema: this.options.schema,
      });

      this._updateStage(stageId, {
        status: result.status,
        completed_at: new Date().toISOString(),
        output: result.output,
        error: result.error,
      });

      const icon = result.status === 'completed' ? '✅' :
                   result.status === 'skipped' ? '⏭️' : '❌';
      console.log(`${icon} ${stageId} ${stage.name} — ${result.status}`);

      return result;
    } catch (err) {
      this._updateStage(stageId, {
        status: 'failed',
        error: err.message,
      });
      console.error(`❌ ${stageId} ${stage.name} 例外: ${err.message}`);
      return { status: 'failed', error: err.message };
    }
  }

  /**
   * 從斷點續接（找到第一個未完成的階段繼續）
   */
  async resume() {
    await this.userInput.notify(`\n🔄 從斷點續接：${this.status.run_id}\n`);
    return this.run(); // run() 本身會跳過已完成的階段
  }

  // ── 報告 ──────────────────────────────────────

  async _printSummary() {
    const lines = [
      '',
      `✅ Pipeline 完成`,
      `📁 Run: ${this.runDir}`,
      `📊 產出格式: ${this.options.format}`,
      '',
      '各階段結果：',
    ];

    for (const stageId of STAGE_ORDER) {
      const stage = STAGES[stageId];
      const s = this.status.stages[stageId];
      const icon = s.status === 'completed' ? '✅' :
                   s.status === 'skipped' ? '⏭️' : '❌';
      lines.push(`  ${icon} ${stageId} ${stage.name}: ${s.status}${s.output ? ` → ${s.output}` : ''}`);
    }

    await this.userInput.notify(lines.join('\n'));
  }
}

module.exports = { Pipeline };
