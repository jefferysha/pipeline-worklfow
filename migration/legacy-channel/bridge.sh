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

mkdir "$LOCK" 2>/dev/null || exit 0
cleanup_lock() { rmdir "$LOCK" 2>/dev/null || true; }
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
  local state="$1" activated="$2" cli_hash="$3" hook_hash="$4" tmp="$RECEIPT.tmp.$$"
  {
    printf 'version=1\nstate=%s\nhost=%s\nactivated_epoch=%s\n' "$state" "$HOST" "$activated"
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
  case "$HOST" in
    codex)
      codex plugin remove pipeline-lite@pipeline-lite --json
      codex plugin marketplace remove pipeline-lite --json
      ;;
    claude)
      claude plugin uninstall pipeline-lite@pipeline-lite --scope user
      claude plugin marketplace remove pipeline-lite --scope user
      ;;
  esac
}

cleanup_if_proven() {
  local activated loaded cli_expected hook_expected file current
  [ "$(read_receipt state || true)" = "cleanup-pending" ] || return 1
  [ -x "$HOME/.local/bin/tenon" ] && tenon_present || return 1
  activated="$(read_receipt activated_epoch || true)"
  loaded="$(grep -m1 '^loaded_at_epoch=' "$PROOF" 2>/dev/null | sed 's/^loaded_at_epoch=//' || true)"
  case "$activated:$loaded" in *[!0-9:]*|:*) return 1 ;; esac
  [ "$loaded" -ge "$activated" ] || return 1

  cli_expected="$(read_receipt pipeline_sha256 || true)"
  hook_expected="$(read_receipt pipeline_hook_sha256 || true)"
  for file in pipeline pipeline-hook; do
    if [ "$file" = pipeline ]; then current="$cli_expected"; else current="$hook_expected"; fi
    [ -n "$current" ] || continue
    [ -f "$HOME/.local/bin/$file" ] && [ ! -L "$HOME/.local/bin/$file" ] || return 1
    [ "$(sha256_file "$HOME/.local/bin/$file")" = "$current" ] || return 1
  done

  remove_legacy_registration || return 1
  [ -z "$cli_expected" ] || rm "$HOME/.local/bin/pipeline"
  [ -z "$hook_expected" ] || rm "$HOME/.local/bin/pipeline-hook"
  write_receipt completed "$activated" "$cli_expected" "$hook_expected"
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
args=("--$HOST")
[ "$MODE" = "auto" ] && args+=(--auto-update)
if bash "$ROOT/tenon-install.sh" "${args[@]}"; then
  [ -x "$HOME/.local/bin/tenon" ] && tenon_present || {
    printf 'Tenon install returned without a verified launcher/inventory entry; preserving legacy registration.\n'
    exit 1
  }
  write_receipt cleanup-pending "$activated" "$cli_hash" "$hook_hash"
  printf 'Tenon activated. Open a new %s session; the bridge will remove the legacy identity only after session proof.\n' "$HOST"
fi
