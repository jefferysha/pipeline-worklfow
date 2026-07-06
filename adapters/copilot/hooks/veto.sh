#!/usr/bin/env bash
# adapters/copilot/hooks/veto.sh — GitHub Copilot preToolUse veto 薄包装（native）。
#
# Copilot coding agent hook：preToolUse `exit 2` + 非空 stderr = 硬拦截。本 wrapper 复用 lite
# baseline hooks/gate.sh（命中新鲜 .pipeline-pending-* marker → stderr 指引 + exit 2，否则 exit 0）。
#
# 只做：argv($2)+stdin 双吃 → 归一 stdin JSON → 设 CLAUDE_PLUGIN_ROOT → 原样透传退出码与 stderr。
# fail-safe：找不到 gate.sh → 放行（不因 wrapper 缺失卡死；contract §1 不伪装硬门）。
# dual hookContainer 注意：本 wrapper 须由 .github/copilot/hooks.json 与 .github/hooks/trellis.json
#   两份都注册才生效（漏一份 copilot 引擎读不到 hook）——install.sh 同源写两份。
# 用法：command = "<adapter>/hooks/veto.sh preToolUse"
set -uo pipefail

if [ -n "${2:-}" ]; then INPUT="$2"; else INPUT="$(cat 2>/dev/null || printf '{}')"; fi
[ -z "$INPUT" ] && INPUT='{}'

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_GATE="${PIPELINE_CC_GATE:-$_ROOT/hooks/gate.sh}"
[ -f "$CC_GATE" ] || exit 0

printf '%s' "$INPUT" | bash "$CC_GATE"
exit $?
