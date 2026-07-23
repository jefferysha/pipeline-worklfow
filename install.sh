#!/usr/bin/env bash
# install.sh — bootstrap the one pipeline plugin for a selected host.
#
# This script is part of the same repository release, not a second package manager.  Once the
# native plugin is installed, all routine setup is the normal `pipeline setup --<host>` interface.
set -euo pipefail

MARKETPLACE_SOURCE="jefferysha/pipeline-worklfow"
MARKETPLACE_NAME="pipeline-lite"
HOST=""
AUTO_UPDATE=0

usage() {
  cat <<'USAGE'
Usage: install.sh --codex|--claude [--auto-update]

Installs the single pipeline-lite plugin into the selected native marketplace, then runs the
packaged `pipeline setup --<host>`.  Other hosts are adapters and should be deployed from an
already installed Codex or Claude package with `pipeline setup --cursor` (and similar flags).
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --codex|--claude)
      [ -z "$HOST" ] || { echo "install.sh: choose exactly one host" >&2; exit 2; }
      HOST="${1#--}"
      ;;
    --auto-update) AUTO_UPDATE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install.sh: unsupported argument $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
[ -n "$HOST" ] || { usage >&2; exit 2; }

find_codex_root() {
  codex plugin list --json | node -e '
    let text=""; process.stdin.on("data", c => { text += c }); process.stdin.on("end", () => {
      try {
        const entries = JSON.parse(text).installed ?? [];
        const hit = entries.find((x) => x?.name === "pipeline-lite" && x?.marketplaceName === "pipeline-lite");
        if (typeof hit?.source?.path === "string") process.stdout.write(hit.source.path);
      } catch {}
    });'
}

find_claude_root() {
  claude plugin list --json | node -e '
    let text=""; process.stdin.on("data", c => { text += c }); process.stdin.on("end", () => {
      try {
        const entries = JSON.parse(text);
        const hit = entries.find((x) => x?.id === "pipeline-lite@pipeline-lite");
        if (typeof hit?.installPath === "string") process.stdout.write(hit.installPath);
      } catch {}
    });'
}

add_marketplace() {
  local output rc
  if output="$("$@" 2>&1)"; then
    [ -z "$output" ] || printf '%s\n' "$output"
    return 0
  fi
  rc=$?
  [ -z "$output" ] || printf '%s\n' "$output" >&2
  if printf '%s' "$output" | grep -Eqi 'already|exists|registered|duplicate'; then
    return 0
  fi
  return "$rc"
}

case "$HOST" in
  codex)
    add_marketplace codex plugin marketplace add "$MARKETPLACE_SOURCE" --ref main
    if ! codex plugin add "pipeline-lite@${MARKETPLACE_NAME}" --json; then
      ROOT="$(find_codex_root)"
      [ -n "$ROOT" ] || {
        echo "install.sh: Codex could not install pipeline-lite and no existing installation was found." >&2
        exit 1
      }
    fi
    ROOT="$(find_codex_root)"
    ;;
  claude)
    add_marketplace claude plugin marketplace add "$MARKETPLACE_SOURCE"
    if ! claude plugin install "pipeline-lite@${MARKETPLACE_NAME}"; then
      ROOT="$(find_claude_root)"
      [ -n "$ROOT" ] || {
        echo "install.sh: Claude could not install pipeline-lite and no existing installation was found." >&2
        exit 1
      }
    fi
    ROOT="$(find_claude_root)"
    ;;
esac

[ -n "${ROOT:-}" ] && [ -f "$ROOT/packages/cli/dist/pipeline.mjs" ] || {
  echo "install.sh: plugin installed but its CLI bundle could not be resolved; run the host's plugin list and retry." >&2
  exit 1
}

ARGS=(setup "--${HOST}" --yes)
[ "$AUTO_UPDATE" = 1 ] && ARGS+=(--auto-update)
node "$ROOT/packages/cli/dist/pipeline.mjs" "${ARGS[@]}"
if [ "$HOST" = "codex" ]; then
  echo "Codex requires one local hook trust: open Codex, run /hooks, and trust pipeline-lite to enable normal-chat routing."
fi
echo "Pipeline installed for --${HOST}. Open a new host session to load its packaged skills and hooks."
