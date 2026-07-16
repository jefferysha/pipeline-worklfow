#!/usr/bin/env bash
# test-hooks.sh — T5 验收断言（plan ①-④）。sh 测试，不依赖 vitest。
#
# 覆盖：
#   1. gate.sh marker 三态 exit 语义（新鲜=2 / 陈旧=0 / 缺失=0），三个 marker 名都测
#   2. gate.sh 解析失败 fail-open（exit 0）+ marker 在 cwd 上层目录也能拦（上溯语义）
#   3. 红线自证：breadcrumb.sh / session-start.sh / statusline.sh 内 grep -c "node" 为 0；gate.sh
#      例外，反向断言它**必须**仍引用 node（Task 9 非 default workflow 的 skill DAG 委托分支，
#      见下方 section 3 注释）。python 红线四个文件全覆盖（含 gate.sh）；jq 红线覆盖 gate/bc/sl
#   4. breadcrumb.sh：多缓存取 mtime 最新 / 无缓存静默 exit 0
#   5. verify-skills.sh：真实清单全绿；人为埋悬空引用（缺失脚本/不可执行/缺 SKILL.md/未声明外部 skill）抓红且逐条列出
#   6. 插件清单 JSON 语法校验（plugin.json / hooks.json，经 node —— 测试脚本非 hook，允许）
#   7. session-start.sh：正常输出引导 exit 0；verify 失败时 stderr 警告但不阻断（fail-open）
#  11. 阶段×hook 开关矩阵（v5 T5 / 决议#2，.pipeline/hooks.json）：配置关掉的 hook exit 0
#      零副作用；缺失/损坏 fail-open 到启用；gate/interactive-skill-gate 强制常开忽略配置
#  12. v6 T5 / 批2 P2-T2：session-start.sh AFK 首跑 + 技能就绪提示——.pipeline/automation.json 存在或
#      活跃 change 命中 automation 字段（非 off）时追加静态提示行；archived 排除；阶段×hook 开关优先；
#      纯静态提示（不做真探测）；批2 A1 已扩展 doctor，故提示回改指向 `pipeline doctor`
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
assert_exit "gate: 远古陈旧 marker → exit 0" 0 "$RC"

proj="$TMP/gate-none"
mkdir -p "$proj"
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Bash\"}"
assert_exit "gate: 无 marker → exit 0" 0 "$RC"

# ───── 1a. 门 TTL 分级（BACKLOG #13，对齐老内核 pipeline-gate.sh：confirm 300s / review·interaction 1800s） ─────
touch_age() { # $1=文件 $2=秒龄：把 mtime 设为 now-$2（BSD/GNU date 双兼容）
  local ts
  ts="$(date -v-"$2"S +%Y%m%d%H%M.%S 2>/dev/null || date -d "@$(( $(date +%s) - $2 ))" +%Y%m%d%H%M.%S 2>/dev/null)"
  touch -t "$ts" "$1"
}

proj="$TMP/gate-ttl"
mkdir -p "$proj"
# confirm：TTL 300s——301s 陈旧（退掉 15min 统一简化的核心断言）
touch "$proj/.pipeline-pending-confirm"; touch_age "$proj/.pipeline-pending-confirm" 301
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}"
assert_exit "gate: confirm marker 301s → 陈旧 exit 0（TTL 300s）" 0 "$RC"
[ ! -f "$proj/.pipeline-pending-confirm" ] \
  && ok "gate: 陈旧 confirm marker 被顺手清掉" \
  || bad "gate: 陈旧 confirm marker 被顺手清掉" "marker 仍存在"
# confirm：250s 仍新鲜
touch "$proj/.pipeline-pending-confirm"; touch_age "$proj/.pipeline-pending-confirm" 250
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}"
assert_exit "gate: confirm marker 250s → 新鲜 exit 2" 2 "$RC"
rm -f "$proj/.pipeline-pending-confirm"
# review：TTL 1800s——301s 仍新鲜（决策 phase 常 >5min，不许被 300s 误清）
touch "$proj/.pipeline-pending-review"; touch_age "$proj/.pipeline-pending-review" 301
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Edit\"}"
assert_exit "gate: review marker 301s → 仍新鲜 exit 2（TTL 1800s）" 2 "$RC"
# review：1000s（900<age<1800，直接证明 15min 统一简化已退场）仍新鲜
touch_age "$proj/.pipeline-pending-review" 1000
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Edit\"}"
assert_exit "gate: review marker 1000s → 仍新鲜 exit 2（>15min 也不失效）" 2 "$RC"
# review：1801s 陈旧
touch_age "$proj/.pipeline-pending-review" 1801
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Edit\"}"
assert_exit "gate: review marker 1801s → 陈旧 exit 0" 0 "$RC"
rm -f "$proj/.pipeline-pending-review"
# interaction：TTL 1800s——301s 新鲜、1801s 陈旧
touch "$proj/.pipeline-pending-interaction"; touch_age "$proj/.pipeline-pending-interaction" 301
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}"
assert_exit "gate: interaction marker 301s → 仍新鲜 exit 2（TTL 1800s）" 2 "$RC"
touch_age "$proj/.pipeline-pending-interaction" 1801
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}"
assert_exit "gate: interaction marker 1801s → 陈旧 exit 0" 0 "$RC"
rm -f "$proj/.pipeline-pending-interaction"

# ─────────── 1b. PIPELINE_AFK=1 逃生门（BACKLOG #7b，老内核沙箱放行语义） ───────────
proj="$TMP/gate-afk"
mkdir -p "$proj"
touch "$proj/.pipeline-pending-confirm"
printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}" | PIPELINE_AFK=1 bash "$GATE" >/dev/null 2>&1
assert_exit "gate: PIPELINE_AFK=1 + 新鲜 marker → 放行 exit 0" 0 "$?"
[ -f "$proj/.pipeline-pending-confirm" ] \
  && ok "gate: AFK 放行不清 marker（人回来门还在）" \
  || bad "gate: AFK 放行不清 marker（人回来门还在）" "marker 被误删"
printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}" | PIPELINE_AFK=true bash "$GATE" >/dev/null 2>&1
assert_exit "gate: PIPELINE_AFK=true（非 \"1\"）不放行 → exit 2" 2 "$?"

# ─────────────── 1c. statusline.sh（BACKLOG #10，热路径纯 bash） ───────────────
SL="$ROOT/hooks/statusline.sh"
if [ -f "$SL" ]; then
  # 非 pipeline 项目 → 输出空、exit 0
  proj="$TMP/sl-none"; mkdir -p "$proj"
  out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SL" 2>/dev/null)"
  assert_exit "statusline: 非 pipeline 项目 exit 0" 0 "$?"
  [ -z "$out" ] && ok "statusline: 非 pipeline 项目输出空" || bad "statusline: 非 pipeline 项目输出空" "得到 '$out'"
  # 活跃 change → 一行含 名字 + 相位
  proj="$TMP/sl-active"; mkdir -p "$proj/openspec/changes/demo"
  printf 'track: backend\nphase: explore\narchived: \n' > "$proj/openspec/changes/demo/.pipeline.yaml"
  out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SL" 2>/dev/null)"
  case "$out" in *demo*explore*) ok "statusline: 含 change 名与相位" ;; *) bad "statusline: 含 change 名与相位" "得到 '$out'" ;; esac
  # 新鲜门 marker → 含 等:<kind>
  touch "$proj/.pipeline-pending-confirm"
  out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SL" 2>/dev/null)"
  case "$out" in *等:confirm*) ok "statusline: 新鲜 marker 显示 等:confirm" ;; *) bad "statusline: 新鲜 marker 显示 等:confirm" "得到 '$out'" ;; esac
  # 门 TTL 分级（BACKLOG #13）：confirm 301s 不显示；review 1000s（>15min 统一简化区间）仍显示；review 1801s 不显示
  rm -f "$proj/.pipeline-pending-confirm"
  touch "$proj/.pipeline-pending-confirm"; touch_age "$proj/.pipeline-pending-confirm" 301
  out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SL" 2>/dev/null)"
  case "$out" in *等:confirm*) bad "statusline: confirm marker 301s 不显示（TTL 300s）" "得到 '$out'" ;; *) ok "statusline: confirm marker 301s 不显示（TTL 300s）" ;; esac
  rm -f "$proj/.pipeline-pending-confirm"
  touch "$proj/.pipeline-pending-review"; touch_age "$proj/.pipeline-pending-review" 1000
  out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SL" 2>/dev/null)"
  case "$out" in *等:review*) ok "statusline: review marker 1000s 仍显示 等:review（TTL 1800s）" ;; *) bad "statusline: review marker 1000s 仍显示 等:review（TTL 1800s）" "得到 '$out'" ;; esac
  touch_age "$proj/.pipeline-pending-review" 1801
  out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SL" 2>/dev/null)"
  case "$out" in *等:review*) bad "statusline: review marker 1801s 不显示（陈旧）" "得到 '$out'" ;; *) ok "statusline: review marker 1801s 不显示（陈旧）" ;; esac
  rm -f "$proj/.pipeline-pending-review"
  # archived change 不显示
  printf 'track: backend\nphase: archive\narchived: true\n' > "$proj/openspec/changes/demo/.pipeline.yaml"
  out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SL" 2>/dev/null)"
  [ -z "$out" ] && ok "statusline: archived change 不显示" || bad "statusline: archived change 不显示" "得到 '$out'"
else
  bad "statusline: hooks/statusline.sh 存在" "缺文件"
fi

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
# gate.sh 例外（Task 9，GOAL 清单 E）：非 default workflow 的 skill DAG 判定合法委托 CLI（spawn
# node），但**只**在该分支——workflow==='default' 这条最高频路径的零 spawn 承诺不变。文本 grep
# 只能证明"提到了 node"，证明不了"只在该分支才真 spawn"；后者由
# internal-skill-gate-hook.integration.test.ts 用真 bash 子进程 + 真 fixture 黑盒验证
# （default workflow / 无活跃 change / 非 Skill 调用 → 断言真实行为不受影响且真不 spawn），
# 比在这里 grep 源码文本更可靠，故 gate.sh 从下面的"零 node"红线里摘出、单独断言。
for f in "$BC" "$SS" "$SL"; do
  base="$(basename "$f")"
  n="$(grep -c "node" "$f" || true)"
  [ "$n" = "0" ] && ok "红线: $base 内 grep -c \"node\" 为 0" || bad "红线: $base 内 grep -c \"node\" 为 0" "实得 ${n} 行"
done
gate_node_n="$(grep -c "node" "$GATE" || true)"
if [ "$gate_node_n" -gt 0 ] 2>/dev/null; then
  ok "gate.sh 合法引用 node（仅非 default workflow 的 skill DAG 委托分支，Task 9；零 spawn 承诺见 internal-skill-gate-hook.integration.test.ts）"
else
  bad "gate.sh 合法引用 node（仅非 default workflow 的 skill DAG 委托分支，Task 9）" "实得 0 行——是否误删了 Task 9 分支？"
fi
for f in "$GATE" "$BC" "$SS" "$SL"; do
  base="$(basename "$f")"
  n="$(grep -c "python" "$f" || true)"
  [ "$n" = "0" ] && ok "红线: $base 内无 python" || bad "红线: $base 内无 python" "实得 ${n} 行"
done
for f in "$GATE" "$BC" "$SL"; do
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

# ─────────────── 8. SessionStart 三注入（BACKLOG #20：宪法 / pipeline 上下文 / openspec 提示） ───────────────
assert_not_contains() { # desc haystack needle
  case "$2" in *"$3"*) bad "$1" "输出不应包含「${3}」；实际输出：${2}" ;; *) ok "$1" ;; esac
}

# 8a. 宪法注入：templates/workflow.md 存在，且任意 cwd 下 stdout 都含 7 相位/三门/HITL/breadcrumb 关键词
WF="$ROOT/templates/workflow.md"
[ -f "$WF" ] && ok "三注入: templates/workflow.md 存在" || bad "三注入: templates/workflow.md 存在" "缺文件"
proj="$TMP/ss-plain"; mkdir -p "$proj"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
rc=$?
assert_exit "三注入: 普通目录 → exit 0" 0 "$rc"
assert_contains "三注入: 宪法含 7 相位链" "$out" "open → explore → spec → build ⇄ verify → ship → archive"
assert_contains "三注入: 宪法含三门语义" "$out" "三门"
assert_contains "三注入: 宪法含 HITL（AskUserQuestion）" "$out" "AskUserQuestion"
assert_contains "三注入: 宪法含 breadcrumb 约定" "$out" "breadcrumb"
assert_contains "三注入: 宪法引用新 CLI（pipeline transition）" "$out" "pipeline transition"

# 8b. pipeline 上下文注入：有活跃 change → 输出含 change 名 + 相位；archived 不列；新鲜门 marker 列出
proj="$TMP/ss-ctx"; mkdir -p "$proj/openspec/changes/demo-ss" "$proj/openspec/changes/done-ss"
printf 'track: backend\nphase: build\narchived: \n' > "$proj/openspec/changes/demo-ss/.pipeline.yaml"
printf 'track: pm\nphase: archive\narchived: true\n' > "$proj/openspec/changes/done-ss/.pipeline.yaml"
touch "$proj/.pipeline-pending-review"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
rc=$?
assert_exit "三注入: 活跃 change 项目 → exit 0" 0 "$rc"
assert_contains "三注入: 上下文含活跃 change 名" "$out" "demo-ss"
assert_contains "三注入: 上下文含相位" "$out" "phase=build"
assert_not_contains "三注入: archived change 不列出" "$out" "done-ss"
assert_contains "三注入: 新鲜门 marker 列出（review）" "$out" "等:review"
rm -f "$proj/.pipeline-pending-review"

# 8b'. 上下文注入从子目录 cwd 也能上溯到项目根（与 gate/breadcrumb 上溯对称）
mkdir -p "$proj/sub/deep"
out="$(printf '{"cwd":"%s/sub/deep"}' "$proj" | bash "$SS" 2>/dev/null)"
assert_contains "三注入: 子目录 cwd 上溯注入上下文" "$out" "demo-ss"

# 8c. openspec 提示：openspec 目录存在 → 输出使用提示；无 pipeline 项目 → 无上下文/提示但宪法照常
assert_contains "三注入: openspec 目录存在 → 使用提示" "$out" "openspec/changes/"
out="$(printf '{"cwd":"%s"}' "$TMP/ss-plain" | bash "$SS" 2>/dev/null)"
assert_not_contains "三注入: 无 pipeline 项目 → 不注入上下文" "$out" "demo-ss"
assert_contains "三注入: 无 pipeline 项目 → 宪法照常" "$out" "三门"

# 8d. 三步全 fail-open：sandbox 无 templates/ + 烂 .pipeline.yaml（不可读）→ 仍 exit 0、有基础引导
SB2="$TMP/ss-sandbox"
mkdir -p "$SB2/hooks" "$SB2/tools" "$SB2/proj/openspec/changes/broken"
cp "$SS" "$SB2/hooks/session-start.sh"
cp "$VS" "$SB2/tools/verify-skills.sh"
chmod +x "$SB2/hooks/session-start.sh" "$SB2/tools/verify-skills.sh"
printf 'phase: build\n' > "$SB2/proj/openspec/changes/broken/.pipeline.yaml"
chmod 000 "$SB2/proj/openspec/changes/broken/.pipeline.yaml" 2>/dev/null || true
out="$(printf '{"cwd":"%s/proj"}' "$SB2" | CLAUDE_PLUGIN_ROOT="$SB2" bash "$SB2/hooks/session-start.sh" 2>/dev/null)"
rc=$?
chmod 644 "$SB2/proj/openspec/changes/broken/.pipeline.yaml" 2>/dev/null || true
assert_exit "三注入: 缺模板+烂 yaml → 全 fail-open exit 0" 0 "$rc"
assert_contains "三注入: fail-open 时基础引导仍输出" "$out" "pipeline"

# ═══════════════ 9. router.sh（BACKLOG #19：UserPromptSubmit Track 评分 + breadcrumb 注入） ═══════════════
# 真实 e2e（C9）：真跑 router.sh 喂真 stdin JSON + 真 manifest 派生缓存（router-gen.mjs → kernel
# genRouterSh/breadcrumbs/skillsFor），断言真输出。缓存机制 mtime-gated：命中缓存零 node spawn（红线自证）。
R="$ROOT/hooks/router.sh"
RGEN="$ROOT/hooks/router-gen.mjs"
[ -f "$R" ]    && ok "router: hooks/router.sh 存在"          || bad "router: hooks/router.sh 存在" "缺文件"
[ -x "$R" ]    && ok "router: hooks/router.sh 可执行"        || bad "router: hooks/router.sh 可执行" "无 x 位"
[ -f "$RGEN" ] && ok "router: hooks/router-gen.mjs 存在（派生缓存生成器）" || bad "router: hooks/router-gen.mjs 存在（派生缓存生成器）" "缺文件"

# run_router：喂 stdin JSON，隔离缓存路径，用真实 plugin root（含 templates/manifest.yaml）
RCACHE="$TMP/router-cache.generated.sh"
run_router() { # $1=stdin-json [$2=cache-override] → 设 ROUT / RRC
  local cache="${2:-$RCACHE}"
  ROUT="$(printf '%s' "$1" | PIPELINE_ROUTER_CACHE="$cache" CLAUDE_PLUGIN_ROOT="$ROOT" bash "$R" 2>/dev/null)"
  RRC=$?
}

# ── 9a. 红线自证（无条件跑）：HOT PATH 标记以下的**可执行**行（剥注释）零 node/python spawn ──
below_exec="$(awk '/HOT PATH（每轮命中缓存/{f=1} f' "$R" | grep -vE '^[[:space:]]*#')"
n="$(printf '%s' "$below_exec" | grep -c 'node' || true)"
[ "$n" = "0" ] && ok "router 红线: HOT PATH 打分/source 段可执行行 grep node 为 0" || bad "router 红线: HOT PATH 打分/source 段可执行行 grep node 为 0" "实得 ${n} 行"
n="$(printf '%s' "$below_exec" | grep -c 'python' || true)"
[ "$n" = "0" ] && ok "router 红线: HOT PATH 段无 python" || bad "router 红线: HOT PATH 段无 python" "实得 ${n} 行"
# 打分段（score_track 起至 EOF）——评分逻辑本体绝无解释器 spawn
score_seg="$(awk '/^score_track\(\)/{f=1} f' "$R")"
n="$(printf '%s' "$score_seg" | grep -c 'node' || true)"
[ "$n" = "0" ] && ok "router 红线: score_track 打分段 grep node 为 0" || bad "router 红线: score_track 打分段 grep node 为 0" "实得 ${n} 行"
n="$(printf '%s' "$below_exec" | grep -c 'jq' || true)"
[ "$n" = "0" ] && ok "router 红线: HOT PATH 段不依赖 jq" || bad "router 红线: HOT PATH 段不依赖 jq" "实得 ${n} 行"

# ── 9b. 跳过规则（无条件；不触达 cache/node）：/命令 / L5 override / 讨论 / 自身回显 → exit 0 空输出 ──
rproj="$TMP/router-skip"; mkdir -p "$rproj"
run_router "{\"prompt\":\"/pipeline status\",\"cwd\":\"$rproj\"}"
assert_exit "router: /命令 → exit 0" 0 "$RRC"; assert_empty "router: /命令 不注入" "$ROUT"
run_router "{\"prompt\":\"快速修复一下这个 React 组件的样式\",\"cwd\":\"$rproj\"}"
assert_empty "router: L5 override（快速修复）即便含 track 词也不注入" "$ROUT"
run_router "{\"prompt\":\"我觉得这个 React 页面原型太廉价了\",\"cwd\":\"$rproj\"}"
assert_empty "router: 讨论类（我觉得…）不注入" "$ROUT"
run_router "{\"prompt\":\"<workflow-state>\nchange=x\n</workflow-state>\",\"cwd\":\"$rproj\"}"
assert_empty "router: 自身回显 <workflow-state> 不再触发" "$ROUT"
run_router "{\"prompt\":\"\",\"cwd\":\"$rproj\"}"
assert_exit "router: 空 prompt → fail-safe exit 0" 0 "$RRC"; assert_empty "router: 空 prompt 无输出" "$ROUT"
( cd "$rproj" && printf 'not json at all' | PIPELINE_ROUTER_CACHE="$RCACHE" CLAUDE_PLUGIN_ROOT="$ROOT" bash "$R" >/dev/null 2>&1 )
assert_exit "router: 非 JSON stdin → fail-open exit 0" 0 "$?"

# ── 9c. fail-safe：patterns 未载入（缓存无 FE_PATTERN 且 fresh、不重生成）→ 不路由、非阻断 exit 0 ──
EMPTY_CACHE="$TMP/router-empty.generated.sh"
printf '# no patterns generated（模拟 manifest/node 坏）\n' > "$EMPTY_CACHE"
touch "$EMPTY_CACHE"  # fresh：晚于 templates/manifest.yaml → router 不触发重生成，直接 source 空缓存
run_router "{\"prompt\":\"帮我写个 React 组件响应式页面 UI\",\"cwd\":\"$rproj\"}" "$EMPTY_CACHE"
assert_exit "router: patterns 未载入 → fail-safe exit 0（非阻断）" 0 "$RRC"
assert_empty "router: patterns 未载入 → 不路由（无 workflow-state）" "$ROUT"

# ── 9d. 需 node 的真实派生 + 评分 + 注入 + 缓存红线（node 不可用则跳过，语义同 section 6） ──
if command -v node >/dev/null 2>&1; then
  rm -f "$RCACHE"
  # 首轮：无缓存 → router 经 router-gen.mjs 真派生缓存（消费 kernel genRouterSh/breadcrumbs/skillsFor）
  run_router "{\"prompt\":\"帮我实现一个 React 组件，做个响应式页面 UI\",\"cwd\":\"$rproj\"}"
  assert_exit "router: FE prompt → exit 0" 0 "$RRC"
  assert_contains "router: FE 特征 prompt → 选 frontend Track" "$ROUT" "track=frontend"
  [ -f "$RCACHE" ] && ok "router: 首轮无缓存 → 派生缓存已生成" || bad "router: 首轮无缓存 → 派生缓存已生成" "缓存未生成"
  # 单一真相源实证：缓存 FE_PATTERN 逐字来自 manifest（非硬编码兜底）——含 manifest 独有 token「响应式」
  assert_contains "router: 缓存派生自真实 manifest（含独有 token 响应式）" "$(cat "$RCACHE" 2>/dev/null)" "响应式"
  # BE / PM 特征 prompt
  run_router "{\"prompt\":\"设计一个后端 API 接口，接 Postgres 数据库，写 service 层\",\"cwd\":\"$rproj\"}"
  assert_contains "router: BE 特征 prompt → 选 backend Track" "$ROUT" "track=backend"
  run_router "{\"prompt\":\"帮我做竞品调研，写 PRD 需求文档，梳理用户旅程\",\"cwd\":\"$rproj\"}"
  assert_contains "router: PM 特征 prompt → 选 pm Track" "$ROUT" "track=pm"

  # breadcrumb 注入含相位 + 该 phase×track 推荐/强制 skill（活跃 change phase=build, track=frontend）
  rc2="$TMP/router-active"; mkdir -p "$rc2/openspec/changes/demo"
  printf 'track: frontend\nphase: build\narchived: \n' > "$rc2/openspec/changes/demo/.pipeline.yaml"
  run_router "{\"prompt\":\"继续实现登录页面的 React 组件\",\"cwd\":\"$rc2\"}"
  assert_contains "router: 注入含当前相位（phase=build）" "$ROUT" "phase=build"
  assert_contains "router: 注入含 change 名" "$ROUT" "demo"
  assert_contains "router: 注入含 <workflow-state> 标签" "$ROUT" "<workflow-state>"
  assert_contains "router: 注入含该相位 breadcrumb 行动提示（build 含 TDD）" "$ROUT" "TDD"
  assert_contains "router: 注入含推荐 skill（build.frontend）" "$ROUT" "推荐 skill"
  assert_contains "router: 注入含 build.frontend 推荐 skill token（react-patterns）" "$ROUT" "react-patterns"

  # ── 9d'. 自定义 workflow step id（Task 11 修复目标）：phase 不在 7 个固定值内 → 不许被白名单
  # case 静默吞成 open，HDR 的 phase= 字段必须真是该自定义值（否则自定义 workflow 的
  # breadcrumb/skill 注入对应关系全部对不上号）
  rc3="$TMP/router-custom-phase"; mkdir -p "$rc3/openspec/changes/demo"
  printf 'track: frontend\nphase: custom-step-1\narchived: \n' > "$rc3/openspec/changes/demo/.pipeline.yaml"
  run_router "{\"prompt\":\"继续实现登录页面的 React 组件\",\"cwd\":\"$rc3\"}"
  assert_contains "router: 自定义 phase（custom-step-1）保真透传" "$ROUT" "phase=custom-step-1"
  assert_not_contains "router: 自定义 phase 不被白名单静默重置为 open" "$ROUT" "phase=open"

  # ── 9d''. 安全兜底（间接变量名注入防护）：真正危险的 phase 值（空格/$()/分号/尖括号）
  # 仍必须兜底 open，且危险原文不得原样透传进注入文本（防 <workflow-state> 块被跳出/伪造）
  rc4="$TMP/router-dangerous-phase"; mkdir -p "$rc4/openspec/changes/demo"
  printf 'track: frontend\nphase: evil; $(whoami) <tag>\narchived: \n' > "$rc4/openspec/changes/demo/.pipeline.yaml"
  run_router "{\"prompt\":\"继续实现登录页面的 React 组件\",\"cwd\":\"$rc4\"}"
  assert_contains "router: 危险字符 phase（空格/\$()/分号/尖括号）安全兜底 open" "$ROUT" "phase=open"
  assert_not_contains "router: 危险 phase 原文不原样透传进输出" "$ROUT" "whoami"
  assert_not_contains "router: 危险 phase 不能注入伪造标签" "$ROUT" "<tag>"

  # ── 9d'''. locale collation gap（review finding）：[!a-zA-Z0-9_-] 这个 bracket 表达式的
  # range 匹配受 LC_COLLATE 影响——在非 C locale（如 zh_CN.UTF-8）下，重音拉丁字符（如 é）
  # 可能被 collation 判定为落在 a-z 区间内而躲过白名单，phase: café 会原样透传成
  # phase=café 而非兜底 open（本机 ambient 正是 zh_CN.UTF-8，已实测复现）。显式钉 LC_ALL 到
  # 一个真实非 C locale 复现 + 验证修复；locale 不可用时跳过真实复现，但结构性断言无条件跑。
  rc5="$TMP/router-locale-phase"; mkdir -p "$rc5/openspec/changes/demo"
  printf 'track: frontend\nphase: café\narchived: \n' > "$rc5/openspec/changes/demo/.pipeline.yaml"
  if locale -a 2>/dev/null | grep -qi '^zh_CN\.UTF-8$'; then
    LC_ALL=zh_CN.UTF-8 run_router "{\"prompt\":\"继续实现登录页面的 React 组件\",\"cwd\":\"$rc5\"}"
    assert_contains "router: 重音字符 phase（café）在 zh_CN.UTF-8 locale 下仍安全兜底 open（collation gap 修复）" "$ROUT" "phase=open"
    assert_not_contains "router: café 不应原样透传成 phase=café（locale-sensitive bracket 匹配）" "$ROUT" "phase=café"
  else
    printf 'skip - 本机未装 zh_CN.UTF-8 locale，跳过 locale-collation 真实复现（结构性断言见下，无条件跑）\n'
  fi
  # 结构性断言（无条件跑，不依赖本机是否装了 zh_CN.UTF-8）：确认修复机制本身在位
  # ——LC_ALL=C 真钉在 EFF_PHASE case 语句之前，而不仅是改动说明里提了一嘴。
  lc_all_line="$(grep -n '^LC_ALL=C$' "$R" | head -1 | cut -d: -f1)"
  case_line="$(grep -n 'case "\$EFF_PHASE" in' "$R" | head -1 | cut -d: -f1)"
  if [ -n "$lc_all_line" ] && [ -n "$case_line" ] && [ "$lc_all_line" -lt "$case_line" ]; then
    ok "router 红线: LC_ALL=C 钉在 EFF_PHASE case 语句之前（locale-collation 修复机制在位）"
  else
    bad "router 红线: LC_ALL=C 钉在 EFF_PHASE case 语句之前（locale-collation 修复机制在位）" "lc_all 行=${lc_all_line:-无}，case 行=${case_line:-无}"
  fi

  # mtime 缓存：manifest 比缓存新 → 重生成（缓存 mtime 被刷新到晚于 manifest）
  MAN="$ROOT/templates/manifest.yaml"
  touch -t 200001010000 "$RCACHE"  # 人为把缓存打旧（早于 manifest）
  run_router "{\"prompt\":\"帮我写个 React 页面 UI\",\"cwd\":\"$rproj\"}"
  if [ "$RCACHE" -nt "$MAN" ] || [ ! "$MAN" -nt "$RCACHE" ]; then ok "router: 缓存陈旧（早于 manifest）→ 触发重生成刷新缓存"; else bad "router: 缓存陈旧（早于 manifest）→ 触发重生成刷新缓存" "缓存未被刷新"; fi

  # 缓存命中零 spawn（红线实证）：缓存 fresh 时，shadow 一个「被调用即落 sentinel」的假 node，
  # router 若走 cache-hit 纯 bash 则永不 spawn node → sentinel 不存在，且仍正确评分 frontend。
  touch "$RCACHE"  # 确保 fresh（晚于 manifest）→ 不重生成
  FB="$TMP/router-fakebin"; mkdir -p "$FB"
  printf '#!/bin/sh\ntouch "%s/NODE_CALLED"\nexit 1\n' "$TMP" > "$FB/node"; chmod +x "$FB/node"
  rm -f "$TMP/NODE_CALLED"
  ROUT="$(printf '{"prompt":"帮我写个 React 组件页面 UI","cwd":"%s"}' "$rproj" | PATH="$FB:$PATH" PIPELINE_ROUTER_CACHE="$RCACHE" CLAUDE_PLUGIN_ROOT="$ROOT" bash "$R" 2>/dev/null)"
  [ ! -f "$TMP/NODE_CALLED" ] && ok "router 红线: 命中缓存时零 node spawn（假 node sentinel 未落）" || bad "router 红线: 命中缓存时零 node spawn（假 node sentinel 未落）" "cache-hit 竟 spawn 了 node"
  assert_contains "router: 命中缓存（无 node）仍纯 bash 正确评分 frontend" "$ROUT" "track=frontend"
else
  printf 'skip - node 不可用，跳过 router 真实派生/评分/缓存红线（同 section 6 语义）\n'
fi

# ═══════════════ 10. PostToolUse 全套（BACKLOG #21：confirm-clear / decision-recorder / skill-tracker / interactive-skill-gate） ═══════════════
# 真实 e2e（C9）：真跑每个 hook 喂真 stdin JSON，断言真副作用（marker 真被清 / JSONL 真 append 一行
# 合法 JSON / interactive-gate 真输出姿态）。四脚本是 PostToolUse 热路径（每次工具后触发）→ 纯 bash 红线自证。
CC="$ROOT/hooks/confirm-clear.sh"
DR="$ROOT/hooks/decision-recorder.sh"
ST="$ROOT/hooks/skill-tracker.sh"
IG="$ROOT/hooks/interactive-skill-gate.sh"

# 存在 + 可执行（TDD 红阶段在此直接倒）
for f in "$CC" "$DR" "$ST" "$IG"; do
  base="$(basename "$f")"
  [ -f "$f" ] && ok "PostToolUse: $base 存在" || bad "PostToolUse: $base 存在" "缺文件"
  [ -x "$f" ] && ok "PostToolUse: $base 可执行" || bad "PostToolUse: $base 可执行" "无 x 位"
done

# JSONL 合法性校验（测试脚本可用 node，同 section 6；每行必须 JSON.parse 通过）
jsonl_valid() { # $1=file → 0 合法 / 1 非法 / 2 无 node（跳过）
  command -v node >/dev/null 2>&1 || return 2
  node -e 'const fs=require("fs");const ls=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean);for(const l of ls){JSON.parse(l)}' "$1" 2>/dev/null
}
count_lines() { [ -f "$1" ] && grep -c '' "$1" 2>/dev/null || echo 0; }

# ── 10a. confirm-clear：AskUserQuestion 后清「待处理交互标记族」（confirm/review/interaction，faithful 老仓）──
proj="$TMP/ptu-cc"; mkdir -p "$proj"
touch "$proj/.pipeline-pending-confirm" "$proj/.pipeline-pending-review" "$proj/.pipeline-pending-interaction"
RC="$(printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"AskUserQuestion\"}" | bash "$CC" >/dev/null 2>&1; echo $?)"
assert_exit "confirm-clear: exit 0" 0 "$RC"
[ ! -f "$proj/.pipeline-pending-confirm" ] && ok "confirm-clear: 清 .pipeline-pending-confirm（任务硬要求）" || bad "confirm-clear: 清 .pipeline-pending-confirm（任务硬要求）" "marker 仍在"
[ ! -f "$proj/.pipeline-pending-review" ] && ok "confirm-clear: 同清 review marker（faithful）" || bad "confirm-clear: 同清 review marker（faithful）" "marker 仍在"
[ ! -f "$proj/.pipeline-pending-interaction" ] && ok "confirm-clear: 同清 interaction marker（解封交互门）" || bad "confirm-clear: 同清 interaction marker（解封交互门）" "marker 仍在"
# 上溯：marker 在父目录（项目根），AskUserQuestion 的 cwd 是子目录 → 也清（治跨目录 desync，老仓语义）
mkdir -p "$proj/sub/deep"; touch "$proj/.pipeline-pending-confirm"
printf '%s' "{\"cwd\":\"$proj/sub/deep\",\"tool_name\":\"AskUserQuestion\"}" | bash "$CC" >/dev/null 2>&1
[ ! -f "$proj/.pipeline-pending-confirm" ] && ok "confirm-clear: 子目录 cwd 上溯清父目录 marker" || bad "confirm-clear: 子目录 cwd 上溯清父目录 marker" "父 marker 残留"
# fail-open：非 JSON stdin / 空 stdin → 静默 exit 0
( printf 'not json at all' | bash "$CC" >/dev/null 2>&1 ); assert_exit "confirm-clear: 非 JSON → exit 0" 0 "$?"
( printf '' | bash "$CC" >/dev/null 2>&1 ); assert_exit "confirm-clear: 空 stdin → exit 0" 0 "$?"

# ── 10b. decision-recorder：AskUserQuestion 决策 append 进活跃 change 的 .pipeline-history.jsonl（kind=prompt）──
proj="$TMP/ptu-dr"; mkdir -p "$proj/openspec/changes/demo"
printf 'track: backend\nphase: build\narchived: \n' > "$proj/openspec/changes/demo/.pipeline.yaml"
JL="$proj/openspec/changes/demo/.pipeline-history.jsonl"
before="$(count_lines "$JL")"
DRIN="{\"cwd\":\"$proj\",\"tool_name\":\"AskUserQuestion\",\"tool_input\":{\"questions\":[{\"question\":\"走 pipeline 还是直接改？\",\"header\":\"路由\"}]},\"tool_response\":{\"answers\":{\"路由\":\"pipeline\"}}}"
RC="$(printf '%s' "$DRIN" | bash "$DR" >/dev/null 2>&1; echo $?)"
assert_exit "decision-recorder: exit 0" 0 "$RC"
after="$(count_lines "$JL")"
[ "$after" = "$((before + 1))" ] && ok "decision-recorder: JSONL 真 append 恰一行" || bad "decision-recorder: JSONL 真 append 恰一行" "before=$before after=$after"
line="$(tail -1 "$JL" 2>/dev/null)"
assert_contains "decision-recorder: kind=prompt" "$line" '"kind":"prompt"'
assert_contains "decision-recorder: raw 含问题文本" "$line" "走 pipeline"
assert_contains "decision-recorder: raw 含答案文本" "$line" "pipeline"
assert_contains "decision-recorder: raw 含 Q/A 结构（对齐 import）" "$line" "Q: "
jsonl_valid "$JL"; vrc=$?
case "$vrc" in 0) ok "decision-recorder: JSONL 全行合法 JSON（node 校验）" ;; 2) printf 'skip - node 不可用，跳过 decision-recorder JSONL 合法性\n' ;; *) bad "decision-recorder: JSONL 全行合法 JSON（node 校验）" "解析失败：$line" ;; esac
# 转义硬测（别写坏 JSONL）：问题/答案含 换行 + 反斜杠 + 双引号 → 仍恰一行 + 合法 JSON
proj2="$TMP/ptu-dr-esc"; mkdir -p "$proj2/openspec/changes/x"
printf 'phase: build\narchived: \n' > "$proj2/openspec/changes/x/.pipeline.yaml"
JL2="$proj2/openspec/changes/x/.pipeline-history.jsonl"
cat > "$TMP/dr-esc.json" <<EOF
{"cwd":"$proj2","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"第一行反斜杠\\路径
第二行含引号收尾"}]},"tool_response":{"answers":{"h":"答复也带反斜杠\\end"}}}
EOF
bash "$DR" < "$TMP/dr-esc.json" >/dev/null 2>&1
[ "$(count_lines "$JL2")" = "1" ] && ok "decision-recorder: 换行/反斜杠/引号输入 → 仍恰一行（不撑破 JSONL）" || bad "decision-recorder: 换行/反斜杠/引号输入 → 仍恰一行（不撑破 JSONL）" "行数=$(count_lines "$JL2")"
jsonl_valid "$JL2"; vrc=$?
case "$vrc" in 0) ok "decision-recorder: 特殊字符输入 → 输出仍合法 JSON（转义正确）" ;; 2) printf 'skip - node 不可用\n' ;; *) bad "decision-recorder: 特殊字符输入 → 输出仍合法 JSON（转义正确）" "解析失败：$(cat "$JL2")" ;; esac
# 无活跃 change → 不写、exit 0
proj3="$TMP/ptu-dr-nochange"; mkdir -p "$proj3"
RC="$(printf '%s' "$DRIN" | bash "$DR" >/dev/null 2>&1; echo $?)"
assert_exit "decision-recorder: 无 openspec/changes → exit 0" 0 "$RC"
[ ! -f "$proj3/.pipeline-history.jsonl" ] && ok "decision-recorder: 无活跃 change → 不写 JSONL" || bad "decision-recorder: 无活跃 change → 不写 JSONL" "误写"
# 仅 archived change → 跳过不写
proj4="$TMP/ptu-dr-arch"; mkdir -p "$proj4/openspec/changes/done"
printf 'phase: archive\narchived: true\n' > "$proj4/openspec/changes/done/.pipeline.yaml"
printf '%s' "{\"cwd\":\"$proj4\",\"tool_name\":\"AskUserQuestion\",\"tool_input\":{\"questions\":[{\"question\":\"q\"}]},\"tool_response\":{\"answers\":{\"h\":\"a\"}}}" | bash "$DR" >/dev/null 2>&1
[ ! -f "$proj4/openspec/changes/done/.pipeline-history.jsonl" ] && ok "decision-recorder: 仅 archived change → 不写" || bad "decision-recorder: 仅 archived change → 不写" "误写归档 change"

# ── 10c. skill-tracker：Skill 调用 append 进 .pipeline-history.jsonl（kind=tool，raw=skill 名）──
proj="$TMP/ptu-st"; mkdir -p "$proj/openspec/changes/demo"
printf 'phase: build\narchived: \n' > "$proj/openspec/changes/demo/.pipeline.yaml"
JL="$proj/openspec/changes/demo/.pipeline-history.jsonl"
before="$(count_lines "$JL")"
RC="$(printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"superpowers:brainstorming\"}}" | bash "$ST" >/dev/null 2>&1; echo $?)"
assert_exit "skill-tracker: exit 0" 0 "$RC"
[ "$(count_lines "$JL")" = "$((before + 1))" ] && ok "skill-tracker: JSONL 真 append 恰一行" || bad "skill-tracker: JSONL 真 append 恰一行" "行数=$(count_lines "$JL")"
line="$(tail -1 "$JL" 2>/dev/null)"
assert_contains "skill-tracker: kind=tool" "$line" '"kind":"tool"'
assert_contains "skill-tracker: raw 含 skill 名" "$line" "brainstorming"
jsonl_valid "$JL"; vrc=$?
case "$vrc" in 0) ok "skill-tracker: JSONL 合法 JSON" ;; 2) printf 'skip - node 不可用\n' ;; *) bad "skill-tracker: JSONL 合法 JSON" "解析失败：$line" ;; esac
# 非 Skill 工具（如 Read）→ 不写、exit 0
before="$(count_lines "$JL")"
printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/x\"}}" | bash "$ST" >/dev/null 2>&1
[ "$(count_lines "$JL")" = "$before" ] && ok "skill-tracker: 非 Skill 工具 → 不写" || bad "skill-tracker: 非 Skill 工具 → 不写" "误写"
# 无活跃 change → exit 0 不写
proj2="$TMP/ptu-st-nochange"; mkdir -p "$proj2"
RC="$(printf '%s' "{\"cwd\":\"$proj2\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"pipeline-build\"}}" | bash "$ST" >/dev/null 2>&1; echo $?)"
assert_exit "skill-tracker: 无活跃 change → exit 0" 0 "$RC"

# ── 10d. interactive-skill-gate：交互式 skill 加载后注入交互硬姿态 + 落 interaction 硬门 ──
proj="$TMP/ptu-ig"; mkdir -p "$proj"
OUT="$(printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"superpowers:brainstorming\"}}" | bash "$IG" 2>/dev/null)"
RC=$?
assert_exit "interactive-skill-gate: exit 0" 0 "$RC"
assert_contains "interactive-skill-gate: 输出交互硬姿态（提 AskUserQuestion）" "$OUT" "AskUserQuestion"
assert_contains "interactive-skill-gate: 姿态点名交互式 skill" "$OUT" "交互式 skill"
assert_contains "interactive-skill-gate: 姿态含被加载 skill 名" "$OUT" "brainstorming"
# 输出为合法 JSON（additionalContext 注入）——测试用 node 校验（同 section 6）
if command -v node >/dev/null 2>&1; then
  printf '%s' "$OUT" | node -e 'const s=require("fs").readFileSync(0,"utf8").trim();const j=JSON.parse(s);if(!j.additionalContext)process.exit(1)' 2>/dev/null
  assert_exit "interactive-skill-gate: 输出合法 JSON 且含 additionalContext" 0 "$?"
fi
[ -f "$proj/.pipeline-pending-interaction" ] && ok "interactive-skill-gate: 落 .pipeline-pending-interaction 硬门" || bad "interactive-skill-gate: 落 .pipeline-pending-interaction 硬门" "marker 未落"
# 裸名（无 plugin 前缀）也命中
proj2="$TMP/ptu-ig-bare"; mkdir -p "$proj2"
OUT="$(printf '%s' "{\"cwd\":\"$proj2\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"brainstorming\"}}" | bash "$IG" 2>/dev/null)"
assert_contains "interactive-skill-gate: 裸名 brainstorming 也命中" "$OUT" "AskUserQuestion"
# 非交互式 skill（pipeline-build）→ 不注入、不落门
proj3="$TMP/ptu-ig-noninteractive"; mkdir -p "$proj3"
OUT="$(printf '%s' "{\"cwd\":\"$proj3\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"pipeline-build\"}}" | bash "$IG" 2>/dev/null)"
RC=$?
assert_exit "interactive-skill-gate: 非交互式 skill → exit 0" 0 "$RC"
assert_empty "interactive-skill-gate: 非交互式 skill → 不注入姿态" "$OUT"
[ ! -f "$proj3/.pipeline-pending-interaction" ] && ok "interactive-skill-gate: 非交互式 skill → 不落门" || bad "interactive-skill-gate: 非交互式 skill → 不落门" "误落门"
# 非 Skill 工具 → exit 0 空输出
proj4="$TMP/ptu-ig-nontool"; mkdir -p "$proj4"
OUT="$(printf '%s' "{\"cwd\":\"$proj4\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls\"}}" | bash "$IG" 2>/dev/null)"
RC=$?
assert_exit "interactive-skill-gate: 非 Skill 工具 → exit 0" 0 "$RC"
assert_empty "interactive-skill-gate: 非 Skill 工具 → 空输出" "$OUT"

# ── 10e. 红线自证：四个 PostToolUse hook 是热路径（每次工具后触发）→ 纯 bash，零 node/python/jq ──
for f in "$CC" "$DR" "$ST" "$IG"; do
  base="$(basename "$f")"
  n="$(grep -c "node" "$f" 2>/dev/null || true)";   [ "$n" = "0" ] && ok "红线: $base 内无 node" || bad "红线: $base 内无 node" "实得 ${n} 行"
  n="$(grep -c "python" "$f" 2>/dev/null || true)"; [ "$n" = "0" ] && ok "红线: $base 内无 python" || bad "红线: $base 内无 python" "实得 ${n} 行"
  n="$(grep -c '\bjq\b' "$f" 2>/dev/null || true)"; [ "$n" = "0" ] && ok "红线: $base 不依赖 jq" || bad "红线: $base 不依赖 jq" "实得 ${n} 行"
done

# ── 10f. hooks.json 注册这四个 PostToolUse（各自 matcher）──
HJ="$ROOT/hooks/hooks.json"
hjson="$(cat "$HJ" 2>/dev/null)"
assert_contains "hooks.json: 注册 confirm-clear.sh" "$hjson" "confirm-clear.sh"
assert_contains "hooks.json: 注册 decision-recorder.sh" "$hjson" "decision-recorder.sh"
assert_contains "hooks.json: 注册 skill-tracker.sh" "$hjson" "skill-tracker.sh"
assert_contains "hooks.json: 注册 interactive-skill-gate.sh" "$hjson" "interactive-skill-gate.sh"
assert_contains "hooks.json: 含 PostToolUse 段" "$hjson" "PostToolUse"
assert_contains "hooks.json: PostToolUse 挂 AskUserQuestion matcher" "$hjson" "AskUserQuestion"

# ═══════════════ 11. 阶段×hook 开关矩阵（v5 T5 / 决议#2：.pipeline/hooks.json） ═══════════════
# server 写端点落盘 canonical 形态（JSON.stringify(…,null,2)：矩阵一键一行、只存 false 禁用项，
# 见 packages/server/src/hooksConfig.ts）；sh 侧热路径纯 bash grep -F 判定（CONTRACT §5.4 禁
# spawn node/jq）。断言：配置关掉的 hook exit 0 零副作用；缺失/损坏 → 行为与今天完全一致
# （fail-open 到启用）；gate.sh 交互门与 interactive-skill-gate.sh 安全门强制常开（忽略配置）。

write_hooks_cfg() { # $1=root，其余=禁用键（如 router.build）——逐字模拟 server canonical 落盘形态
  local root="$1" first=1 k
  shift
  mkdir -p "$root/.pipeline"
  {
    printf '{\n  "version": 1,\n  "matrix": {\n'
    for k in "$@"; do
      [ "$first" = 1 ] || printf ',\n'
      printf '    "%s": false' "$k"
      first=0
    done
    printf '\n  }\n}\n'
  } > "$root/.pipeline/hooks.json"
}

# ── 11a. skill-tracker：当前阶段被禁用 → exit 0 且零副作用（JSONL 不 append）──
proj="$TMP/hm-st"; mkdir -p "$proj/openspec/changes/demo"
printf 'track: backend\nphase: build\narchived: \n' > "$proj/openspec/changes/demo/.pipeline.yaml"
JL="$proj/openspec/changes/demo/.pipeline-history.jsonl"
write_hooks_cfg "$proj" "skill-tracker.build"
RC="$(printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"pipeline-build\"}}" | bash "$ST" >/dev/null 2>&1; echo $?)"
assert_exit "开关: skill-tracker 当前阶段（build）被禁用 → exit 0" 0 "$RC"
[ "$(count_lines "$JL")" = "0" ] && ok "开关: 禁用的 skill-tracker 零副作用（JSONL 不 append）" || bad "开关: 禁用的 skill-tracker 零副作用（JSONL 不 append）" "行数=$(count_lines "$JL")"
# 只关别的阶段（verify）→ 本阶段（build）照常写（阶段×hook 精准粒度，非全局开关）
write_hooks_cfg "$proj" "skill-tracker.verify"
printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"pipeline-build\"}}" | bash "$ST" >/dev/null 2>&1
[ "$(count_lines "$JL")" = "1" ] && ok "开关: skill-tracker 仅它阶段被禁 → 本阶段照常 append" || bad "开关: skill-tracker 仅它阶段被禁 → 本阶段照常 append" "行数=$(count_lines "$JL")"
# 损坏配置 → fail-open 到启用（行为与今天完全一致）
printf 'not json {{{' > "$proj/.pipeline/hooks.json"
printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"pipeline-build\"}}" | bash "$ST" >/dev/null 2>&1
[ "$(count_lines "$JL")" = "2" ] && ok "开关: skill-tracker 配置损坏 → fail-open 照常 append" || bad "开关: skill-tracker 配置损坏 → fail-open 照常 append" "行数=$(count_lines "$JL")"

# ── 11b. breadcrumb：newest change 的阶段被禁用 → 静默 exit 0；别的阶段被禁 → 照常 cat ──
proj="$TMP/hm-bc"; mkdir -p "$proj/openspec/changes/demo"
printf 'track: backend\nphase: build\narchived: \n' > "$proj/openspec/changes/demo/.pipeline.yaml"
printf 'CRUMB-HM\n' > "$proj/openspec/changes/demo/.breadcrumb"
write_hooks_cfg "$proj" "breadcrumb.build"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$BC" 2>/dev/null)"
rc=$?
assert_exit "开关: breadcrumb 当前阶段被禁用 → exit 0" 0 "$rc"
assert_empty "开关: 禁用的 breadcrumb 零输出" "$out"
write_hooks_cfg "$proj" "breadcrumb.open"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$BC" 2>/dev/null)"
assert_contains "开关: breadcrumb 仅它阶段被禁 → 本阶段照常输出" "$out" "CRUMB-HM"
printf '{{{broken' > "$proj/.pipeline/hooks.json"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$BC" 2>/dev/null)"
assert_contains "开关: breadcrumb 配置损坏 → fail-open 照常输出" "$out" "CRUMB-HM"

# ── 11c. session-start：当前阶段（mtime 最新活跃 change）被禁用 → exit 0 零输出 ──
proj="$TMP/hm-ss"; mkdir -p "$proj/openspec/changes/demo"
printf 'track: backend\nphase: build\narchived: \n' > "$proj/openspec/changes/demo/.pipeline.yaml"
write_hooks_cfg "$proj" "session-start.build"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
rc=$?
assert_exit "开关: session-start 当前阶段被禁用 → exit 0" 0 "$rc"
assert_empty "开关: 禁用的 session-start 零输出（宪法/上下文全不注入）" "$out"
write_hooks_cfg "$proj" "session-start.open"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
assert_contains "开关: session-start 仅它阶段被禁 → 本阶段照常注入" "$out" "pipeline"
printf 'garbage!!' > "$proj/.pipeline/hooks.json"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
assert_contains "开关: session-start 配置损坏 → fail-open 照常注入" "$out" "pipeline"

# ── 11d. router：当前阶段被禁用 → exit 0 零注入（判定在缓存重生成之前，禁用连 node 都不 spawn）──
rproj2="$TMP/hm-router"; mkdir -p "$rproj2/openspec/changes/demo"
printf 'track: frontend\nphase: build\narchived: \n' > "$rproj2/openspec/changes/demo/.pipeline.yaml"
write_hooks_cfg "$rproj2" "router.build"
run_router "{\"prompt\":\"帮我实现一个 React 组件，做个响应式页面 UI\",\"cwd\":\"$rproj2\"}"
assert_exit "开关: router 当前阶段被禁用 → exit 0" 0 "$RRC"
assert_empty "开关: 禁用的 router 零注入" "$ROUT"
# 禁用判定先于缓存重生成：shadow 假 node sentinel，禁用路径必须零 spawn
FB2="$TMP/hm-router-fakebin"; mkdir -p "$FB2"
printf '#!/bin/sh\ntouch "%s/HM_NODE_CALLED"\nexit 1\n' "$TMP" > "$FB2/node"; chmod +x "$FB2/node"
rm -f "$TMP/HM_NODE_CALLED"
printf '{"prompt":"帮我写个 React 页面 UI","cwd":"%s"}' "$rproj2" | PATH="$FB2:$PATH" PIPELINE_ROUTER_CACHE="$TMP/hm-router-cache.sh" CLAUDE_PLUGIN_ROOT="$ROOT" bash "$R" >/dev/null 2>&1
[ ! -f "$TMP/HM_NODE_CALLED" ] && ok "开关红线: 禁用的 router 零 node spawn（判定先于缓存重生成）" || bad "开关红线: 禁用的 router 零 node spawn（判定先于缓存重生成）" "禁用路径竟 spawn 了 node"
if command -v node >/dev/null 2>&1; then
  rm -f "$rproj2/.pipeline/hooks.json"
  run_router "{\"prompt\":\"帮我实现一个 React 组件，做个响应式页面 UI\",\"cwd\":\"$rproj2\"}"
  assert_contains "开关: router 删除配置（解禁）→ 恢复注入（对照组）" "$ROUT" "track=frontend"
else
  printf 'skip - node 不可用，跳过 router 解禁对照组\n'
fi

# ── 11e. gate 强制常开（决议#2）：配置里写 gate.*: false 一律无效，新鲜 marker 照拦 ──
proj="$TMP/hm-gate"; mkdir -p "$proj/openspec/changes/demo"
printf 'track: backend\nphase: build\narchived: \n' > "$proj/openspec/changes/demo/.pipeline.yaml"
touch "$proj/.pipeline-pending-confirm"
write_hooks_cfg "$proj" "gate.build" "gate.open" "gate.verify"
run_gate "{\"cwd\":\"$proj\",\"tool_name\":\"Write\"}"
assert_exit "开关: gate 交互门强制常开——配置禁用无效，新鲜 marker 照拦 exit 2" 2 "$RC"

# ── 11f. interactive-skill-gate 强制常开（决议#2）：配置禁用无效，姿态照注入、硬门照落 ──
proj="$TMP/hm-ig"; mkdir -p "$proj"
write_hooks_cfg "$proj" "interactive-skill-gate.build" "interactive-skill-gate.open"
out="$(printf '%s' "{\"cwd\":\"$proj\",\"tool_name\":\"Skill\",\"tool_input\":{\"skill\":\"superpowers:brainstorming\"}}" | bash "$IG" 2>/dev/null)"
rc=$?
assert_exit "开关: interactive-skill-gate 安全门强制常开 → exit 0" 0 "$rc"
assert_contains "开关: 安全门配置禁用无效，姿态照注入" "$out" "AskUserQuestion"
[ -f "$proj/.pipeline-pending-interaction" ] && ok "开关: 安全门配置禁用无效，硬门照落" || bad "开关: 安全门配置禁用无效，硬门照落" "marker 未落"

# ═══════════════ 12. v6 T5 / full-install 批2 P2-T2：AFK 首跑 + 技能就绪提示（session-start.sh，.pipeline/automation.json 或活跃 change 命中 automation 字段） ═══════════════
# 一句话目标：检测到 .pipeline/automation.json 存在，或活跃（非 archived）change 命中 automation
# 字段（值非 off/空）时，追加一行静态文案「AFK 就绪状态见 dashboard（就绪三灯）；技能齐全度…跑
# pipeline doctor 核对」——纯静态提示，不做任何 docker/凭证/技能真探测。批2 A1 已给 doctor 补上缺技能
# 检测（矛盾登记 1 取舍消解），故本提示回改指向 `pipeline doctor`（守零 spawn：只改文案不加探测）。
AFK_HINT="AFK 就绪状态见 dashboard"

# ── 12a. .pipeline/automation.json 存在（即便无任何 change）→ 提示行出现，且指向 pipeline doctor（P2-T2 回改） ──
proj="$TMP/afk-hint-json"; mkdir -p "$proj/openspec" "$proj/.pipeline"
printf '{}\n' > "$proj/.pipeline/automation.json"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
rc=$?
assert_exit "v6T5: automation.json 存在 → exit 0" 0 "$rc"
assert_contains "v6T5: automation.json 存在 → 提示含「${AFK_HINT}」" "$out" "$AFK_HINT"
assert_contains "v6T5: 提示含「就绪三灯」措辞" "$out" "就绪三灯"
assert_contains "P2-T2: 提示回改指向 pipeline doctor（批2 A1 已扩展该命令）" "$out" "pipeline doctor"

# ── 12b. 完全非 pipeline 目录（无 openspec）→ 新逻辑不报错、不追加提示 ──
proj="$TMP/afk-hint-nonpipeline"; mkdir -p "$proj"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
rc=$?
assert_exit "v6T5: 非 pipeline 目录 → exit 0（新逻辑不报错）" 0 "$rc"
assert_not_contains "v6T5: 非 pipeline 目录 → 不追加提示" "$out" "$AFK_HINT"

# ── 12c. 无 automation.json + 无活跃 change（纯 bare pipeline 项目）→ 不追加，且既有引导零回归 ──
proj="$TMP/afk-hint-bare"; mkdir -p "$proj/openspec"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
assert_not_contains "v6T5: 无 automation.json 且无活跃 change → 不追加提示" "$out" "$AFK_HINT"
assert_contains "v6T5: 无回归——普通项目引导照常输出" "$out" "pipeline-lite"

# ── 12d. 无 automation.json + 活跃 change automation=off（默认值）→ 不追加 ──
proj="$TMP/afk-hint-off"; mkdir -p "$proj/openspec/changes/demo-off"
printf 'track: backend\nphase: build\narchived: \nautomation: off\n' > "$proj/openspec/changes/demo-off/.pipeline.yaml"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
assert_not_contains "v6T5: 活跃 change automation=off → 不追加提示" "$out" "$AFK_HINT"

# ── 12e. 无 automation.json + 活跃 change 命中 automation 字段（queued，非 off）→ 追加提示（OR 条件生效）──
proj="$TMP/afk-hint-queued"; mkdir -p "$proj/openspec/changes/demo-queued"
printf 'track: backend\nphase: build\narchived: \nautomation: queued\n' > "$proj/openspec/changes/demo-queued/.pipeline.yaml"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
assert_contains "v6T5: 活跃 change automation=queued（命中）→ 追加提示" "$out" "$AFK_HINT"

# ── 12f. 唯一命中 automation 字段的 change 已 archived → 不追加（archived 排除，呼应决议#5 一致口径）──
proj="$TMP/afk-hint-archived"; mkdir -p "$proj/openspec/changes/demo-archived"
printf 'track: backend\nphase: archive\narchived: true\nautomation: running\n' > "$proj/openspec/changes/demo-archived/.pipeline.yaml"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
assert_not_contains "v6T5: 唯一命中 change 已 archived → 不追加提示" "$out" "$AFK_HINT"

# ── 12g. 阶段×hook 开关矩阵优先：session-start 当前阶段被禁用时，即便 automation.json 存在也零输出 ──
proj="$TMP/afk-hint-disabled"; mkdir -p "$proj/openspec/changes/demo-disabled" "$proj/.pipeline"
printf 'track: backend\nphase: build\narchived: \n' > "$proj/openspec/changes/demo-disabled/.pipeline.yaml"
printf '{}\n' > "$proj/.pipeline/automation.json"
write_hooks_cfg "$proj" "session-start.build"
out="$(printf '{"cwd":"%s"}' "$proj" | bash "$SS" 2>/dev/null)"
rc=$?
assert_exit "v6T5: session-start 当前阶段禁用 + automation.json 存在 → 仍 exit 0" 0 "$rc"
assert_empty "v6T5: 禁用态零输出，AFK 提示也不例外" "$out"

# ── 12h. 红线（TDD 要求③：无新增子进程 spawn，保持纯 bash grep）：新逻辑不引入 find/xargs/jq
#         （node/python 已由 section 3 对 $SS 覆盖，此处只补 section 3 未测的三个工具名）──
for tool in find xargs jq; do
  n="$(grep -c "\\b${tool}\\b" "$SS" 2>/dev/null || true)"
  [ "$n" = "0" ] && ok "v6T5 红线: session-start.sh 不引入 ${tool}" || bad "v6T5 红线: session-start.sh 不引入 ${tool}" "实得 ${n} 处"
done

# ───────────────────────── 汇总 ─────────────────────────
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
