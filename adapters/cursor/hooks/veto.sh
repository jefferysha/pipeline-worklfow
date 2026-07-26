#!/usr/bin/env bash
# adapters/cursor/hooks/veto.sh — Cursor preToolUse / beforeShellExecution veto 薄包装（native）。
#
# Cursor veto 契约（spike NOTES §1.4/1.5 实证）：
#   - 输入 JSON 走 stdin；事件名由 hooks.json command 行 argv 传（$1）。
#   - 否决格式：stdout JSON {"permission":"deny","user_message":"<reason>"}（亦支持 exit 2）。
#   - 默认 fail-open——hooks.json 已配 failClosed:true（崩溃/超时/非法 JSON 也拦）。
# 复用 lite baseline hooks/gate.sh（命中新鲜 .pipeline-pending-* marker → stderr 指引 + exit 2）。
# 本 wrapper 把 gate.sh 的 exit-2+stderr 转成 Cursor 的 permission JSON。
# fail-safe：找不到 gate.sh → 放行（不因 wrapper 缺失卡死；contract §1 不伪装硬门）。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"
[ -z "$INPUT" ] && INPUT='{}'

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_GATE="${TENON_CC_GATE:-$_ROOT/hooks/gate.sh}"
[ -f "$CC_GATE" ] || { printf '{"permission":"allow"}\n'; exit 0; }

# 跑 gate.sh：捕获 stderr（blocking reason）+ 退出码。
reason="$(printf '%s' "$INPUT" | bash "$CC_GATE" 2>&1 1>/dev/null)"; rc=$?
if [ "$rc" -eq 0 ]; then
  printf '{"permission":"allow"}\n'
  exit 0
fi
# deny：把 reason 转成 Cursor JSON（剥换行、转义双引号）。
esc="$(printf '%s' "$reason" | tr '\n' ' ' | sed 's/"/\\"/g')"
printf '{"permission":"deny","user_message":"%s"}\n' "$esc"
exit 0
