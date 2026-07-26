#!/usr/bin/env bash
# confirm-clear.sh — PostToolUse hook（matcher: AskUserQuestion|request_user_input）。
#
# agent 一旦用 AskUserQuestion 跟用户确认/收反馈了，就清掉 confirm / interaction 两类
# 纯交互 marker：
#   .pipeline-pending-confirm     解封 confirm 门（走不走 pipeline 的确认）
#   .pipeline-pending-interaction 解封 interaction 门（交互式 skill 加载后先问用户）
# review v2 marker 不可由这个 hook 直接删除：它对应 canonical receipt，只有用户答复中包含
# 显式批准语义时才调用 `tenon review acknowledge`。这样“要修改”这类回答不会误放行离开
# review phase。
#
# 清除范围与 gate/router 共用项目根定位：只接受 Git worktree、显式
# TENON_PROJECT_ROOT 或当前 cwd。这样子目录中的确认仍能解封当前 Git 项目，且绝不会清到
# 共享临时父目录的另一项目 marker。
#
# 纯 bash 热路径（CONTRACT §5.4：PostToolUse 每次工具后触发）：零解释器 / 外部 JSON 解析器 spawn，
# stdin JSON 只用 bash 字符串提取 cwd 一键。fail-safe：任何异常一律 exit 0，绝不打断。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

# Shared escape-aware parsing keeps quoted host payloads from changing which project marker is
# cleared. It remains Bash-only and preserves this hook's fail-open behaviour.
JSON_INPUT_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/json-input.sh"
[ -r "$JSON_INPUT_HELPER" ] || exit 0
# shellcheck source=json-input.sh
. "$JSON_INPUT_HELPER"
json_get() { pipeline_json_get_string "$INPUT" "$1"; }

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
      "$ROOT/.pipeline-pending-interaction" 2>/dev/null || true

# Hosts place AskUserQuestion answers in tool_response.  Inspect only that suffix: question text
# itself often contains “确认继续” as an option and must never be mistaken for consent.  Unknown or
# schema-drifted payloads fail closed for review while retaining the historical fail-open exit 0.
case "$INPUT" in
  *\"tool_response\"*) RESPONSE_PART="${INPUT#*\"tool_response\"}" ;;
  *) exit 0 ;;
esac
case "$RESPONSE_PART" in
  *确认继续*|*确认执行*|*确认并继续*|*继续执行*|*全部执行*|*可以继续*|*同意继续*|*请继续执行*|*批准继续*|*自行执行*|*自己执行*|*go\ ahead*|*proceed\ with\ it*|*continue\ execution*)
    HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
    REVIEW_HELPER="$HOOK_DIR/review-ack.sh"
    if [ -r "$REVIEW_HELPER" ]; then
      # shellcheck source=review-ack.sh
      . "$REVIEW_HELPER"
      pipeline_acknowledge_active_review "$ROOT" "$HOOK_DIR" || true
    fi
    ;;
esac

exit 0
