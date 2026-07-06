#!/usr/bin/env bash
# test-hooks.sh — T5 验收断言（plan ①-④）。sh 测试，不依赖 vitest。
#
# 覆盖：
#   1. gate.sh marker 三态 exit 语义（新鲜=2 / 陈旧=0 / 缺失=0），三个 marker 名都测
#   2. gate.sh 解析失败 fail-open（exit 0）+ marker 在 cwd 上层目录也能拦（上溯语义）
#   3. 红线自证：gate.sh / breadcrumb.sh / session-start.sh 内 grep -c "node" 为 0（python 同）
#   4. breadcrumb.sh：多缓存取 mtime 最新 / 无缓存静默 exit 0
#   5. verify-skills.sh：真实清单全绿；人为埋悬空引用（缺失脚本/不可执行/缺 SKILL.md/未声明外部 skill）抓红且逐条列出
#   6. 插件清单 JSON 语法校验（plugin.json / hooks.json，经 node —— 测试脚本非 hook，允许）
#   7. session-start.sh：正常输出引导 exit 0；verify 失败时 stderr 警告但不阻断（fail-open）
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$ROOT/hooks/gate.sh"
BC="$ROOT/hooks/breadcrumb.sh"
SS="$ROOT/hooks/session-start.sh"
VS="$ROOT/tools/verify-skills.sh"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/test-hooks.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); printf 'ok   - %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL - %s\n       %s\n' "$1" "${2:-}"; }
assert_exit() { # desc expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "期望 exit ${2}，实得 ${3}"; fi
}
assert_contains() { # desc haystack needle
  case "$2" in *"$3"*) ok "$1" ;; *) bad "$1" "输出未包含「${3}」；实际输出：${2}" ;; esac
}
assert_empty() { # desc value
  if [ -z "$2" ]; then ok "$1"; else bad "$1" "期望空输出，实得：${2}"; fi
}

# 前置：被测文件必须存在（TDD 红阶段在此直接倒）
for f in "$GATE" "$BC" "$SS" "$VS"; do
  [ -f "$f" ] || { bad "存在性: $f" "文件不存在"; }
done
if [ "$FAIL" -gt 0 ]; then
  printf '\n%d passed, %d failed（被测脚本缺失，先实现再跑）\n' "$PASS" "$FAIL"
  exit 1
fi

run_gate() { # $1=stdin-json → 设 RC / ERR（stderr）
  ERR="$(printf '%s' "$1" | bash "$GATE" 2>&1 >/dev/null)"
  RC=$?
}

# ───────────────────────── 1. gate.sh marker 三态 ─────────────────────────
for m in confirm review interaction; do
  proj="$TMP/gate-fresh-$m"
  mkdir -p "$proj"
  touch "$proj/.pipeline-pending-$m"
  run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}"
  assert_exit "gate: 新鲜 .pipeline-pending-$m → exit 2" 2 "$RC"
  [ -n "$ERR" ] && ok "gate: 新鲜 $m 时 stderr 有中文指引" || bad "gate: 新鲜 $m 时 stderr 有中文指引" "stderr 为空"
  assert_contains "gate: 指引提到 AskUserQuestion（${m}）" "$ERR" "AskUserQuestion"
done

proj="$TMP/gate-stale"
mkdir -p "$proj"
touch "$proj/.pipeline-pending-review"
touch -t 202001010000 "$proj/.pipeline-pending-review"
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Edit\"}"
assert_exit "gate: 陈旧 marker（mtime≥15min）→ exit 0" 0 "$RC"

proj="$TMP/gate-none"
mkdir -p "$proj"
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Bash\"}"
assert_exit "gate: 无 marker → exit 0" 0 "$RC"

# ─────────────── 2. gate.sh fail-open + 上溯找 marker ───────────────
proj="$TMP/gate-badjson"
mkdir -p "$proj"
( cd "$proj" && printf 'this is not json at all' | bash "$GATE" >/dev/null 2>&1 )
assert_exit "gate: stdin 非 JSON → fail-open exit 0" 0 "$?"

( cd "$proj" && printf '' | bash "$GATE" >/dev/null 2>&1 )
assert_exit "gate: stdin 为空 → fail-open exit 0" 0 "$?"

proj="$TMP/gate-updir"
mkdir -p "$proj/sub/deep"
touch "$proj/.pipeline-pending-confirm"
run_gate "{\"cwd\":\"$proj/sub/deep\",\"tool_name\":\"Write\"}"
assert_exit "gate: marker 在 cwd 上层（项目根）也拦 → exit 2" 2 "$RC"

# ───────────────────────── 3. 红线自证：热路径纯 bash ─────────────────────────
for f in "$GATE" "$BC" "$SS"; do
  base="$(basename "$f")"
  n="$(grep -c "node" "$f" || true)"
  [ "$n" = "0" ] && ok "红线: $base 内 grep -c \"node\" 为 0" || bad "红线: $base 内 grep -c \"node\" 为 0" "实得 ${n} 行"
  n="$(grep -c "python" "$f" || true)"
  [ "$n" = "0" ] && ok "红线: $base 内无 python" || bad "红线: $base 内无 python" "实得 ${n} 行"
done
for f in "$GATE" "$BC"; do
  base="$(basename "$f")"
  n="$(grep -c "jq" "$f" || true)"
  [ "$n" = "0" ] && ok "红线: $base 不依赖 jq" || bad "红线: $base 不依赖 jq" "实得 ${n} 行"
done

# ───────────────────────── 4. breadcrumb.sh ─────────────────────────
proj="$TMP/bc-proj"
mkdir -p "$proj/openspec/changes/aaa-old" "$proj/openspec/changes/bbb-new"
printf 'OLD-CRUMB\n' > "$proj/openspec/changes/aaa-old/.breadcrumb"
touch -t 202001010000 "$proj/openspec/changes/aaa-old/.breadcrumb"
printf 'NEW-CRUMB\n' > "$proj/openspec/changes/bbb-new/.breadcrumb"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$BC" 2>/dev/null)"
rc=$?
assert_exit "breadcrumb: 有缓存 → exit 0" 0 "$rc"
if [ "$out" = "NEW-CRUMB" ]; then ok "breadcrumb: cat mtime 最新的一个"; else bad "breadcrumb: cat mtime 最新的一个" "期望 NEW-CRUMB，实得：${out}"; fi

proj="$TMP/bc-none"
mkdir -p "$proj/openspec/changes/empty-change"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$BC" 2>/dev/null)"
rc=$?
assert_exit "breadcrumb: 无缓存 → 静默 exit 0" 0 "$rc"
assert_empty "breadcrumb: 无缓存 → 无输出" "$out"

# ───────────────────────── 5. verify-skills.sh ─────────────────────────
out="$(bash "$VS" 2>&1)"
rc=$?
assert_exit "verify-skills: 当前真实清单全绿 → exit 0" 0 "$rc"
[ "$rc" = 0 ] || printf '       verify 输出：%s\n' "$out"

out="$(bash "$VS" --quiet 2>&1)"
rc=$?
assert_exit "verify-skills: --quiet 成功 → exit 0" 0 "$rc"
assert_empty "verify-skills: --quiet 成功时无输出" "$out"

# 人为埋悬空引用的 sandbox
SB="$TMP/sandbox"
mkdir -p "$SB/.claude-plugin" "$SB/hooks" "$SB/skills/broken-skill" "$SB/skills/ok-skill" "$SB/tools"
printf '{ "name": "sandbox-plugin", "description": "t", "version": "0.0.0" }\n' > "$SB/.claude-plugin/plugin.json"
cat > "$SB/hooks/hooks.json" <<'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/missing.sh\"" },
          { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/noexec.sh\"" }
        ]
      }
    ]
  }
}
EOF
printf '#!/usr/bin/env bash\nexit 0\n' > "$SB/hooks/noexec.sh"   # 重定向落盘默认无 x 位
chmod -x "$SB/hooks/noexec.sh" 2>/dev/null || true
{
  printf -- '---\nname: ok-skill\ndescription: t\n---\n\n'
  printf 'external-skill: superpowers:nonexistent-thing\n'
} > "$SB/skills/ok-skill/SKILL.md"
# broken-skill 目录故意不放 SKILL.md；EXTERNAL-SKILLS.md 故意不建

out="$(bash "$VS" --root "$SB" 2>&1)"
rc=$?
assert_exit "verify-skills: 悬空引用 sandbox → exit 1" 1 "$rc"
assert_contains "verify-skills: 列出缺失脚本 missing.sh" "$out" "missing.sh"
assert_contains "verify-skills: 列出不可执行 noexec.sh" "$out" "noexec.sh"
assert_contains "verify-skills: 列出缺 SKILL.md 的 broken-skill" "$out" "broken-skill"
assert_contains "verify-skills: 列出未声明外部 skill" "$out" "superpowers:nonexistent-thing"
assert_contains "verify-skills: 给出修复指引（怎么修）" "$out" "修"

# ─────────────── 6. 插件清单 JSON 语法（plan ③，测试脚本可用 node）───────────────
if command -v node >/dev/null 2>&1; then
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$ROOT/.claude-plugin/plugin.json" 2>/dev/null
  assert_exit "plugin.json 是合法 JSON" 0 "$?"
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (!j.name || !j.description || !j.version) process.exit(1);
  ' "$ROOT/.claude-plugin/plugin.json" 2>/dev/null
  assert_exit "plugin.json 含 name/description/version（marketplace 最小面）" 0 "$?"
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (typeof j.hooks !== "object" || j.hooks === null) process.exit(1);
    for (const arr of Object.values(j.hooks))
      for (const entry of arr)
        for (const h of entry.hooks)
          if (h.type !== "command" || !h.command) process.exit(1);
  ' "$ROOT/hooks/hooks.json" 2>/dev/null
  assert_exit "hooks.json 结构对齐老仓（hooks.<Event>[].hooks[].command）" 0 "$?"
else
  printf 'skip - node 不可用，跳过 JSON 语法校验\n'
fi

# ───────────────────────── 7. session-start.sh ─────────────────────────
out="$(printf '{"cwd":"%s"}' "$ROOT" | bash "$SS" 2>"$TMP/ss.err")"
rc=$?
assert_exit "session-start: 正常 → exit 0" 0 "$rc"
[ -n "$out" ] && ok "session-start: 输出简短引导" || bad "session-start: 输出简短引导" "stdout 为空"
assert_contains "session-start: 引导提到 7 相位/pipeline" "$out" "pipeline"
err="$(cat "$TMP/ss.err")"
assert_empty "session-start: 真实清单绿 → 无警告" "$err"

# fail-open：把 session-start + verify-skills 拷进悬空 sandbox，verify 必红但 hook 不阻断
mkdir -p "$SB/tools"
cp "$SS" "$SB/hooks/session-start.sh"
cp "$VS" "$SB/tools/verify-skills.sh"
chmod +x "$SB/hooks/session-start.sh" "$SB/tools/verify-skills.sh"
out="$(printf '{}' | CLAUDE_PLUGIN_ROOT="$SB" bash "$SB/hooks/session-start.sh" 2>"$TMP/ss2.err")"
rc=$?
assert_exit "session-start: verify 失败 → 仍 exit 0（fail-open）" 0 "$rc"
err="$(cat "$TMP/ss2.err")"
assert_contains "session-start: verify 失败 → stderr 有警告" "$err" "警告"

# ───────────────────────── 汇总 ─────────────────────────
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
