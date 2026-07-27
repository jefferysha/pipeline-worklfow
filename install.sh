#!/usr/bin/env bash
# install.sh — bootstrap the complete Tenon plugin for one selected host.
#
# This script is part of the same repository release, not a second package manager.  Once the
# native plugin is installed, all routine setup is the normal `tenon setup --<host>` interface.
set -euo pipefail

MARKETPLACE_SOURCE="jefferysha/tenon"
MARKETPLACE_NAME="tenon"
HOST=""
AUTO_UPDATE=0
DRY_RUN=0
MARKETPLACE_REF="main"

usage() {
  cat <<'USAGE'
Usage: install.sh --codex|--claude [--ref <main|vX.Y.Z|commit>] [--auto-update] [--dry-run]

Installs the complete Tenon plugin into the selected native marketplace, then runs the packaged
`tenon setup --<host>`. Other hosts are adapters and should be deployed from an
already installed Codex or Claude package with `tenon setup --cursor` (and similar flags).
`--dry-run` prints the complete host and packaged setup plan without invoking either host.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --codex|--claude)
      [ -z "$HOST" ] || { echo "install.sh: choose exactly one host" >&2; exit 2; }
      HOST="${1#--}"
      ;;
    --auto-update) AUTO_UPDATE=1 ;;
    --ref)
      [ $# -ge 2 ] || { echo "install.sh: --ref requires a value" >&2; exit 2; }
      MARKETPLACE_REF="$2"
      shift
      ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install.sh: unsupported argument $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
[ -n "$HOST" ] || { usage >&2; exit 2; }
[[ "$MARKETPLACE_REF" =~ ^(main|v[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.]+)?|[0-9a-f]{40})$ ]] || {
  echo "install.sh: invalid --ref $MARKETPLACE_REF" >&2
  exit 2
}
[ "$HOST" = codex ] || [ "$MARKETPLACE_REF" = main ] || {
  echo "install.sh: --ref is supported only for Codex Marketplace installs" >&2
  exit 2
}

if [ "$DRY_RUN" = 1 ]; then
  echo "[dry-run] Tenon --${HOST} 一步安装计划："
  case "$HOST" in
    codex)
      echo "  codex plugin marketplace add ${MARKETPLACE_SOURCE} --ref ${MARKETPLACE_REF}"
      echo "  codex plugin add tenon@${MARKETPLACE_NAME} --json"
      echo "  codex plugin list --json"
      ;;
    claude)
      echo "  claude plugin marketplace add ${MARKETPLACE_SOURCE}"
      echo "  claude plugin install tenon@${MARKETPLACE_NAME}"
      echo "  claude plugin list --json"
      ;;
  esac
  SETUP_PLAN="tenon setup --${HOST} --yes --dry-run"
  [ "$AUTO_UPDATE" = 1 ] && SETUP_PLAN="${SETUP_PLAN} --auto-update"
  echo "  ${SETUP_PLAN}"
  echo "[dry-run] 未调用宿主命令，未写入 Tenon 或项目状态。"
  exit 0
fi

find_codex_root() {
  codex plugin list --json | node -e '
    let text=""; process.stdin.on("data", c => { text += c }); process.stdin.on("end", () => {
      try {
        const entries = JSON.parse(text).installed ?? [];
        const hit = entries.find((x) => x?.name === "tenon" && x?.marketplaceName === "tenon");
        if (typeof hit?.source?.path === "string") process.stdout.write(hit.source.path);
      } catch {}
    });'
}

find_claude_root() {
  claude plugin list --json | node -e '
    let text=""; process.stdin.on("data", c => { text += c }); process.stdin.on("end", () => {
      try {
        const entries = JSON.parse(text);
        const hit = entries.find((x) => x?.id === "tenon@tenon");
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
    add_marketplace codex plugin marketplace add "$MARKETPLACE_SOURCE" --ref "$MARKETPLACE_REF"
    if ! codex plugin add "tenon@${MARKETPLACE_NAME}" --json; then
      ROOT="$(find_codex_root)"
      [ -n "$ROOT" ] || {
        echo "install.sh: Codex could not install tenon and no existing installation was found." >&2
        exit 1
      }
    fi
    ROOT="$(find_codex_root)"
    ;;
  claude)
    add_marketplace claude plugin marketplace add "$MARKETPLACE_SOURCE"
    if ! claude plugin install "tenon@${MARKETPLACE_NAME}"; then
      ROOT="$(find_claude_root)"
      [ -n "$ROOT" ] || {
        echo "install.sh: Claude could not install tenon and no existing installation was found." >&2
        exit 1
      }
    fi
    ROOT="$(find_claude_root)"
    ;;
esac

[ -n "${ROOT:-}" ] && [ -f "$ROOT/packages/cli/dist/tenon.mjs" ] || {
  echo "install.sh: plugin installed but its CLI bundle could not be resolved; run the host's plugin list and retry." >&2
  exit 1
}

ARGS=(setup "--${HOST}" --yes)
[ "$AUTO_UPDATE" = 1 ] && ARGS+=(--auto-update)
node "$ROOT/packages/cli/dist/tenon.mjs" "${ARGS[@]}"
if [ "$HOST" = "codex" ]; then
  echo "Codex requires one local hook trust: open Codex, run /hooks, and trust tenon to enable normal-chat routing."
fi
echo "Tenon installed for --${HOST}. Open a new host session to load its packaged skills and hooks."
