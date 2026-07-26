#!/usr/bin/env bash
# review-ack.sh — source-only helpers for the review-gate v2 receipt protocol.
#
# A review marker is only a short-lived hook projection.  The canonical receipt lives in the
# selected Change, so a normal-dialogue confirmation must call `tenon review acknowledge`
# instead of deleting the marker itself.  Keeping this tiny policy here lets UserPromptSubmit,
# PostToolUse and PreToolUse agree on marker ownership without teaching any hot-path hook how to
# mutate Tenon state directly.

TENON_REVIEW_MARKER_PROTOCOL='pipeline-review-v2'

# Echo the Change encoded by a syntactically complete v2 marker.  Old three-line markers and
# malformed projections deliberately return non-zero; callers can retire only the former because
# canonical state, not a marker, now protects a review exit.
pipeline_review_marker_change() { # $1=marker path
  local marker="$1" first='' line='' phase='' change='' requested_at=''
  [ -f "$marker" ] && [ ! -L "$marker" ] && [ -r "$marker" ] || return 1
  IFS= read -r first < "$marker" 2>/dev/null || [ -n "$first" ] || return 1
  [ "$first" = "$TENON_REVIEW_MARKER_PROTOCOL" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      phase=*) phase="${line#phase=}" ;;
      change=*) change="${line#change=}" ;;
      requested_at=*) requested_at="${line#requested_at=}" ;;
    esac
  done < "$marker"
  [ -n "$phase" ] && [ -n "$requested_at" ] || return 1
  case "$change" in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
  printf '%s' "$change"
}

pipeline_review_marker_is_v2() { # $1=marker path
  local first=''
  [ -f "$1" ] && [ ! -L "$1" ] && [ -r "$1" ] || return 1
  IFS= read -r first < "$1" 2>/dev/null || [ -n "$first" ] || return 1
  [ "$first" = "$TENON_REVIEW_MARKER_PROTOCOL" ]
}

# The active pointer is an explicit per-session selection, never an mtime heuristic.  Resolve it
# before treating a root-level marker as relevant; an old Change must not lock an unrelated chat.
pipeline_review_active_change_name() { # $1=verified project root $2=hook directory
  local root="$1" hook_dir="$2" state_helper active_helper dir
  [ -n "$root" ] && [ -d "$root" ] || return 1
  state_helper="$hook_dir/canonical-state.sh"
  active_helper="$hook_dir/active-change.sh"
  [ -r "$state_helper" ] && [ -r "$active_helper" ] || return 1
  # shellcheck source=canonical-state.sh
  . "$state_helper"
  # shellcheck source=active-change.sh
  . "$active_helper"
  dir="$(pipeline_active_change_dir "$root" || true)"
  [ -n "$dir" ] || return 1
  printf '%s' "${dir##*/}"
}

# Return success only when the v2 projection belongs to the explicitly selected live Change and
# the stable CLI persisted the canonical approval receipt.  This function never deletes v2 marker
# files itself; `tenon review acknowledge` owns both the receipt and its projection.
pipeline_acknowledge_active_review() { # $1=verified project root $2=hook directory [$3=delegated]
  local root="$1" hook_dir="$2" mode="${3:-manual}" marker expected active
  marker="$root/.pipeline-pending-review"
  expected="$(pipeline_review_marker_change "$marker" || true)"
  [ -n "$expected" ] || return 1
  active="$(pipeline_review_active_change_name "$root" "$hook_dir" || true)"
  [ -n "$active" ] && [ "$active" = "$expected" ] || return 1
  command -v pipeline >/dev/null 2>&1 || return 1
  case "$mode" in
    delegated) ( cd "$root" && command tenon review acknowledge "$active" --delegated ) >/dev/null 2>&1 ;;
    manual) ( cd "$root" && command tenon review acknowledge "$active" ) >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}
