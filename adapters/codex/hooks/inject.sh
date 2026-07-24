#!/usr/bin/env bash
# adapters/codex/hooks/inject.sh — Codex SessionStart inject 薄包装（档 A 全保真）。
#
# Codex hook 与 CC 同构（spike 实证）：inject 走 {"hookSpecificOutput":{"hookEventName","additionalContext"}}。
# 本 wrapper 复用 lite baseline hooks/session-start.sh（它把宪法 + 活跃 change 上下文 cat 到 stdout），
# 只做三件事：
#   1. argv($2)+stdin 双吃，归一成 baseline 脚本期望的 stdin JSON（带 .cwd）。
#   2. 设 CLAUDE_PLUGIN_ROOT，让 baseline 脚本自定位 templates/ 与 verify-skills.sh。
#   3. 把 baseline 的 plain stdout 用**纯 bash json_escape**（不依赖 jq）包成 Codex hookSpecificOutput JSON。
#
# fail-safe：inject 永不拦截会话——任何异常都 exit 0、不产出伪 JSON（contract §1）。
# 用法（Codex hooks.json 注册）：command = "<adapter>/hooks/inject.sh SessionStart"
#   $1 = 事件名（回填 hookEventName）；$2 = Codex 走 argv 的 hook JSON（缺则读 stdin）
set -uo pipefail

EVENT="${1:-SessionStart}"
if [ -n "${2:-}" ]; then INPUT="$2"; else INPUT="$(cat 2>/dev/null || printf '{}')"; fi
[ -z "$INPUT" ] && INPUT='{}'

# 安装根：优先 CLAUDE_PLUGIN_ROOT（Codex 也注入此 env，spike 实证）；否则自身路径上溯至仓库根。
_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -f "$_ROOT/hooks/session-start.sh" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_INJECTOR="${PIPELINE_CC_INJECTOR:-$_ROOT/hooks/session-start.sh}"
[ -f "$CC_INJECTOR" ] || exit 0   # 找不到 baseline inject → fail-safe 静默

# 复用 baseline：它从 stdin 读 .cwd，输出宪法 + 活跃 change 上下文到 stdout（stderr 是校验噪声，弃之）。
CONTEXT="$(printf '%s' "$INPUT" | PIPELINE_SESSION_START_FORMAT=plain bash "$CC_INJECTOR" 2>/dev/null || true)"
[ -z "$CONTEXT" ] && exit 0   # 无内容不注入伪上下文

# 纯 bash JSON 字符串体转义（对齐 hooks/skill-tracker.sh json_escape，不引 jq 硬依赖）。
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"; s="${s//$'\r'/\\r}"; s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
  "$(json_escape "$EVENT")" "$(json_escape "$CONTEXT")"
exit 0
