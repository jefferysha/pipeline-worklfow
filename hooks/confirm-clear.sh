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
# 上溯清除（bounded）：router / interactive-skill-gate 可能在项目根（父目录）落 marker，
# 而本 AskUserQuestion 的 cwd 常是子目录——只清 cwd 会让父目录 marker 残留（跨目录 desync）。
# 向上至多 5 层有界清除治之；有界（不无限上溯）避免误清无关父项目。
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

# cwd + 向上至多 5 层祖先，各清三 marker（有界；对齐 gate.sh resolve_marker 上溯层数）
_d="$CWD"
for _ in 1 2 3 4 5; do
  rm -f "$_d/.pipeline-pending-confirm" \
        "$_d/.pipeline-pending-review" \
        "$_d/.pipeline-pending-interaction" 2>/dev/null || true
  [ "$_d" = "/" ] && break
  _d="$(dirname "$_d")"
done

exit 0
