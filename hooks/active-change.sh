#!/usr/bin/env bash
# active-change.sh — source-only resolver for an explicitly selected, live Change.
#
# `.pipeline-active` is a repo-level *selection*, never an mtime heuristic.  Hooks that append
# evidence or enforce a custom workflow DAG must use this resolver so a new conversation cannot
# borrow a different Change merely because it was modified most recently.  Callers source
# canonical-state.sh first; this helper then validates both the pointer and the selected state.

pipeline_active_change_dir() { # $1=verified project root -> exact non-archived Change dir
  local root="$1" pointer name dir state
  [ -n "$root" ] && [ -d "$root/openspec/changes" ] || return 1
  pointer="$root/.pipeline-active"
  [ -f "$pointer" ] && [ ! -L "$pointer" ] && [ -r "$pointer" ] || return 1

  # Command substitution removes only trailing newlines.  Anything else (including an embedded
  # newline, path separator, or control character) fails the deliberately narrow name contract.
  name="$(<"$pointer")"
  case "$name" in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
  dir="$root/openspec/changes/$name"
  [ -d "$dir" ] || return 1
  state="$(pipeline_state_source "$dir" || true)"
  [ -n "$state" ] && [ "$(pipeline_state_get "$state" archived)" != "true" ] || return 1
  printf '%s' "$dir"
}
