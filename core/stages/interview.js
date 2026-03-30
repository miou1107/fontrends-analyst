'use strict';

const path = require('path');
const fs = require('fs');

/**
 * §1 需求訪談(Interview) — 階段執行器
 *
 * 透過 UserInputProvider 問 5 個問題，產出 interview.json。
 * 不綁死任何 AI 或 UI 框架。
 */

const INTERVIEW_QUESTIONS = [
  {
    key: 'audience',
    question: '這份報告給誰看？',
    options: [
      { label: '品牌端行銷團隊（決定要不要合作）', value: '品牌端行銷單位' },
      { label: '內部主管（看成效）', value: '內部主管' },
      { label: '投資人/董事會（看市場定位）', value: '投資人' },
    ],
  },
  {
    key: 'objective',
    question: '這份報告的目的？',
    options: [
      { label: '證明合作成效（給品牌看 ROI）', value: '證明合作成效' },
      { label: '市場趨勢分析（了解產業動態）', value: '市場趨勢分析' },
      { label: '競品比較（找出差距和機會）', value: '競品比較分析' },
    ],
  },
  {
    key: 'key_angles',
    question: '想特別強調哪些角度？（可多選，逗號分隔）',
    options: [
      { label: '場域集客力優勢', value: '場域集客力優勢' },
      { label: '檔期活動效果', value: '檔期活動效果' },
      { label: '熱門關鍵字和搜尋趨勢', value: '熱門關鍵字列表' },
    ],
  },
  {
    key: 'tone',
    question: '報告的風格？',
    options: [
      { label: '數據驅動、以數字說話', value: 'data-driven' },
      { label: '故事型、有敘事脈絡', value: 'narrative' },
      { label: '簡潔摘要、只看重點', value: 'executive-brief' },
    ],
  },
  {
    key: 'notes',
    question: '有沒有其他需要特別注意的？（直接輸入，沒有就按 Enter 跳過）',
    options: [],
  },
];

/**
 * 執行訪談，產出 interview.json
 * @param {string} runDir — run 目錄路徑
 * @param {object} options
 * @param {UserInputProvider} options.userInput — 使用者輸入介面
 * @param {object} options.baseInterview — 預填的基本資料（brand, competitor, period 等）
 * @returns {Promise<object>} interview 結果
 */
async function run(runDir, options = {}) {
  const { userInput, baseInterview = {} } = options;

  if (!userInput) {
    throw new Error('§1 需求訪談需要 userInput（使用者輸入介面）');
  }

  // 先讀取既有的 interview.json 作為基礎（保留 brand、competitor、period 等）
  const existingPath = path.join(runDir, 'interview.json');
  let existing = {};
  if (fs.existsSync(existingPath)) {
    try { existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8')); } catch {}
  }

  await userInput.notify('📋 開始需求訪談（共 5 題）...\n');

  const interview = { ...existing, ...baseInterview };

  for (const q of INTERVIEW_QUESTIONS) {
    // 如果 baseInterview 已有值就跳過
    if (interview[q.key] && q.key !== 'notes') {
      await userInput.notify(`   ✅ ${q.key}: ${interview[q.key]}（已預填）`);
      continue;
    }

    const answer = await userInput.ask(q.question, q.options);

    if (q.key === 'key_angles' && typeof answer === 'string') {
      interview[q.key] = answer.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    } else {
      interview[q.key] = answer;
    }
  }

  // 寫入 interview.json
  const outputPath = path.join(runDir, 'interview.json');
  fs.writeFileSync(outputPath, JSON.stringify(interview, null, 2), 'utf-8');

  await userInput.notify(`\n✅ 訪談完成，已寫入 ${outputPath}`);

  return { status: 'completed', output: 'interview.json' };
}

module.exports = { run, INTERVIEW_QUESTIONS };
