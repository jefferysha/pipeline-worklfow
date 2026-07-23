#!/usr/bin/env bash
# confirm-clear-prompt.sh — actual user-confirmation unlock for UserPromptSubmit.
#
# `confirm-clear.sh` is retained for hosts which expose AskUserQuestion responses.  Codex desktop's
# normal conversation path does not expose that tool, however, so clearing only on PostToolUse made a
# review marker self-lock every subsequent tool call.  This hook receives the user's next prompt and
# clears markers only for an explicit approval phrase, before the next PreToolUse gate runs.
#
# It intentionally recognises a narrow, auditable set of affirmative phrases.  Questions such as
# "为什么" or "看看状态" do not clear review evidence.  Fail-open: malformed hook input merely leaves
# the marker in place; it never blocks the user's prompt itself.
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

PROMPT="$(json_get prompt || true)"
[ -n "$PROMPT" ] || exit 0

# Do not treat a sentence merely mentioning confirmation as consent.  All accepted variants state a
# concrete continuation/approval intent and are the phrases shown in the injected gate guidance.
case "$PROMPT" in
  *确认继续*|*确认执行*|*确认并继续*|*继续执行*|*全部执行*|*可以继续*|*同意继续*|*请继续执行*|*批准继续*|*自行执行*|*自己执行*|*go\ ahead*|*proceed\ with\ it*|*continue\ execution*) ;;
  *) exit 0 ;;
esac

CWD="$(json_get cwd || true)"
[ -n "$CWD" ] || CWD="$PWD"
[ -d "$CWD" ] || exit 0

ROOT_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/project-root.sh"
[ -r "$ROOT_HELPER" ] || exit 0
# shellcheck source=project-root.sh
. "$ROOT_HELPER"
ROOT="$(pipeline_project_root "$CWD" bootstrap changes || true)"
[ -n "$ROOT" ] || exit 0

# These names are fixed literals, resolved only below a verified project root.  `rm -f` is intentional:
# acknowledgement is an idempotent state transition and must not fail if a concurrent host cleared a
# marker first.
rm -f "$ROOT/.pipeline-pending-confirm" \
      "$ROOT/.pipeline-pending-review" \
      "$ROOT/.pipeline-pending-interaction" 2>/dev/null || true

exit 0
