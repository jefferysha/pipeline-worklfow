#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
META="$ROOT/tools/fixtures/n-minus-one-release.json"
OUTPUT_ROOT="${1:?usage: prepare-n-minus-one-release.sh <empty-output-root>}"
PAYLOAD="$OUTPUT_ROOT/payload"

if [ -e "$PAYLOAD" ]; then
  printf 'N-1 payload 目标已存在，拒绝混入旧文件: %s\n' "$PAYLOAD" >&2
  exit 1
fi

commit="$(node -p "require('$META').gitCommit")"
expected_cli="$(node -p "require('$META').cliSha256")"
cli_entry="$(node -p "require('$META').cliEntry")"
release="$(node -p "require('$META').releaseId + ' plugin@' + require('$META').pluginVersion")"
entries=()
while IFS= read -r entry; do
  [ -n "$entry" ] && entries+=("$entry")
done < <(node -e '
  const value = require(process.argv[1])
  if (!Array.isArray(value.payloadEntries) || value.payloadEntries.length === 0) process.exit(2)
  for (const entry of value.payloadEntries) {
    if (typeof entry !== "string" || entry === "" || entry.startsWith("/") || entry.includes("..")) process.exit(3)
    process.stdout.write(`${entry}\n`)
  }
' "$META")

case "$cli_entry" in
  ""|/*|*".."*)
    printf 'N-1 CLI 入口非法: %s\n' "$cli_entry" >&2
    exit 1
    ;;
esac
printf '%s\n' "${entries[@]}" | grep -Fxq "$cli_entry" || {
  printf 'N-1 CLI 入口未包含在 payload 闭集: %s\n' "$cli_entry" >&2
  exit 1
}

git -C "$ROOT" cat-file -e "$commit^{commit}"
mkdir -p "$PAYLOAD"
git -C "$ROOT" archive "$commit" -- "${entries[@]}" | tar -x -C "$PAYLOAD"

for entry in "${entries[@]}"; do
  [ -e "$PAYLOAD/$entry" ] || {
    printf 'N-1 payload 缺少固定入口: %s\n' "$entry" >&2
    exit 1
  }
done

cli="$PAYLOAD/$cli_entry"
actual_cli="$(node -e '
  const { createHash } = require("node:crypto")
  const { readFileSync } = require("node:fs")
  process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))
' "$cli")"
[ "$actual_cli" = "$expected_cli" ] || {
  printf 'N-1 CLI 摘要不匹配: expected=%s actual=%s\n' "$expected_cli" "$actual_cli" >&2
  exit 1
}

printf 'N-1 release ready: %s\n' "$release"
printf 'N-1 CLI: %s\n' "$cli"
