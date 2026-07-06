#!/usr/bin/env bash
# adapters/cursor/hooks/track.sh — Cursor postToolUse track（真留痕）+ inject 补偿薄包装。
#
# 转正改进（老 spike 只做 inject 补偿、未真 append history — 那是「声明 track 却不写」的病灶）：
#   本 wrapper **真跑 track**：把 postToolUse 调用透传给 lite baseline hooks/skill-tracker.sh，
#   真 append 到 openspec/changes/<name>/.pipeline-history.jsonl（与 codex/CC 同一条 history 记录）。
# 同时承担 inject 补偿：Cursor 无 SessionStart 级 inject（spike NOTES §1.1）——
#   ① 静态层走 .cursor/rules（install 落盘，contract §1 degraded 声明）；
#   ② 动态补偿走本 postToolUse 的 additional_context（复用 baseline session-start 上下文）。
#
# 输入 stdin JSON；事件名 argv $1。stdout 返 Cursor postToolUse 字段 additional_context。
# fail-safe：track / inject 失败都不回滚、不拦（contract §1）。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"
[ -z "$INPUT" ] && INPUT='{}'

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

# ── ① 真 track：透传 baseline tracker，真 append history（转正核心，不再空声明）──
CC_TRACKER="${PIPELINE_CC_TRACKER:-$_ROOT/hooks/skill-tracker.sh}"
if [ -f "$CC_TRACKER" ]; then
  printf '%s' "$INPUT" | bash "$CC_TRACKER" >/dev/null 2>&1 || true
fi

# ── ② inject 补偿：复用 baseline session-start 上下文 → 包成 Cursor additional_context ──
CC_INJECTOR="${PIPELINE_CC_INJECTOR:-$_ROOT/hooks/session-start.sh}"
ctx=""
if [ -f "$CC_INJECTOR" ]; then
  ctx="$(printf '%s' "$INPUT" | bash "$CC_INJECTOR" 2>/dev/null || true)"
fi

if [ -n "$ctx" ]; then
  esc="$(printf '%s' "$ctx" | awk 'BEGIN{ORS="\\n"} {gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); print}')"
  printf '{"additional_context":"%s"}\n' "$esc"
else
  printf '{}\n'
fi
exit 0
