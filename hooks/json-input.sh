#!/usr/bin/env bash
# json-input.sh — source-only minimal JSON string helpers for hot-path hook shims.
#
# The hosts provide small JSON event payloads. These helpers deliberately implement only the
# string-key/string-value subset that the hooks consume, but they correctly walk escaped quotes so
# a real Codex command such as `/bin/zsh -lc \"sed …\"` is not truncated. Keeping this code in one
# place prevents individual hooks from drifting into subtly different event parsing behaviour.
#
# No interpreter, jq, grep, or eval is used here. A malformed payload returns failure; callers are
# responsible for their existing fail-open policy.

pipeline_json_get_string() { # $1=input JSON, $2=key
  local input="${1:-}" key="${2:-}" rest value='' character escaped=0
  [ -n "$key" ] || return 1
  case "$input" in *"\"$key\""*) ;; *) return 1 ;; esac
  rest="${input#*\"$key\"}"
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
    '"'*) rest="${rest#\"}" ;;
    *) return 1 ;;
  esac

  while [ -n "$rest" ]; do
    character="${rest:0:1}"
    rest="${rest:1}"
    if [ "$escaped" -eq 1 ]; then
      case "$character" in
        '"'|\\|/) value+="$character" ;;
        b) value+=$'\b' ;;
        f) value+=$'\f' ;;
        n) value+=$'\n' ;;
        r) value+=$'\r' ;;
        t) value+=$'\t' ;;
        # Hook routing keys and packaged paths are ASCII. Preserve a Unicode escape literally
        # instead of spawning an interpreter merely to decode it.
        u) value+='\\u' ;;
        *) return 1 ;;
      esac
      escaped=0
    else
      case "$character" in
        \\) escaped=1 ;;
        '"') printf '%s' "$value"; return 0 ;;
        *) value+="$character" ;;
      esac
    fi
  done
  return 1
}

# Codex command-like tools have used both `command` and `cmd` in their hook payloads.  Keep the
# compatibility boundary here rather than letting every hook grow a subtly different fallback.
# Callers still perform their own strict, packaged-SKILL.md validation before treating the value as
# workflow evidence.
pipeline_json_get_command() { # $1=input JSON
  pipeline_json_get_string "$1" command || pipeline_json_get_string "$1" cmd
}

# Host protocol labels for command-capable tools.  The downstream evidence matcher remains the
# authority for whether a particular command really loaded a packaged SKILL.md.
pipeline_json_is_command_tool() { # $1=tool name
  case "${1:-}" in
    Bash|command_execution|exec) return 0 ;;
    *) return 1 ;;
  esac
}

pipeline_json_escape() { # $1=unescaped string → single-line JSON string body
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\t'/\\t}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}
