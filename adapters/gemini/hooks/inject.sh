#!/usr/bin/env bash
# adapters/gemini/hooks/inject.sh — Gemini CLI SessionStart inject 薄包装（档 A 全保真）。
#
# Gemini CLI hook 与 CC 同构（settings.json#hooks，type:command）：inject 走
# {"hookSpecificOutput":{"hookEventName","additionalContext"}}。本 wrapper 复用 lite baseline
# hooks/session-start.sh（宪法 + 活跃 change 上下文 → stdout），只做：
#   1. argv($2)+stdin 双吃，归一成 baseline 期望的 stdin JSON（带 .cwd）。
#   2. 设 CLAUDE_PLUGIN_ROOT，让 baseline 脚本自定位 templates/ 与 verify-skills.sh。
#   3. 纯 bash json_escape（不依赖 jq）把 plain stdout 包成 Gemini hookSpecificOutput JSON。
#
# fail-safe：inject 永不拦截会话——任何异常都 exit 0、不产出伪 JSON（contract §1）。
# 已知 caveat：sub-agent 层无 inject-subagent-context（Gemini #18128），仅限 sub-agent，不降主档。
# 用法（Gemini settings.json#hooks 注册）：command = "<adapter>/hooks/inject.sh SessionStart"
set -uo pipefail

EVENT="${1:-SessionStart}"
if [ -n "${2:-}" ]; then INPUT="$2"; else INPUT="$(cat 2>/dev/null || printf '{}')"; fi
[ -z "$INPUT" ] && INPUT='{}'

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_INJECTOR="${TENON_CC_INJECTOR:-$_ROOT/hooks/session-start.sh}"
[ -f "$CC_INJECTOR" ] || exit 0

CONTEXT="$(printf '%s' "$INPUT" | TENON_SESSION_START_FORMAT=plain bash "$CC_INJECTOR" 2>/dev/null || true)"
[ -z "$CONTEXT" ] && exit 0

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"; s="${s//$'\r'/\\r}"; s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
  "$(json_escape "$EVENT")" "$(json_escape "$CONTEXT")"
exit 0
