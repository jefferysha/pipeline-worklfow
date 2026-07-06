#!/usr/bin/env bash
# session-start.sh — SessionStart：输出一段简短引导 + 触发插件资产校验（CONTRACT §5.7）。
#
# 纯 bash；校验交给 tools/verify-skills.sh。校验失败只在 stderr 警告、绝不阻断会话
# （fail-open——SessionStart 挂了会拖慢/卡死所有会话，宁可放行）。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

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

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"

# ── 简短引导（一行相位图 + 项目 GOAL.md 头两行，若有）──
printf '[pipeline-lite] 7-phase 流水线已加载：open → explore → spec → build ⇄ verify → ship → archive。状态操作一律走 pipeline CLI（status / get / set / transition / check），编排入口 skill：/pipeline-lite。\n'
if [ -f "$CWD/GOAL.md" ]; then
  head -2 "$CWD/GOAL.md" 2>/dev/null || true
fi

# ── 插件资产校验（fail-open：失败仅警告）──
VS="$PLUGIN_ROOT/tools/verify-skills.sh"
if [ -f "$VS" ]; then
  if ! bash "$VS" --quiet --root "$PLUGIN_ROOT" 1>&2; then
    printf '[pipeline-lite] 警告：插件资产校验未通过（存在悬空引用，明细见上；复跑：bash %s）。会话不阻断，但请尽快修复。\n' "$VS" >&2
  fi
else
  printf '[pipeline-lite] 警告：未找到 %s，跳过插件资产校验（CONTRACT §5.7 要求安装期校验）。\n' "$VS" >&2
fi

exit 0
