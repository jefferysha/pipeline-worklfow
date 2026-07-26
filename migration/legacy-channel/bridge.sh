#!/usr/bin/env bash
# Migration-only SessionStart bridge. This file is never part of the Tenon managed payload.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
MODE="manual"
HOST=""
case "${1:-}" in
  --auto) MODE="auto" ;;
  --codex) HOST="codex" ;;
  --claude) HOST="claude" ;;
  -h|--help)
    printf 'Usage: bridge.sh [--auto|--codex|--claude]\n'
    exit 0
    ;;
esac

if [ -z "$HOST" ]; then
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then HOST="claude"; else HOST="codex"; fi
fi
[ -n "${HOME:-}" ] || exit 0

if [ "$(uname -s 2>/dev/null || true)" = "Darwin" ]; then
  OLD_CONFIG="$HOME/Library/Application Support/pipeline-lite/config"
  OLD_DATA="$HOME/Library/Application Support/pipeline-lite"
  TENON_STATE="$HOME/Library/Application Support/tenon/state"
else
  OLD_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/pipeline-lite"
  OLD_DATA="${XDG_DATA_HOME:-$HOME/.local/share}/pipeline-lite"
  TENON_STATE="${XDG_STATE_HOME:-$HOME/.local/state}/tenon"
fi
CONFIG="$OLD_CONFIG/auto-update.conf"
MIGRATION_DIR="$TENON_STATE/migration"
RECEIPT="$MIGRATION_DIR/legacy-channel-${HOST}.receipt"
PROOF="$MIGRATION_DIR/tenon-session-loaded"
LOCK="$MIGRATION_DIR/.legacy-channel-${HOST}.lock"
LOG="$MIGRATION_DIR/legacy-channel-${HOST}.log"

mkdir -p "$MIGRATION_DIR" 2>/dev/null || exit 0
umask 077
exec >>"$LOG" 2>&1

if [ "$MODE" = "auto" ]; then
  [ -f "$CONFIG" ] && [ ! -L "$CONFIG" ] || {
    printf 'Tenon migration available: run %s --%s\n' "$ROOT/bridge.sh" "$HOST"
    exit 0
  }
  grep -Fxq "host=$HOST" "$CONFIG" 2>/dev/null && grep -Fxq 'enabled=true' "$CONFIG" 2>/dev/null || exit 0
fi

acquire_lock() {
  local owner_pid started now
  if mkdir "$LOCK" 2>/dev/null; then
    printf 'pid=%s\nstarted_epoch=%s\n' "$$" "$(date +%s 2>/dev/null || printf '0')" > "$LOCK/owner"
    return 0
  fi
  [ -f "$LOCK/owner" ] && [ ! -L "$LOCK/owner" ] || return 1
  owner_pid="$(grep -m1 '^pid=' "$LOCK/owner" 2>/dev/null | sed 's/^pid=//' || true)"
  started="$(grep -m1 '^started_epoch=' "$LOCK/owner" 2>/dev/null | sed 's/^started_epoch=//' || true)"
  now="$(date +%s 2>/dev/null || printf '0')"
  case "$owner_pid:$started:$now" in *[!0-9:]*|::*|*::*) return 1 ;; esac
  if kill -0 "$owner_pid" 2>/dev/null; then return 1; fi
  [ "$now" -ge "$started" ] && [ $((now - started)) -ge 600 ] || return 1
  # A lock directory is Tenon-owned only when it contains exactly the known owner record.
  [ "$(find "$LOCK" -mindepth 1 -maxdepth 1 -print 2>/dev/null | wc -l | tr -d ' ')" = "1" ] || return 1
  rm "$LOCK/owner" 2>/dev/null && rmdir "$LOCK" 2>/dev/null || return 1
  mkdir "$LOCK" 2>/dev/null || return 1
  printf 'pid=%s\nstarted_epoch=%s\n' "$$" "$now" > "$LOCK/owner"
}
acquire_lock || exit 0
cleanup_lock() { rm "$LOCK/owner" 2>/dev/null || true; rmdir "$LOCK" 2>/dev/null || true; }
trap cleanup_lock EXIT HUP INT TERM

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else return 1
  fi
}

launcher_hash() {
  local name="$1" mode="$2" file="$HOME/.local/bin/$name" bootstrap="$OLD_DATA/bootstrap/active.mjs"
  [ -f "$file" ] && [ ! -L "$file" ] || return 0
  grep -Fq "export PIPELINE_RUNTIME_DATA_ROOT='$OLD_DATA'" "$file" || return 1
  grep -Fq "exec node '$bootstrap' $mode \"\$@\"" "$file" || return 1
  sha256_file "$file"
}

read_receipt() {
  local key="$1"
  [ -f "$RECEIPT" ] || return 1
  grep -m1 "^${key}=" "$RECEIPT" 2>/dev/null | sed "s/^${key}=//"
}

write_receipt() {
  local state="$1" activated="$2" release_id="$3" cli_hash="$4" hook_hash="$5" tmp="$RECEIPT.tmp.$$"
  {
    printf 'version=2\nstate=%s\nhost=%s\nactivated_epoch=%s\nrelease_id=%s\n' \
      "$state" "$HOST" "$activated" "$release_id"
    printf 'pipeline_sha256=%s\npipeline_hook_sha256=%s\n' "$cli_hash" "$hook_hash"
  } > "$tmp" && mv "$tmp" "$RECEIPT"
}

tenon_present() {
  case "$HOST" in
    codex) codex plugin list --json 2>/dev/null | grep -Eq '"name"[[:space:]]*:[[:space:]]*"tenon"' ;;
    claude) claude plugin list --json 2>/dev/null | grep -Eq '"id"[[:space:]]*:[[:space:]]*"tenon@tenon"' ;;
  esac
}

remove_legacy_registration() {
  local output="$MIGRATION_DIR/.remove-${HOST}.$$"
  run_remove() {
    if "$@" >"$output" 2>&1; then rm "$output"; return 0; fi
    if grep -Eiq 'not found|not installed|does not exist|unknown marketplace' "$output" 2>/dev/null; then
      rm "$output"
      return 0
    fi
    cat "$output"
    rm "$output"
    return 1
  }
  case "$HOST" in
    codex)
      run_remove codex plugin remove pipeline-lite@pipeline-lite --json \
        && run_remove codex plugin marketplace remove pipeline-lite --json
      ;;
    claude)
      run_remove claude plugin uninstall pipeline-lite@pipeline-lite --scope user \
        && run_remove claude plugin marketplace remove pipeline-lite --scope user
      ;;
  esac
}

cleanup_if_proven() {
  local activated loaded release_expected release_loaded proof_host cli_expected hook_expected file current
  [ "$(read_receipt state || true)" = "cleanup-pending" ] || return 1
  [ -x "$HOME/.local/bin/tenon" ] && tenon_present || return 1
  activated="$(read_receipt activated_epoch || true)"
  loaded="$(grep -m1 '^loaded_at_epoch=' "$PROOF" 2>/dev/null | sed 's/^loaded_at_epoch=//' || true)"
  proof_host="$(grep -m1 '^host=' "$PROOF" 2>/dev/null | sed 's/^host=//' || true)"
  release_expected="$(read_receipt release_id || true)"
  release_loaded="$(grep -m1 '^release_id=' "$PROOF" 2>/dev/null | sed 's/^release_id=//' || true)"
  case "$activated:$loaded" in *[!0-9:]*|:*) return 1 ;; esac
  grep -Fxq 'version=2' "$PROOF" 2>/dev/null || return 1
  [ "$loaded" -ge "$activated" ] || return 1
  [ "$proof_host" = "$HOST" ] && [ -n "$release_expected" ] && [ "$release_loaded" = "$release_expected" ] || return 1

  cli_expected="$(read_receipt pipeline_sha256 || true)"
  hook_expected="$(read_receipt pipeline_hook_sha256 || true)"
  for file in pipeline pipeline-hook; do
    if [ "$file" = pipeline ]; then current="$cli_expected"; else current="$hook_expected"; fi
    [ -n "$current" ] || continue
    [ -e "$HOME/.local/bin/$file" ] || continue
    [ -f "$HOME/.local/bin/$file" ] && [ ! -L "$HOME/.local/bin/$file" ] || return 1
    [ "$(sha256_file "$HOME/.local/bin/$file")" = "$current" ] || return 1
  done

  remove_legacy_registration || return 1
  [ -z "$cli_expected" ] || rm -f "$HOME/.local/bin/pipeline"
  [ -z "$hook_expected" ] || rm -f "$HOME/.local/bin/pipeline-hook"
  write_receipt completed "$activated" "$release_expected" "$cli_expected" "$hook_expected"
  return 0
}

cleanup_if_proven && exit 0

[ -x "$ROOT/tenon-install.sh" ] || {
  printf 'legacy bridge is incomplete: tenon-install.sh missing\n'
  exit 1
}
cli_hash="$(launcher_hash pipeline cli || true)"
hook_hash="$(launcher_hash pipeline-hook hook || true)"
activated="$(date +%s 2>/dev/null || printf '0')"
release_id=""
args=("--$HOST")
[ "$MODE" = "auto" ] && args+=(--auto-update)
if bash "$ROOT/tenon-install.sh" "${args[@]}"; then
  [ -x "$HOME/.local/bin/tenon" ] && tenon_present || {
    printf 'Tenon install returned without a verified launcher/inventory entry; preserving legacy registration.\n'
    exit 1
  }
  release_id="$("$HOME/.local/bin/tenon" runtime status --json 2>/dev/null \
    | sed -n 's/.*"activeRelease":"\\(sha256-[0-9a-f]*\\)".*/\\1/p' | head -1)"
  case "$release_id" in sha256-*) ;; *) release_id="" ;; esac
  case "${release_id#sha256-}" in *[!0-9a-f]*) release_id="" ;; esac
  if [ "${#release_id}" -ne 71 ]; then
    printf 'Tenon runtime status did not return an active release; preserving legacy registration.\n'
    exit 1
  fi
  write_receipt cleanup-pending "$activated" "$release_id" "$cli_hash" "$hook_hash"
  printf 'Tenon activated. Open a new %s session; the bridge will remove the legacy identity only after session proof.\n' "$HOST"
else
  printf 'Tenon install failed; preserving legacy registration.\n'
  exit 1
fi
