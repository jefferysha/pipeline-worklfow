#!/usr/bin/env bash
# adapters/pi/hooks/track.sh — Pi Agent PostToolUse track 薄包装（native）。
#
# contract §1：工具调用完成后 append openspec/changes/<name>/.pipeline-history.jsonl。本 wrapper
# 复用 lite baseline hooks/skill-tracker.sh（追踪 Skill/Agent/Task → append 记录到活跃 change history）。
#
# 只做：argv($2)+stdin 双吃 → 归一 stdin JSON → 设 CLAUDE_PLUGIN_ROOT → 透传。
# track 是 fail-safe：失败不回滚、永远 exit 0（contract §1）。
# 用法（Pi settings.json#hooks）：command = "<adapter>/hooks/track.sh PostToolUse"
set -uo pipefail

if [ -n "${2:-}" ]; then INPUT="$2"; else INPUT="$(cat 2>/dev/null || printf '{}')"; fi
[ -z "$INPUT" ] && INPUT='{}'

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_TRACKER="${TENON_CC_TRACKER:-$_ROOT/hooks/skill-tracker.sh}"
[ -f "$CC_TRACKER" ] || exit 0

printf '%s' "$INPUT" | bash "$CC_TRACKER" >/dev/null 2>&1 || true
exit 0
