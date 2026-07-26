#!/usr/bin/env bash
# adapters/gemini/hooks/veto.sh — Gemini CLI PreToolUse veto 薄包装（档 A 全保真）。
#
# Gemini 与 CC 同款 veto 契约（settings.json#hooks）：PreToolUse hook `exit 2` + 非空 stderr
# = 硬拦截。本 wrapper 复用 lite baseline hooks/gate.sh（命中新鲜 .pipeline-pending-* marker
# 时 printf 指引 >&2; exit 2，否则 exit 0）——决定 deny 的就是那些 marker。
#
# 只做：argv($2)+stdin 双吃 → 归一 stdin JSON → 设 CLAUDE_PLUGIN_ROOT → 原样透传退出码与 stderr。
# fail-safe：找不到 gate.sh → 放行（不因 wrapper 缺失把 Gemini 卡死；contract §1 不伪装硬门）。
# 用法（Gemini settings.json#hooks）：command = "<adapter>/hooks/veto.sh PreToolUse"
set -uo pipefail

if [ -n "${2:-}" ]; then INPUT="$2"; else INPUT="$(cat 2>/dev/null || printf '{}')"; fi
[ -z "$INPUT" ] && INPUT='{}'

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_GATE="${TENON_CC_GATE:-$_ROOT/hooks/gate.sh}"
[ -f "$CC_GATE" ] || exit 0

printf '%s' "$INPUT" | bash "$CC_GATE"
exit $?
