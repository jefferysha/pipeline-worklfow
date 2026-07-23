#!/usr/bin/env bash
# confirm-clear.sh — PostToolUse hook（matcher: AskUserQuestion）。
#
# agent 一旦用 AskUserQuestion 跟用户确认/收反馈了，就清掉「待处理交互标记族」——
# 解封 gate.sh 依赖的三门（语义对齐老仓 pipeline-confirm-clear.sh，逐字保真）：
#   .pipeline-pending-confirm     解封 confirm 门（走不走 pipeline 的确认）
#   .pipeline-pending-review      解封 review 门（每个 phase 产出的过目 + 反馈）
#   .pipeline-pending-interaction 解封 interaction 门（交互式 skill 加载后先问用户）
# 任务 #21 headline「清 confirm marker」被此三清动作包含；AskUserQuestion 即人已交互，
# 三门都应解封（缺一则 gate.sh 会在人已确认后仍误挡后续合法操作）。
#
# 清除范围与 gate/router 共用项目根定位：只接受 Git worktree、显式
# PIPELINE_PROJECT_ROOT 或当前 cwd。这样子目录中的确认仍能解封当前 Git 项目，且绝不会清到
# 共享临时父目录的另一项目 marker。
#
# 纯 bash 热路径（CONTRACT §5.4：PostToolUse 每次工具后触发）：零解释器 / 外部 JSON 解析器 spawn，
# stdin JSON 只用 bash 字符串提取 cwd 一键。fail-safe：任何异常一律 exit 0，绝不打断。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

# 从 $INPUT 提取顶层字符串键（逐字复用 gate.sh json_get；纯 bash，不 spawn 解释器/解析器）
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
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] || exit 0

# 无共享 helper 的单文件旧安装保留 cwd fallback；当前安装一定经 helper 取得同一个项目根。
ROOT="$CWD"
ROOT_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/project-root.sh"
if [ -r "$ROOT_HELPER" ]; then
  # shellcheck source=project-root.sh
  . "$ROOT_HELPER"
  ROOT="$(pipeline_project_root "$CWD" bootstrap changes || true)"
fi
[ -n "$ROOT" ] || exit 0
rm -f "$ROOT/.pipeline-pending-confirm" \
      "$ROOT/.pipeline-pending-review" \
      "$ROOT/.pipeline-pending-interaction" 2>/dev/null || true

exit 0
