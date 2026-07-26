#!/usr/bin/env bash
# adapters/aider/hooks/track.sh — aider track 实现：git post-commit 留痕（档 B，"native" 判据见 README）。
#
# aider 没有 Skill/Agent 工具面、也没有 PostToolUse 事件——本脚本装作 `.git/hooks/post-commit`，
# 把 aider 的 auto-commit（或用户手动 commit）当作可追踪的工作单元，复用 lite baseline
# hooks/skill-tracker.sh 的 append 逻辑，记一条 kind=tool、raw="Skill: aider-edit"，与
# codex/cursor/gemini/copilot/pi 的 history 记录同构（conformance 断言逐字对齐 baseline 格式）。
#
# 粒度再解释是诚实适配，非伪造：aider 以「commit」为工作单元（非逐工具调用），track 语义
# 在无 Skill 概念平台上合理映射为「记一次 commit」。真实、自动、无需人工触发——故归类 native。
#
# 双模式：真 git hook 场景 argv 空、stdin 可能是终端——不阻塞读取，退回 git 定位 cwd；
# conformance 场景喂 {"cwd":...} stdin JSON（与其余适配器 drive_track 同款调用协议）。
# fire & forget：失败不回滚、不阻塞 commit（contract §1 track fail-safe）。
set -uo pipefail

if [ -n "${2:-}" ]; then
  INPUT="$2"
elif [ -t 0 ]; then
  INPUT='{}'   # stdin 是终端（人工 git commit）——绝不 cat 阻塞交互式提交
else
  INPUT="$(cat 2>/dev/null || printf '{}')"
fi
[ -z "$INPUT" ] && INPUT='{}'

json_get() {
  local key="$1" rest
  case "$INPUT" in *"\"$key\""*) ;; *) return 1 ;; esac
  rest="${INPUT#*\"$key\"}"
  while true; do
    case "$rest" in
      [$' \t\r\n']*) rest="${rest#?}" ;;
      ':'*) rest="${rest#:}"; break ;;
      *) return 1 ;;
    esac
  done
  while true; do
    case "$rest" in
      [$' \t\r\n']*) rest="${rest#?}" ;;
      *) break ;;
    esac
  done
  case "$rest" in
    '"'*) rest="${rest#\"}"; printf '%s' "${rest%%\"*}"; return 0 ;;
    *) return 1 ;;
  esac
}

CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_TRACKER="${TENON_CC_TRACKER:-$_ROOT/hooks/skill-tracker.sh}"
[ -f "$CC_TRACKER" ] || exit 0

printf '{"cwd":"%s","tool_name":"Skill","skill":"aider-edit"}' "$CWD" | bash "$CC_TRACKER" >/dev/null 2>&1 || true
exit 0
