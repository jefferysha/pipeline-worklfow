#!/usr/bin/env bash
# test-bundle.sh — esbuild 单文件分发冒烟（BACKLOG #8）。
# 断言：
#   1. CLI/dashboard server/SPA 三组发布产物存在（npm run build 产出）
#   2. CLI 单文件自足：不 import 'commander'/@pipeline-lite（全部内联），只留 node: 内建
#   3. CLI 能从打包根发现 dashboard 并通过 dry-run 验证，不依赖 npm/npx/node_modules
#   4. 端到端上手路径：临时目录 init → .pipeline.yaml 落盘 → get phase = open
#      → 登记随 init 生成的 OpenSpec proposal/design/tasks 的真实 skill 证据
#      → transition open-complete → get phase = explore → history JSONL 有 init+transition
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/packages/cli/dist/pipeline.mjs"
DASHBOARD_SERVER="$ROOT/packages/server/dist/dashboard.mjs"
DASHBOARD_INDEX="$ROOT/packages/dashboard-app/dist/index.html"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok   - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL - %s（%s）\n' "$1" "${2:-}"; }

# 1. 产物存在 + shebang
if [ -f "$BUNDLE" ]; then ok "bundle: pipeline.mjs 存在"; else bad "bundle: pipeline.mjs 存在" "先 npm run build"; fi
if [ -f "$BUNDLE" ] && head -1 "$BUNDLE" | grep -q '^#!/usr/bin/env node'; then
  ok "bundle: 首行 shebang"
else bad "bundle: 首行 shebang" "$(head -1 "$BUNDLE" 2>/dev/null || echo 缺文件)"; fi
[ -f "$DASHBOARD_SERVER" ] && ok "bundle: dashboard.mjs 存在" \
  || bad "bundle: dashboard.mjs 存在" "先 npm run build"
[ -f "$DASHBOARD_INDEX" ] && ok "bundle: dashboard SPA index.html 存在" \
  || bad "bundle: dashboard SPA index.html 存在" "先 npm run build"

# 2. 自足性：不残留对 npm 包的运行时 import（node: 内建豁免）
if [ -f "$BUNDLE" ]; then
  leftover="$(grep -Eo 'from *"(commander|@pipeline-lite/[a-z]+)"' "$BUNDLE" | head -3 || true)"
  if [ -z "$leftover" ]; then ok "bundle: commander/@pipeline-lite 已内联"; else bad "bundle: commander/@pipeline-lite 已内联" "$leftover"; fi
fi

# 3. `pipeline dashboard` 必须从同一个发布包找到 server + SPA，不能再回退到 npx 或源码 build。
if [ -f "$BUNDLE" ] && [ -f "$DASHBOARD_SERVER" ] && [ -f "$DASHBOARD_INDEX" ]; then
  dashboard_out="$(node "$BUNDLE" dashboard --dry-run 2>&1)"
  if [ "$?" -eq 0 ] && printf '%s' "$dashboard_out" | grep -q '插件内置 SPA + server bundle'; then
    ok "bundle: pipeline dashboard --dry-run 使用随包完整 runtime"
  else
    bad "bundle: pipeline dashboard --dry-run 使用随包完整 runtime" "$dashboard_out"
  fi
fi

# 4. 端到端上手路径（真跑 bundle）
if [ -f "$BUNDLE" ]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  ( cd "$TMP" && PIPELINE_DASHBOARD_HOME="$TMP/.pipeline-dashboard-home" node "$BUNDLE" init t8-smoke --track backend --preset full --user smoke ) 2>/dev/null
  [ -f "$TMP/openspec/changes/t8-smoke/.pipeline.yaml" ] \
    && ok "bundle: init 落盘 .pipeline.yaml" || bad "bundle: init 落盘 .pipeline.yaml" "文件缺失"
  phase="$(cd "$TMP" && node "$BUNDLE" get t8-smoke phase 2>/dev/null)"
  [ "$phase" = "open" ] && ok "bundle: get phase = open" || bad "bundle: get phase = open" "得到 '$phase'"

  # Evidence is intentionally attached only after an explicit target selection.  This is the same
  # `pipeline` entry-skill sequence used by normal conversations, and prevents an mtime-selected
  # old Change from satisfying this new bundle smoke Change.
  ( cd "$TMP" && node "$BUNDLE" session activate t8-smoke ) >/dev/null 2>&1
  [ "$?" -eq 0 ] \
    && ok "bundle: session activate 绑定 t8-smoke" \
    || bad "bundle: session activate 绑定 t8-smoke" "activate 失败"

  # default workflow 的 OpenSpec 文档契约要求 open 阶段先登记 proposal/design/tasks。它们是 init
  # 创建的最小骨架；这里通过真实 CLI 绑定产物 hash 和 openspec-propose skill 证据，证明入库 bundle
  # 同时包含新文档链路，而不是把冒烟测试回退成历史上的无证据直转。先调用同包的 PostToolUse
  # skill tracker 生成真实的 `Skill: openspec-propose` 审计行；document record 会验证这条证据。
  printf '{"cwd":"%s","tool_name":"Skill","skill":"openspec-propose"}' "$TMP" \
    | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ROOT/hooks/skill-tracker.sh" >/dev/null 2>&1
  [ "$?" -eq 0 ] \
    && ok "bundle: hook 记录 openspec-propose 调用证据" \
    || bad "bundle: hook 记录 openspec-propose 调用证据" "skill-tracker 失败"
  for row in \
    'proposal proposal.md' \
    'openspec-design design.md' \
    'tasks tasks.md'; do
    kind="${row%% *}"
    file="${row#* }"
    ( cd "$TMP" && node "$BUNDLE" document record t8-smoke "$kind" "openspec/changes/t8-smoke/$file" --producer openspec-propose ) 2>/dev/null
    [ "$?" -eq 0 ] \
      && ok "bundle: 登记 $kind 文档证据" \
      || bad "bundle: 登记 $kind 文档证据" "document record 失败"
  done
  ( cd "$TMP" && node "$BUNDLE" transition t8-smoke open-complete ) 2>"$TMP/transition.err"
  phase="$(cd "$TMP" && node "$BUNDLE" get t8-smoke phase 2>/dev/null)"
  [ "$phase" = "explore" ] && ok "bundle: transition 后 phase = explore" || bad "bundle: transition 后 phase = explore" "得到 '$phase'; $(cat "$TMP/transition.err" 2>/dev/null)"
  hist="$TMP/openspec/changes/t8-smoke/.pipeline-history.jsonl"
  if [ -f "$hist" ] && grep -q '"kind":"init"' "$hist" && grep -q '"kind":"transition"' "$hist"; then
    ok "bundle: history JSONL 记 init+transition"
  else bad "bundle: history JSONL 记 init+transition" "$(cat "$hist" 2>/dev/null | head -2 || echo 缺文件)"; fi
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
