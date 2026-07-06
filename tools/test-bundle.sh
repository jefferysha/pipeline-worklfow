#!/usr/bin/env bash
# test-bundle.sh — esbuild 单文件分发冒烟（BACKLOG #8）。
# 断言：
#   1. packages/cli/dist/pipeline.mjs 存在（npm run build 产出）且首行 shebang
#   2. 单文件自足：不 import 'commander'/@pipeline-lite（全部内联），只留 node: 内建
#   3. 端到端上手路径：临时目录 init → .pipeline.yaml 落盘 → get phase = open
#      → transition open-complete → get phase = explore → history JSONL 有 init+transition
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/packages/cli/dist/pipeline.mjs"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok   - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL - %s（%s）\n' "$1" "${2:-}"; }

# 1. 产物存在 + shebang
if [ -f "$BUNDLE" ]; then ok "bundle: pipeline.mjs 存在"; else bad "bundle: pipeline.mjs 存在" "先 npm run build"; fi
if [ -f "$BUNDLE" ] && head -1 "$BUNDLE" | grep -q '^#!/usr/bin/env node'; then
  ok "bundle: 首行 shebang"
else bad "bundle: 首行 shebang" "$(head -1 "$BUNDLE" 2>/dev/null || echo 缺文件)"; fi

# 2. 自足性：不残留对 npm 包的运行时 import（node: 内建豁免）
if [ -f "$BUNDLE" ]; then
  leftover="$(grep -Eo 'from *"(commander|@pipeline-lite/[a-z]+)"' "$BUNDLE" | head -3 || true)"
  if [ -z "$leftover" ]; then ok "bundle: commander/@pipeline-lite 已内联"; else bad "bundle: commander/@pipeline-lite 已内联" "$leftover"; fi
fi

# 3. 端到端上手路径（真跑 bundle）
if [ -f "$BUNDLE" ]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  ( cd "$TMP" && node "$BUNDLE" init t8-smoke --track backend --preset full --user smoke ) 2>/dev/null
  [ -f "$TMP/openspec/changes/t8-smoke/.pipeline.yaml" ] \
    && ok "bundle: init 落盘 .pipeline.yaml" || bad "bundle: init 落盘 .pipeline.yaml" "文件缺失"
  phase="$(cd "$TMP" && node "$BUNDLE" get t8-smoke phase 2>/dev/null)"
  [ "$phase" = "open" ] && ok "bundle: get phase = open" || bad "bundle: get phase = open" "得到 '$phase'"
  ( cd "$TMP" && node "$BUNDLE" transition t8-smoke open-complete ) 2>/dev/null
  phase="$(cd "$TMP" && node "$BUNDLE" get t8-smoke phase 2>/dev/null)"
  [ "$phase" = "explore" ] && ok "bundle: transition 后 phase = explore" || bad "bundle: transition 后 phase = explore" "得到 '$phase'"
  hist="$TMP/openspec/changes/t8-smoke/.pipeline-history.jsonl"
  if [ -f "$hist" ] && grep -q '"kind":"init"' "$hist" && grep -q '"kind":"transition"' "$hist"; then
    ok "bundle: history JSONL 记 init+transition"
  else bad "bundle: history JSONL 记 init+transition" "$(cat "$hist" 2>/dev/null | head -2 || echo 缺文件)"; fi
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
