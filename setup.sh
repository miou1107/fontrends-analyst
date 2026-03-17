#!/bin/bash
# FonTrends Analyst — 首次安裝
set -e

CONFIG_DIR="$HOME/.fontrends"
TOKEN_FILE="$CONFIG_DIR/token"

mkdir -p "$CONFIG_DIR"

echo "=== FonTrends Analyst Setup ==="
echo ""

if [ -f "$TOKEN_FILE" ]; then
  echo "Token 已存在: $TOKEN_FILE"
  read -p "要更新 token 嗎？(y/N) " REPLY
  if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
    echo "保留現有 token，設定完成。"
    exit 0
  fi
fi

echo "請輸入你的 GitHub Personal Access Token（購買後會收到）："
read -s TOKEN

if [ -z "$TOKEN" ]; then
  echo "Error: Token 不能為空"
  exit 1
fi

echo "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

# 驗證 token
echo ""
echo "驗證 token..."
if git clone "https://$TOKEN@github.com/miou1107/fontrends-analyst-core.git" /tmp/fontrends-core-test --depth 1 2>/dev/null; then
  rm -rf /tmp/fontrends-core-test
  echo "✅ Token 驗證成功！"
  echo ""
  echo "設定完成。在 Claude in Chrome 中啟動 brand-analysis-looker-studio skill 即可使用。"
else
  rm -f "$TOKEN_FILE"
  echo "❌ Token 驗證失敗。請確認 token 正確且有 repo read 權限。"
  exit 1
fi
