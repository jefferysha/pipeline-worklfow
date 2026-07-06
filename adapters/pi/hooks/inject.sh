#!/usr/bin/env bash
# adapters/pi/hooks/inject.sh — Pi Agent SessionStart inject 薄包装（native）。
#
# Pi settings.json#hooks 内嵌，SessionStart 与 CC 同构：inject 走
# {"hookSpecificOutput":{"hookEventName","additionalContext"}}。本 wrapper 复用 lite baseline
# hooks/session-start.sh（宪法 + 活跃 change 上下文 → stdout），纯 bash json_escape 包 JSON（不引 jq）。
#
# fail-safe：inject 永不拦截会话——任何异常都 exit 0、不产出伪 JSON（contract §1）。
# 用法（Pi settings.json#hooks 注册）：command = "<adapter>/hooks/inject.sh SessionStart"
set -uo pipefail

EVENT="${1:-SessionStart}"
if [ -n "${2:-}" ]; then INPUT="$2"; else INPUT="$(cat 2>/dev/null || printf '{}')"; fi
[ -z "$INPUT" ] && INPUT='{}'

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_INJECTOR="${PIPELINE_CC_INJECTOR:-$_ROOT/hooks/session-start.sh}"
[ -f "$CC_INJECTOR" ] || exit 0

CONTEXT="$(printf '%s' "$INPUT" | bash "$CC_INJECTOR" 2>/dev/null || true)"
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
