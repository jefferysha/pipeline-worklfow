#!/bin/bash
set -euo pipefail

TOOL_ROOT="${1:-}"
case "$TOOL_ROOT" in
  /*) ;;
  *) echo "usage: prepare-trusted-codex-acceptance.sh <absolute-tool-root>" >&2; exit 2 ;;
esac

NODE_SOURCE="$(command -v node)"
case "$NODE_SOURCE" in
  /*) ;;
  *) echo "trusted Codex acceptance requires an absolute Node executable" >&2; exit 3 ;;
esac

mkdir -p "$TOOL_ROOT/bin"
npm install \
  --prefix "$TOOL_ROOT" \
  --no-save \
  --no-package-lock \
  @openai/codex@0.144.1 >&2
cp "$NODE_SOURCE" "$TOOL_ROOT/bin/node"
chmod 0755 "$TOOL_ROOT/bin/node"
ln -sfn ../node_modules/.bin/codex "$TOOL_ROOT/bin/codex"

printf '%s\n' "$TOOL_ROOT/bin"
