'use strict';

/**
 * 使用者輸入介面(UserInputProvider) — 抽象層
 *
 * 定義「問使用者問題」的統一介面，不綁死任何 AI 或 UI 框架。
 * 任何介面（Claude、CLI、Web、LINE Bot）都實作這個介面。
 *
 * 內建兩個實作：
 *   - CliInput    — 終端機互動（readline）
 *   - PresetInput — 預載答案（自動模式用）
 */

// ══════════════════════════════════════════════════════
// 抽象介面(Abstract Interface)
// ══════════════════════════════════════════════════════

class UserInputProvider {
  /**
   * 問使用者一個問題
   * @param {string} question — 問題文字
   * @param {Array<{label: string, value: string}>} options — 選項列表
   * @returns {Promise<string>} — 使用者選擇的 value
   */
  async ask(question, options = []) {
    throw new Error('子類別必須實作 ask()');
  }

  /**
   * 請使用者確認（是/否）
   * @param {string} message — 確認訊息
   * @returns {Promise<boolean>}
   */
  async confirm(message) {
    throw new Error('子類別必須實作 confirm()');
  }

  /**
   * 通知使用者（不等回覆）
   * @param {string} message — 通知訊息
   */
  async notify(message) {
    console.log(message);
  }
}

// ══════════════════════════════════════════════════════
// 終端機互動(CLI Input)
// ══════════════════════════════════════════════════════

class CliInput extends UserInputProvider {
  constructor() {
    super();
    this._rl = null;
  }

  _getReadline() {
    if (!this._rl) {
      const readline = require('readline');
      this._rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
    return this._rl;
  }

  _prompt(question) {
    return new Promise(resolve => {
      this._getReadline().question(question, answer => resolve(answer.trim()));
    });
  }

  async ask(question, options = []) {
    console.log(`\n❓ ${question}`);

    if (options.length > 0) {
      options.forEach((opt, i) => {
        console.log(`   ${i + 1}. ${opt.label}`);
      });
      console.log(`   ${options.length + 1}. 其他（自行輸入）`);

      const answer = await this._prompt('\n請選擇（數字）: ');
      const idx = parseInt(answer, 10) - 1;

      if (idx >= 0 && idx < options.length) {
        return options[idx].value;
      }
      // 其他 → 讓使用者自行輸入
      return this._prompt('請輸入: ');
    }

    return this._prompt('> ');
  }

  async confirm(message) {
    const answer = await this._prompt(`\n${message} (y/n): `);
    return answer.toLowerCase().startsWith('y');
  }

  close() {
    if (this._rl) {
      this._rl.close();
      this._rl = null;
    }
  }
}

// ══════════════════════════════════════════════════════
// 預載答案(Preset Input) — 自動模式
// ══════════════════════════════════════════════════════

class PresetInput extends UserInputProvider {
  /**
   * @param {object} answers — 預載的答案，key=問題關鍵字, value=回答
   * @param {object} defaults — 找不到對應答案時的預設值
   */
  constructor(answers = {}, defaults = {}) {
    super();
    this.answers = answers;
    this.defaults = defaults;
  }

  /**
   * 從 interview.json 建立預載答案
   * @param {object} interview — interview.json 物件
   * @returns {PresetInput}
   */
  static fromInterview(interview) {
    return new PresetInput({
      audience: interview.audience || '品牌端行銷單位',
      objective: interview.objective || '證明合作成效',
      key_angles: interview.key_angles?.join(', ') || '',
      tone: interview.tone || 'data-driven',
      notes: interview.notes || '',
    });
  }

  async ask(question, options = []) {
    // 從 answers 裡找匹配的 key
    for (const [key, value] of Object.entries(this.answers)) {
      if (question.includes(key) || question.toLowerCase().includes(key.toLowerCase())) {
        console.log(`   ✅ 自動回答（${key}）: ${value}`);
        return value;
      }
    }

    // 有選項就選第一個
    if (options.length > 0) {
      console.log(`   ✅ 自動選擇: ${options[0].label}`);
      return options[0].value;
    }

    // 使用預設值
    const defaultVal = this.defaults.default || '（自動模式，跳過）';
    console.log(`   ⏭️ 無預設答案，跳過: ${defaultVal}`);
    return defaultVal;
  }

  async confirm(message) {
    console.log(`   ✅ 自動確認: ${message}`);
    return true;
  }
}

module.exports = { UserInputProvider, CliInput, PresetInput };
