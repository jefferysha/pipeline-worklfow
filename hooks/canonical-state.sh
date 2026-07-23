#!/usr/bin/env bash
# Shared pure-Bash G1 state reader. Source this file; do not execute it.
# Canonical current wins by existence. A malformed current never authorizes YAML fallback.

pipeline_state_sha256() { # stdin → platform sha256 output
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256
  else
    return 1
  fi
}

pipeline_state_validate_current() { # $1=current.json；校验精确 body digest + immutable twin
  local current="$1" raw digest_tail expected prefix body observed
  local revision_tail revision id_tail revision_id padded twin
  IFS= read -r raw < "$current" 2>/dev/null || [ -n "$raw" ] || return 1
  case "$raw" in '{"schemaVersion":1,"hookState":{'*) ;; *) return 1 ;; esac

  digest_tail="${raw##*,\"stateDigest\":\"}"
  [ "$digest_tail" != "$raw" ] || return 1
  expected="${digest_tail%\"\}}"
  [ "${#expected}" -eq 64 ] || return 1
  case "$expected" in *[!0-9a-f]*) return 1 ;; esac
  prefix="${raw%,\"stateDigest\":\"$expected\"\}}"
  [ "$prefix" != "$raw" ] || return 1
  body="${prefix}}"
  observed="$(printf '%s' "$body" | pipeline_state_sha256 2>/dev/null)" || return 1
  observed="${observed%% *}"
  [ "$observed" = "$expected" ] || return 1

  revision_tail="${raw#*,\"revision\":}"
  [ "$revision_tail" != "$raw" ] || return 1
  revision="${revision_tail%%,*}"
  case "$revision" in ''|*[!0-9]*) return 1 ;; esac
  if [ "$revision" != 0 ]; then case "$revision" in 0*) return 1 ;; esac; fi
  id_tail="${raw#*,\"revisionId\":\"}"
  [ "$id_tail" != "$raw" ] || return 1
  revision_id="${id_tail%%\"*}"
  case "$revision_id" in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
  printf -v padded '%06d' "$revision" 2>/dev/null || return 1
  twin="${current%/*}/revisions/${padded}-${revision_id}.json"
  [ ! -L "$twin" ] && [ -f "$twin" ] || return 1
  cmp -s "$current" "$twin" 2>/dev/null || return 1
}

pipeline_state_source() { # $1=change-dir
  local current="$1/.pipeline-run/current.json" key
  # `-e` follows symlinks and is false for a dangling link. `-L` closes that gap: once the current
  # directory entry exists in any form, canonical owns precedence and a read failure must not
  # authorize YAML fallback.
  if [ -e "$current" ] || [ -L "$current" ]; then
    # Canonical readers reject symlinks/non-files. Validate the complete hookState subset before
    # exposing a source path so callers never turn an unreadable current into `phase=?` or another
    # synthetic state. Functions are resolved when invoked, after this sourced file is fully loaded.
    [ ! -L "$current" ] && [ -f "$current" ] || return 1
    pipeline_state_validate_current "$current" || return 1
    for key in phase workflow track archived automation; do
      pipeline_state_get "$current" "$key" >/dev/null || return 1
    done
    printf '%s' "$current"
    return 0
  fi
  if [ -f "$1/.pipeline.yaml" ]; then
    printf '%s' "$1/.pipeline.yaml"
    return 0
  fi
  return 1
}

pipeline_state_get() { # $1=source $2=hookState key
  local source="$1" key="$2" raw rest value line ch esc index
  case "$source" in
    */.pipeline-run/current.json)
      case "$key" in phase|workflow|track|archived|automation) ;; *) return 1 ;; esac
      IFS= read -r raw < "$source" 2>/dev/null || [ -n "$raw" ] || return 1
      case "$raw" in '{"schemaVersion":1,"hookState":{'*) ;; *) return 1 ;; esac
      case "$raw" in *"\"$key\":\""*) ;; *) return 1 ;; esac
      rest="${raw#*"\"$key\":\""}"
      value=""; esc=""; index=0
      while [ "$index" -lt "${#rest}" ]; do
        ch="${rest:$index:1}"; index=$((index + 1))
        if [ -n "$esc" ]; then
          case "$ch" in
            '"'|'\'|'/') value="${value}${ch}" ;;
            b) value="${value}"$'\b' ;;
            f) value="${value}"$'\f' ;;
            n) value="${value}"$'\n' ;;
            r) value="${value}"$'\r' ;;
            t) value="${value}"$'\t' ;;
            *) return 1 ;; # hook fields never need JSON \u escapes; malformed/unsupported => no value
          esac
          esc=""
        else
          case "$ch" in
            '\') esc=1 ;;
            '"') printf '%s' "$value"; return 0 ;;
            *) value="${value}${ch}" ;;
          esac
        fi
      done
      return 1
      ;;
    */.pipeline.yaml)
      line="$(grep -m1 "^$key: " "$source" 2>/dev/null || true)"
      line="${line#"$key: "}"
      case "$line" in
        '"'*'"') line="${line#\"}"; line="${line%\"}" ;;
        "'"*"'") line="${line#\'}"; line="${line%\'}" ;;
      esac
      printf '%s' "$line"
      ;;
    *) return 1 ;;
  esac
}
