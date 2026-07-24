#!/usr/bin/env bash
# interaction-authority.sh — source-only, Change-bound continuous-execution authority.
#
# A normal-chat user can explicitly authorise the agent to continue a selected Change without
# repeating the same interactive-skill questions.  That authority is deliberately a small,
# versioned hook projection rather than a global switch: it is valid only when it names the
# currently selected live Change, is fail-closed on malformed input, and records whether the user
# delegated the review acknowledgement after the review evidence has been produced.  It never
# skips evidence, guards, verification, or external/publication authority.

PIPELINE_INTERACTION_AUTHORITY_PROTOCOL='pipeline-interaction-authority-v1'
PIPELINE_INTERACTION_AUTHORITY_FILE='.pipeline-interaction-authority'

pipeline_interaction_authority_path() { # $1=verified project root
  [ -n "$1" ] || return 1
  printf '%s/%s' "$1" "$PIPELINE_INTERACTION_AUTHORITY_FILE"
}

pipeline_interaction_authority_valid_name() { # $1=Change name
  case "$1" in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
  return 0
}

# Prints the Change encoded by a complete authority projection.  Unknown/duplicate fields are
# rejected so a partial write, a stale old format, or an operator typo cannot silently widen scope.
pipeline_interaction_authority_change() { # $1=authority marker path
  local marker="$1" first='' line='' line_number=0 change='' scope='' review='' issued_at=''
  [ -f "$marker" ] && [ ! -L "$marker" ] && [ -r "$marker" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    line_number=$((line_number + 1))
    if [ "$line_number" -eq 1 ]; then
      first="$line"
      [ "$first" = "$PIPELINE_INTERACTION_AUTHORITY_PROTOCOL" ] || return 1
      continue
    fi
    case "$line" in
      change=*)
        [ -z "$change" ] || return 1
        change="${line#change=}"
        ;;
      scope=*)
        [ -z "$scope" ] || return 1
        scope="${line#scope=}"
        ;;
      review=*)
        [ -z "$review" ] || return 1
        review="${line#review=}"
        ;;
      issued_at=*)
        [ -z "$issued_at" ] || return 1
        issued_at="${line#issued_at=}"
        ;;
      *) return 1 ;;
    esac
  done < "$marker"
  [ "$line_number" -ge 2 ] || return 1
  pipeline_interaction_authority_valid_name "$change" || return 1
  [ "$scope" = 'interactive-skills' ] || return 1
  case "$review" in required|delegated) ;; *) return 1 ;; esac
  case "$issued_at" in ''|*[!0-9TZ:.-]*) return 1 ;; esac
  printf '%s' "$change"
}

# True only for the caller's exact active Change.  A projection for a previous Change remains
# harmless until it is replaced or explicitly revoked; it cannot affect a new normal conversation.
pipeline_interaction_authority_for_change() { # $1=root $2=live Change name
  local path encoded
  pipeline_interaction_authority_valid_name "$2" || return 1
  path="$(pipeline_interaction_authority_path "$1" || true)"
  [ -n "$path" ] || return 1
  encoded="$(pipeline_interaction_authority_change "$path" || true)"
  [ "$encoded" = "$2" ]
}

pipeline_interaction_authority_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null
}

# Publish a complete projection with a same-directory temporary file.  The marker is policy
# metadata, not a security boundary (the repository belongs to the user), but this avoids readers
# observing a half-written authority and keeps malformed data fail-closed.
pipeline_write_interaction_authority() { # $1=root $2=live Change name
  local root="$1" change="$2" marker tmp now
  [ -d "$root" ] || return 1
  pipeline_interaction_authority_valid_name "$change" || return 1
  marker="$(pipeline_interaction_authority_path "$root" || true)"
  [ -n "$marker" ] && [ ! -L "$marker" ] || return 1
  now="$(pipeline_interaction_authority_now || true)"
  [ -n "$now" ] || return 1
  tmp="$root/.pipeline-interaction-authority.$$"
  [ ! -e "$tmp" ] && [ ! -L "$tmp" ] || return 1
  (
    umask 077
    printf '%s\n' "$PIPELINE_INTERACTION_AUTHORITY_PROTOCOL"
    printf 'change=%s\n' "$change"
    printf 'scope=interactive-skills\n'
    printf 'review=delegated\n'
    printf 'issued_at=%s\n' "$now"
  ) > "$tmp" || return 1
  [ ! -L "$marker" ] || { rm -f "$tmp" 2>/dev/null || true; return 1; }
  mv -f "$tmp" "$marker" 2>/dev/null
}

# Revocation is intentionally Change-bound too: switching to another selected Change cannot delete
# a previous Change's audit projection merely by saying "resume questions" in the new conversation.
pipeline_revoke_interaction_authority() { # $1=root $2=live Change name
  local marker
  marker="$(pipeline_interaction_authority_path "$1" || true)"
  [ -n "$marker" ] || return 1
  pipeline_interaction_authority_for_change "$1" "$2" || return 1
  rm -f "$marker" 2>/dev/null
}

# Keep an auditable, privacy-preserving record.  We deliberately record the resulting policy, not
# the whole user prompt, and reuse the existing per-Change history ledger rather than inventing a
# second event store.
pipeline_record_interaction_authority_event() { # $1=root $2=live Change name $3=enabled|revoked
  local root="$1" change="$2" action="$3" dir history now
  pipeline_interaction_authority_valid_name "$change" || return 1
  case "$action" in enabled|revoked) ;; *) return 1 ;; esac
  dir="$root/openspec/changes/$change"
  [ -d "$dir" ] && [ ! -L "$dir" ] || return 1
  history="$dir/.pipeline-history.jsonl"
  [ ! -L "$history" ] || return 1
  now="$(pipeline_interaction_authority_now || true)"
  [ -n "$now" ] || return 1
  printf '{"ts":"%s","kind":"prompt","raw":"interaction-authority:%s scope=interactive-skills review=delegated"}\n' \
    "$now" "$action" >> "$history"
}
