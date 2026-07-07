#!/usr/bin/env bash
# test-adapters.sh — 适配器 conformance 测试（BACKLOG #39；仿 tools/test-hooks.sh 风格）。
#
# 把 adapters/contract.md 从「约定」变成「机器约束」：对每个适配器跑同一组输入场景，
# 断言各适配器产出与 Claude Code baseline（hooks/gate.sh · session-start.sh · skill-tracker.sh）
# 等价的 inject/veto/track 决策——或以 registry.yaml 声明的降级档位如实降级（不得伪装硬门/原生）。
#
# 这解决老仓「contract 是约定不是测试」的病灶：改坏任一适配器契约（veto 该拦却放行、
# inject 该注却空、track 该留痕却不写、或声明 native 却降级）必被抓红。§9 反例哨兵自证判别力。
#
# 真实性（GOAL C9/C10：无伪测试·真实且全量）：
#   - veto  真跑适配器 wrapper → 真读项目根 .pipeline-pending-* marker → 真断 exit/permission；
#   - inject 真跑 → 真 cat baseline 宪法/上下文 → 真断 additionalContext 命中；
#   - track  真跑 → 真 append 到 .pipeline-history.jsonl（真实文件系统副作用），断记录逐字对齐。
#   无 mock：断言的是真实副作用与真实决策，不是桩返回值。
#
# 覆盖矩阵（同一输入喂所有适配器 → 断言等价或如实降级）：
#   ① registry.yaml + lint（填表完整性：加平台是填表非重写，D7/D14 策略面）
#   ② 零悬空：每平台 configure 脚本存在；codex/cursor hooks.json wrapper 路径可解析
#   ③ veto：新鲜 marker 拦 / 无 marker 放行 / 陈旧放行 / 子目录上溯拦（× codex × cursor）
#   ④ inject：codex native 包 baseline 上下文；cursor degraded 落 .cursor/rules 且不伪装 native
#   ⑤ track：codex/cursor 真 append history 记录，与 baseline 逐字对齐
#   ⑥ 分档降级如实声明：tier A/B/C 与实际行为一致（native 必等价、degraded 必如实降级）
#   ⑦ 反例哨兵：人为改坏的适配器（veto 放行 / track 不写 / inject 伪装）必被判别为红
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADAPTERS="$ROOT/adapters"
REG="$ADAPTERS/registry.yaml"
CONTRACT="$ADAPTERS/contract.md"
LINT="$ADAPTERS/lint-adapter.sh"
# Claude Code baseline 三能力（适配器要在其它工具上等价实现或降级）
GATE="$ROOT/hooks/gate.sh"           # veto  (PreToolUse)
SS="$ROOT/hooks/session-start.sh"    # inject (SessionStart)
TRACKER="$ROOT/hooks/skill-tracker.sh"  # track (PostToolUse Skill)

# 行为 conformance 覆盖的适配器（claude-code = baseline 自身，不自测）
ADAPTER_IDS="codex cursor"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/test-adapters.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); printf 'ok   - %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL - %s\n       %s\n' "$1" "${2:-}"; }
assert_eq()       { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "期望「$2」实得「$3」"; fi; }
assert_ne()       { if [ "$2" != "$3" ]; then ok "$1"; else bad "$1" "期望不等，两者皆「$2」"; fi; }
assert_contains() { case "$2" in *"$3"*) ok "$1" ;; *) bad "$1" "输出未含「$3」；实际：${2:0:200}" ;; esac; }
assert_file()     { if [ -f "$2" ]; then ok "$1"; else bad "$1" "文件不存在：$2"; fi; }
assert_absent()   { if [ ! -e "$2" ]; then ok "$1"; else bad "$1" "文件本不应存在：$2"; fi; }
assert_exec()     { if [ -x "$2" ]; then ok "$1"; else bad "$1" "非可执行：$2"; fi; }

# ── registry 扁平字段读取（平台块内 4 空格缩进的 key: value；剥一层引号）──
# 平台块以 `  - id: <id>` 起，至下一 `  - id:` 或文件尾止。加平台=填表：conformance 从此表派生。
reg_field() { # <id> <key>
  [ -f "$REG" ] || return 1
  awk -v id="$1" -v key="$2" '
    $0 ~ "^  - id: " id "[[:space:]]*$" { inb=1; next }
    /^  - id: / { inb=0 }
    inb && $0 ~ ("^    " key ":") {
      line=$0; sub(/^    [A-Za-z_]+:[ ]*/,"",line);
      gsub(/^"/,"",line); gsub(/"$/,"",line);
      gsub(/^'\''/,"",line); gsub(/'\''$/,"",line);
      print line; exit
    }
  ' "$REG"
}

# ════════════════════════════════════════════════════════════════════════════
# 前置：baseline 三能力必须在（适配器包装的就是它们）
# ════════════════════════════════════════════════════════════════════════════
for f in "$GATE" "$SS" "$TRACKER"; do
  assert_file "baseline 能力存在：${f#"$ROOT"/}" "$f"
done

# ════════════════════════════════════════════════════════════════════════════
# ① 契约 + registry + lint（填表完整性）
# ════════════════════════════════════════════════════════════════════════════
assert_file "adapters/contract.md 存在" "$CONTRACT"
assert_file "adapters/registry.yaml 存在" "$REG"
# 契约必须把三能力 + A/B/C 分档 + conformance 写清
if [ -f "$CONTRACT" ]; then
  for kw in inject veto track "档 A" "档 B" "档 C" conformance "Unlock sentinel"; do
    assert_contains "contract.md 覆盖 [${kw}]" "$(cat "$CONTRACT")" "$kw"
  done
fi
# lint-adapter.sh：五处齐全机器校验（加平台是填表，缺字段抓红）
if [ -x "$LINT" ]; then
  if bash "$LINT" --all >/dev/null 2>&1; then ok "lint-adapter.sh --all 全绿（registry 填表完整）"
  else bad "lint-adapter.sh --all 全绿（registry 填表完整）" "lint 报错，见 bash $LINT --all"; fi
else
  bad "lint-adapter.sh 可执行" "缺失或不可执行：$LINT"
fi

# ════════════════════════════════════════════════════════════════════════════
# ② 零悬空：configure 脚本存在 + hooks.json wrapper 路径可解析
# ════════════════════════════════════════════════════════════════════════════
for id in $ADAPTER_IDS; do
  conf="$(reg_field "$id" configure)"
  if [ -n "$conf" ]; then assert_file "$id configure 脚本存在（零悬空）：$conf" "$ROOT/$conf"
  else bad "$id configure 字段非空" "registry 未登记 $id.configure"; fi
  # hooks.json 内 __ADAPTER_DIR__/hooks/*.sh 全部落地且可执行
  hj="$ADAPTERS/$id/hooks.json"
  if [ -f "$hj" ]; then
    for rel in $(grep -oE '__ADAPTER_DIR__/[^"]*\.sh' "$hj" 2>/dev/null | sed 's#__ADAPTER_DIR__/##' | sort -u); do
      assert_exec "$id hooks.json 引用可执行（零悬空）：$rel" "$ADAPTERS/$id/$rel"
    done
  else
    bad "$id hooks.json 存在" "缺失：$hj"
  fi
done

# ════════════════════════════════════════════════════════════════════════════
# ③ veto conformance（同输入喂每个适配器，断言与 baseline 决策等价）
# ════════════════════════════════════════════════════════════════════════════
# baseline veto 决策：gate.sh 直跑，exit 2 = DENY / exit 0 = ALLOW
baseline_veto() { printf '%s' "$1" | bash "$GATE" >/dev/null 2>&1; [ "$?" = 2 ] && printf DENY || printf ALLOW; }

# 归一任意适配器 veto 输出为 DENY/ALLOW（按 registry 声明的 veto_format 解读）
norm_veto() { # <format> <rc> <stdout>
  case "$1" in
    exit2-stderr)     [ "$2" = 2 ] && printf DENY || printf ALLOW ;;
    permission-json)  case "$3" in *'"permission":"deny"'*|*'"permission": "deny"'*) printf DENY ;; *) printf ALLOW ;; esac ;;
    # git-hook-exit-nonzero（#41 aider）：commit-gate 只要求非零退出即挡（不像 CC 硬性 exit=2）；
    # veto.sh 内部实际用 exit 1——真实 git 世界任何非零都会中止 commit，语义上不必强求 2。
    git-hook-exit-nonzero) [ "$2" != 0 ] && printf DENY || printf ALLOW ;;
    # cancel-json（#41 cline）：输出恒为合法 JSON，无 exit-code 语义；cancel:true 才是真拦截。
    cancel-json)      case "$3" in *'"cancel":true'*) printf DENY ;; *) printf ALLOW ;; esac ;;
    # reject-and-continue（#41 amp）：Amp 插件 tool.call 返回值格式；此归一函数留作 bash 侧
    # 一致性入口，amp 实际走 Node __test 分发（见 §⑨.amp），归一逻辑与此处相同（字符串匹配）。
    reject-and-continue) case "$3" in *'"action":"reject-and-continue"'*) printf DENY ;; *) printf ALLOW ;; esac ;;
    *) printf UNKNOWN ;;
  esac
}
# 跑一个 veto wrapper（显式 wrapper 路径 + format，便于反例哨兵复用同一判别路径）
drive_veto_at() { # <wrapper> <format> <json> -> echo DENY/ALLOW
  local w="$1" fmt="$2" json="$3" out rc
  [ -f "$w" ] || { printf MISSING; return; }
  out="$(printf '%s' "$json" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$w" veto-event 2>/dev/null)"; rc=$?
  norm_veto "$fmt" "$rc" "$out"
}
drive_veto() { drive_veto_at "$ADAPTERS/$1/hooks/veto.sh" "$(reg_field "$1" veto_format)" "$2"; }

# scenario 构造器：在项目根落/清 marker，返回喂 hook 的 JSON
mk_proj() { local d="$TMP/$1"; mkdir -p "$d"; printf '%s' "$d"; }
touch_age() { # <file> <秒龄>（BSD/GNU 双兼容）
  local ts; ts="$(date -v-"$2"S +%Y%m%d%H%M.%S 2>/dev/null || date -d "@$(( $(date +%s) - $2 ))" +%Y%m%d%H%M.%S 2>/dev/null)"
  touch -t "$ts" "$1"
}

run_veto_scenario() { # <名> <json> <expected DENY/ALLOW>
  local name="$1" json="$2" expect="$3" b; b="$(baseline_veto "$json")"
  assert_eq "veto/$name: baseline gate.sh 决策 = $expect" "$expect" "$b"
  local id d
  for id in $ADAPTER_IDS; do
    d="$(drive_veto "$id" "$json")"
    assert_eq "veto/$name: $id 与 baseline 等价 (${expect})" "$expect" "$d"
  done
}

# 场景 V1：新鲜 review marker → DENY
p="$(mk_proj veto-deny)"; touch "$p/.pipeline-pending-review"
run_veto_scenario "V1-fresh-review" "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}" DENY
# 场景 V2：无 marker → ALLOW
p="$(mk_proj veto-none)"
run_veto_scenario "V2-no-marker" "{\"cwd\":\"$p\",\"tool_name\":\"Bash\"}" ALLOW
# 场景 V3：陈旧 marker → ALLOW
p="$(mk_proj veto-stale)"; touch "$p/.pipeline-pending-review"; touch_age "$p/.pipeline-pending-review" 4000
run_veto_scenario "V3-stale" "{\"cwd\":\"$p\",\"tool_name\":\"Edit\"}" ALLOW
# 场景 V4：marker 在项目根、cwd 是子目录 → 上溯拦 DENY
p="$(mk_proj veto-nested)"; mkdir -p "$p/sub/deep"; touch "$p/.pipeline-pending-interaction"
run_veto_scenario "V4-nested-cwd" "{\"cwd\":\"$p/sub/deep\",\"tool_name\":\"Write\"}" DENY

# ════════════════════════════════════════════════════════════════════════════
# ④ inject conformance（native 包 baseline 上下文；degraded 如实降级 + 不伪装）
# ════════════════════════════════════════════════════════════════════════════
mk_change_proj() { # <名> -> echo 项目路径（含活跃 change）
  local d="$TMP/$1"; mkdir -p "$d/openspec/changes/demo-change"
  printf 'phase: explore\ntrack: backend\narchived: false\n' > "$d/openspec/changes/demo-change/.pipeline.yaml"
  printf '%s' "$d"
}

# codex：inject_status=native，wrapper 把 baseline session-start.sh 上下文包成 additionalContext
cx_inj="$ADAPTERS/codex/hooks/inject.sh"
assert_eq "inject/codex: registry 声明 native" native "$(reg_field codex inject_status)"
if [ -f "$cx_inj" ]; then
  p="$(mk_change_proj codex-inject)"
  out="$(printf '{"cwd":"%s"}' "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$cx_inj" SessionStart 2>/dev/null)"
  assert_contains "inject/codex: 产出 hookSpecificOutput（codex JSON 格式）" "$out" "hookSpecificOutput"
  assert_contains "inject/codex: 含 additionalContext 字段" "$out" "additionalContext"
  assert_contains "inject/codex: additionalContext 真包 baseline 宪法（pipeline-lite）" "$out" "pipeline-lite"
else
  bad "inject/codex: wrapper 存在" "缺失：$cx_inj"
fi

# cursor：inject_status=degraded → 落 .cursor/rules 静态层；且不得暴露伪 SessionStart inject
assert_eq "inject/cursor: registry 声明 degraded" degraded "$(reg_field cursor inject_status)"
assert_eq "inject/cursor: registry 声明 fallback=static-rules" static-rules "$(reg_field cursor inject_fallback)"
assert_absent "inject/cursor: 无 hooks/inject.sh（不伪装会话级 inject，如实降级）" "$ADAPTERS/cursor/hooks/inject.sh"
cur_inst="$ADAPTERS/cursor/install.sh"
if [ -f "$cur_inst" ]; then
  cp="$TMP/cursor-install"; mkdir -p "$cp"
  bash "$cur_inst" --target "$cp" --no-hooks --yes >/dev/null 2>&1 || true
  assert_file "inject/cursor: install 落地 .cursor/rules/pipeline.md（降级静态层真产出）" "$cp/.cursor/rules/pipeline.md"
else
  bad "inject/cursor: install.sh 存在" "缺失：$cur_inst"
fi

# ════════════════════════════════════════════════════════════════════════════
# ⑤ track conformance（真 append history，与 baseline 逐字对齐）
# ════════════════════════════════════════════════════════════════════════════
TRACK_JSON_TMPL='{"cwd":"%s","tool_name":"Skill","skill":"pipeline-explore"}'
HIST="openspec/changes/demo-change/.pipeline-history.jsonl"

# baseline：skill-tracker.sh 直跑 → history 记 raw="Skill: pipeline-explore"
p="$(mk_change_proj track-baseline)"
printf "$TRACK_JSON_TMPL" "$p" | bash "$TRACKER" >/dev/null 2>&1 || true
if [ -f "$p/$HIST" ]; then
  assert_contains "track/baseline: history 记 Skill: pipeline-explore" "$(cat "$p/$HIST")" '"raw":"Skill: pipeline-explore"'
else
  bad "track/baseline: history 文件生成" "缺 $p/$HIST"
fi

drive_track() { # <id> -> 在独立项目跑该适配器 track，echo 最后一行 history
  # 注意（#41 铺量时抓出的潜伏 bug）：不能写成 `local id="$1" w="...$id..."`——bash 对同一条
  # local 语句里的多个赋值会先展开全部 RHS 再赋值，此时 w 里的 $id 仍读外层作用域的同名变量
  # （历史上恰好都在 `for id in ...` 循环里调用、外层 id 巧合等于传入的 "$1" 才没露馅；
  # #41 新增的 continue/track 用例在循环外直接传字面量调用，当即抓出）。拆成两条独立 local 语句。
  local id="$1"
  local w="$ADAPTERS/$id/hooks/track.sh"
  [ -f "$w" ] || { printf MISSING; return; }
  local p; p="$(mk_change_proj "track-$id")"
  printf "$TRACK_JSON_TMPL" "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$w" postToolUse >/dev/null 2>&1 || true
  [ -f "$p/$HIST" ] && tail -1 "$p/$HIST" || printf NO_HISTORY
}
for id in $ADAPTER_IDS; do
  line="$(drive_track "$id")"
  assert_contains "track/$id: 真 append history（与 baseline 记录等价）" "$line" '"raw":"Skill: pipeline-explore"'
done

# ════════════════════════════════════════════════════════════════════════════
# ⑥ 分档降级如实（tier A/B/C 与实际行为一致）
# ════════════════════════════════════════════════════════════════════════════
# codex = 档 A 全保真：三能力全 native
assert_eq "tier/codex: registry tier=A" A "$(reg_field codex tier)"
assert_eq "tier/codex: veto native"  native "$(reg_field codex veto_status)"
assert_eq "tier/codex: inject native" native "$(reg_field codex inject_status)"
assert_eq "tier/codex: track native"  native "$(reg_field codex track_status)"
# cursor = 档 B 部分降级：veto/track native、inject degraded
assert_eq "tier/cursor: registry tier=B" B "$(reg_field cursor tier)"
assert_eq "tier/cursor: veto native"  native "$(reg_field cursor veto_status)"
assert_eq "tier/cursor: track native" native "$(reg_field cursor track_status)"
assert_eq "tier/cursor: inject degraded" degraded "$(reg_field cursor inject_status)"
# cursor veto 必 failClosed（默认 fail-open 与硬拦冲突）——hooks.json 声明 + registry 登记
assert_eq "tier/cursor: registry veto_failclosed=true" true "$(reg_field cursor veto_failclosed)"
if [ -f "$ADAPTERS/cursor/hooks.json" ]; then
  assert_contains "tier/cursor: hooks.json 含 failClosed:true" "$(cat "$ADAPTERS/cursor/hooks.json")" "failClosed"
fi

# ════════════════════════════════════════════════════════════════════════════
# ⑦ 反例哨兵：人为改坏契约必被判别为红（证明 conformance 有判别力，非空跑）
# ════════════════════════════════════════════════════════════════════════════
# 反例 A：veto 该拦却放行 → 判别器须报 与 baseline 不等价（= 会被 §③ 抓红）
mkdir -p "$TMP/broken-veto/hooks"
cat > "$TMP/broken-veto/hooks/veto.sh" <<'BROKEN'
#!/usr/bin/env bash
printf '{"permission":"allow"}\n'
BROKEN
chmod +x "$TMP/broken-veto/hooks/veto.sh"
p="$(mk_proj sentinel-veto)"; touch "$p/.pipeline-pending-review"
b="$(baseline_veto "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}")"
d="$(drive_veto_at "$TMP/broken-veto/hooks/veto.sh" permission-json "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}")"
assert_eq "哨兵: baseline 对新鲜 marker = DENY" DENY "$b"
assert_ne "哨兵: 改坏的 veto（放行）被判别为 ≠ baseline → 会抓红" "$b" "$d"

# 反例 B：track 该留痕却不写 → 判别器须发现 history 未增（= 会被 §⑤ 抓红）
mkdir -p "$TMP/broken-track/hooks"
cat > "$TMP/broken-track/hooks/track.sh" <<'BROKEN'
#!/usr/bin/env bash
exit 0
BROKEN
chmod +x "$TMP/broken-track/hooks/track.sh"
p="$(mk_change_proj sentinel-track)"
printf "$TRACK_JSON_TMPL" "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$TMP/broken-track/hooks/track.sh" postToolUse >/dev/null 2>&1 || true
if [ -f "$p/$HIST" ]; then bad "哨兵: 改坏的 track（不写）被抓红" "history 竟被写了：$(cat "$p/$HIST")"
else ok "哨兵: 改坏的 track（不写 history）被判别为红（history 未生成）"; fi

# 反例 C：inject 声明 native 却空产出 → 判别器须发现 additionalContext 缺失
mkdir -p "$TMP/broken-inject/hooks"
cat > "$TMP/broken-inject/hooks/inject.sh" <<'BROKEN'
#!/usr/bin/env bash
exit 0
BROKEN
chmod +x "$TMP/broken-inject/hooks/inject.sh"
p="$(mk_change_proj sentinel-inject)"
out="$(printf '{"cwd":"%s"}' "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$TMP/broken-inject/hooks/inject.sh" SessionStart 2>/dev/null)"
case "$out" in *additionalContext*) bad "哨兵: 改坏的 inject（空产出）被抓红" "竟产出了 context" ;; *) ok "哨兵: 声明 native 却空产出的 inject 被判别为红（无 additionalContext）" ;; esac

# ════════════════════════════════════════════════════════════════════════════
# ⑧ 新平台铺量 conformance（BACKLOG #40：#39 planned → active，填表式扩展 D7/D14）
#    gemini(A 全 native) · copilot(B veto/track native·inject 降级) ·
#    pi(B inject/track native·veto 降级) · devin(C workflow-only 三能力全静态降级)
#    同一组输入场景喂新平台 → 归一 canonical 决策 → native 断言等价 baseline / degraded 断言落声明 fallback。
#    诚实：真做不到 native 的能力如实标降级档（不伪装硬门/原生，contract §1 红线）。
# ════════════════════════════════════════════════════════════════════════════
NEW_IDS="gemini copilot pi devin"

# ⑧.0 lint 全绿（4 新平台进 platforms: 后各自填表完整——加平台是填表非重写，缺字段被抓红）
for id in $NEW_IDS; do
  if [ -x "$LINT" ]; then
    if bash "$LINT" "$id" >/dev/null 2>&1; then ok "lint/$id: 填表完整（registry 字段齐全）"
    else bad "lint/$id: 填表完整（registry 字段齐全）" "见 bash $LINT $id"; fi
  else
    bad "lint/$id: lint-adapter.sh 可执行" "缺失或不可执行：$LINT"
  fi
done

# ⑧.1 零悬空：每新平台 configure 脚本存在；hook 模板引用的 wrapper 落地可执行（devin 无 hook 如实无目录）
for id in $NEW_IDS; do
  conf="$(reg_field "$id" configure)"
  if [ -n "$conf" ]; then assert_file "$id: configure 脚本存在（零悬空）：$conf" "$ROOT/$conf"
  else bad "$id: configure 字段非空" "registry 未登记 $id.configure"; fi
  # hook 模板：codex/cursor/copilot = hooks.json；gemini/pi = settings.json#hooks；devin 无 hook 模板
  htmpl=""
  for cand in "$ADAPTERS/$id/hooks.json" "$ADAPTERS/$id/settings.json"; do
    [ -f "$cand" ] && { htmpl="$cand"; break; }
  done
  if [ "$(reg_field "$id" hasHooks)" = "true" ]; then
    if [ -n "$htmpl" ]; then
      for rel in $(grep -oE '__ADAPTER_DIR__/[^"]*\.sh' "$htmpl" 2>/dev/null | sed 's#__ADAPTER_DIR__/##' | sort -u); do
        assert_exec "$id hook 模板引用可执行（零悬空）：$rel" "$ADAPTERS/$id/$rel"
      done
    else
      bad "$id hasHooks=true → hook 模板存在（hooks.json/settings.json）" "缺：$ADAPTERS/$id/"
    fi
  else
    assert_absent "$id hasHooks=false → 无 hooks/ 目录（workflow-only，不伪装 hook 强制）" "$ADAPTERS/$id/hooks"
  fi
done

# ⑧.2 veto conformance — 新平台 native veto（gemini/copilot）与 baseline 逐场景等价（同 §③ 输入）
run_veto_new() { # <名> <json> <expect> <ids...>
  local name="$1" json="$2" expect="$3"; shift 3
  local id d
  for id in "$@"; do
    d="$(drive_veto_at "$ADAPTERS/$id/hooks/veto.sh" "$(reg_field "$id" veto_format)" "$json")"
    assert_eq "veto/$name: $id native 与 baseline 等价 (${expect})" "$expect" "$d"
  done
}
NV="gemini copilot"
p="$(mk_proj nv-deny)"; touch "$p/.pipeline-pending-review"
run_veto_new "V1-fresh-review" "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}" DENY $NV
p="$(mk_proj nv-none)"
run_veto_new "V2-no-marker"    "{\"cwd\":\"$p\",\"tool_name\":\"Bash\"}"  ALLOW $NV
p="$(mk_proj nv-stale)"; touch "$p/.pipeline-pending-review"; touch_age "$p/.pipeline-pending-review" 4000
run_veto_new "V3-stale"        "{\"cwd\":\"$p\",\"tool_name\":\"Edit\"}"  ALLOW $NV
p="$(mk_proj nv-nested)"; mkdir -p "$p/sub/deep"; touch "$p/.pipeline-pending-interaction"
run_veto_new "V4-nested-cwd"   "{\"cwd\":\"$p/sub/deep\",\"tool_name\":\"Write\"}" DENY $NV

# ⑧.3 inject conformance — native（gemini/pi 包 baseline 上下文）/ degraded（copilot/devin 落 fallback 不伪装）
for id in gemini pi; do
  assert_eq "inject/$id: registry 声明 native" native "$(reg_field "$id" inject_status)"
  w="$ADAPTERS/$id/hooks/inject.sh"
  if [ -f "$w" ]; then
    p="$(mk_change_proj "$id-inject")"
    out="$(printf '{"cwd":"%s"}' "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$w" SessionStart 2>/dev/null)"
    assert_contains "inject/$id: 产出 hookSpecificOutput（CC 同构 JSON）" "$out" "hookSpecificOutput"
    assert_contains "inject/$id: 含 additionalContext 字段" "$out" "additionalContext"
    assert_contains "inject/$id: additionalContext 真包 baseline 宪法（pipeline-lite）" "$out" "pipeline-lite"
  else
    bad "inject/$id: wrapper 存在" "缺失：$w"
  fi
done
# copilot inject degraded：无 hooks/inject.sh（不伪装会话级 inject），install 落 .github/copilot-instructions.md 静态层
assert_eq "inject/copilot: registry 声明 degraded" degraded "$(reg_field copilot inject_status)"
assert_ne "inject/copilot: inject_fallback 非空（声明降级须给落点）" "" "$(reg_field copilot inject_fallback)"
assert_absent "inject/copilot: 无 hooks/inject.sh（如实降级，不伪装会话级 inject）" "$ADAPTERS/copilot/hooks/inject.sh"
if [ -f "$ADAPTERS/copilot/install.sh" ]; then
  cp="$TMP/copilot-install"; mkdir -p "$cp"
  bash "$ADAPTERS/copilot/install.sh" --target "$cp" --no-hooks --yes >/dev/null 2>&1 || true
  assert_file "inject/copilot: install 落静态层 .github/copilot-instructions.md（降级真产出）" "$cp/.github/copilot-instructions.md"
else
  bad "inject/copilot: install.sh 存在" "缺失：$ADAPTERS/copilot/install.sh"
fi
# devin inject degraded（tier C 静态）：无 hook，install 落 .devin/workflows 静态层
assert_eq "inject/devin: registry 声明 degraded（tier C 静态）" degraded "$(reg_field devin inject_status)"
assert_ne "inject/devin: inject_fallback 非空" "" "$(reg_field devin inject_fallback)"
if [ -f "$ADAPTERS/devin/install.sh" ]; then
  cp="$TMP/devin-install"; mkdir -p "$cp"
  bash "$ADAPTERS/devin/install.sh" --target "$cp" --yes >/dev/null 2>&1 || true
  assert_file "inject/devin: install 落静态 workflow 层 .devin/workflows/pipeline.md（降级真产出）" "$cp/.devin/workflows/pipeline.md"
else
  bad "inject/devin: install.sh 存在" "缺失：$ADAPTERS/devin/install.sh"
fi

# ⑧.4 track conformance — native（gemini/copilot/pi 真 append history）/ degraded（devin 无自动留痕不伪装）
for id in gemini copilot pi; do
  line="$(drive_track "$id")"
  assert_contains "track/$id: 真 append history（与 baseline 记录等价）" "$line" '"raw":"Skill: pipeline-explore"'
done
assert_eq "track/devin: registry 声明 degraded（tier C 无 hook 自动留痕）" degraded "$(reg_field devin track_status)"
assert_ne "track/devin: track_fallback 非空" "" "$(reg_field devin track_fallback)"
assert_absent "track/devin: 无 hooks/track.sh（不伪装自动留痕）" "$ADAPTERS/devin/hooks/track.sh"

# ⑧.5 分档降级如实（tier 与三能力 status 与实际行为一致——诚实标降级档）
# gemini = 档 A 全保真：三能力全 native
assert_eq "tier/gemini: registry tier=A" A "$(reg_field gemini tier)"
assert_eq "tier/gemini: inject native" native "$(reg_field gemini inject_status)"
assert_eq "tier/gemini: veto native"  native "$(reg_field gemini veto_status)"
assert_eq "tier/gemini: track native" native "$(reg_field gemini track_status)"
# copilot = 档 B：veto/track native、inject degraded
assert_eq "tier/copilot: registry tier=B" B "$(reg_field copilot tier)"
assert_eq "tier/copilot: veto native"  native "$(reg_field copilot veto_status)"
assert_eq "tier/copilot: track native" native "$(reg_field copilot track_status)"
assert_eq "tier/copilot: inject degraded" degraded "$(reg_field copilot inject_status)"
# pi = 档 B：inject/track native、veto degraded（enforcement 走 .pi/extensions 运行时 + Unlock sentinel，无原生 pre-tool 硬拦）
assert_eq "tier/pi: registry tier=B" B "$(reg_field pi tier)"
assert_eq "tier/pi: inject native" native "$(reg_field pi inject_status)"
assert_eq "tier/pi: track native"  native "$(reg_field pi track_status)"
assert_eq "tier/pi: veto degraded"  degraded "$(reg_field pi veto_status)"
assert_ne "tier/pi: veto_fallback 非空（声明降级须给落点）" "" "$(reg_field pi veto_fallback)"
assert_absent "tier/pi: 无 hooks/veto.sh（veto 降级，不伪装原生硬拦）" "$ADAPTERS/pi/hooks/veto.sh"
# devin = 档 C 静态降级：hasHooks=false、三能力全 degraded
assert_eq "tier/devin: registry tier=C" C "$(reg_field devin tier)"
assert_eq "tier/devin: hasHooks=false" false "$(reg_field devin hasHooks)"
assert_eq "tier/devin: inject degraded" degraded "$(reg_field devin inject_status)"
assert_eq "tier/devin: veto degraded"  degraded "$(reg_field devin veto_status)"
assert_eq "tier/devin: track degraded" degraded "$(reg_field devin track_status)"

# ⑧.6 变异测试（反例哨兵）：改坏新平台的能力必被判别为红（证明新平台也进真判别路径，非空跑）
# 变异 D：改坏 gemini(A) 的 veto（放行）→ 判别器须报 ≠ baseline（= 会被 ⑧.2 抓红）
mkdir -p "$TMP/broken-gemini/hooks"
cat > "$TMP/broken-gemini/hooks/veto.sh" <<'BROKEN'
#!/usr/bin/env bash
exit 0
BROKEN
chmod +x "$TMP/broken-gemini/hooks/veto.sh"
p="$(mk_proj mut-gemini)"; touch "$p/.pipeline-pending-review"
b="$(baseline_veto "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}")"
d="$(drive_veto_at "$TMP/broken-gemini/hooks/veto.sh" exit2-stderr "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}")"
assert_eq "变异/gemini: baseline 对新鲜 marker = DENY" DENY "$b"
assert_ne "变异/gemini: 改坏的 veto（放行）被判别为 ≠ baseline → 抓红" "$b" "$d"
# 变异 E：改坏 copilot(B) 的 track（不写）→ 判别器须发现 history 未增（= 会被 ⑧.4 抓红）
mkdir -p "$TMP/broken-copilot/hooks"
cat > "$TMP/broken-copilot/hooks/track.sh" <<'BROKEN'
#!/usr/bin/env bash
exit 0
BROKEN
chmod +x "$TMP/broken-copilot/hooks/track.sh"
p="$(mk_change_proj mut-copilot)"
printf "$TRACK_JSON_TMPL" "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$TMP/broken-copilot/hooks/track.sh" postToolUse >/dev/null 2>&1 || true
if [ -f "$p/$HIST" ]; then bad "变异/copilot: 改坏的 track（不写）被抓红" "history 竟被写了：$(cat "$p/$HIST")"
else ok "变异/copilot: 改坏的 track（不写 history）被判别为红（history 未生成）"; fi

# ════════════════════════════════════════════════════════════════════════════
# ⑨ 长尾铺量 #41 conformance（zed/aider/continue/cline/amp）
#    zed(C 全静态) · aider(B veto 降级 commit-gate·inject/track native) ·
#    continue(A，CLI `cn` 与 CC 逐字同构) · cline(A，schema 不同构但三能力真 native) ·
#    amp(A，插件而非 exit-code 子进程，但三能力保真度不打折)。
#    同一组输入场景喂新平台 → 归一 canonical 决策 → native 断言等价 baseline / degraded 断言落
#    声明 fallback。continue/aider 复用既有 drive_veto_at/run_veto_new/drive_track 基础设施
#    （norm_veto 已扩两个新 format 分支）；cline/amp 因 I/O 形状不同构（stdin-only 嵌套 JSON /
#    Node 插件）新写专用 driver，但断言的仍是真实副作用与真实决策，非桩返回值。
# ════════════════════════════════════════════════════════════════════════════
LONGTAIL_IDS="zed aider continue cline amp"

# ⑨.0 lint 全绿（5 新平台进 platforms: 后各自填表完整）
for id in $LONGTAIL_IDS; do
  if [ -x "$LINT" ]; then
    if bash "$LINT" "$id" >/dev/null 2>&1; then ok "lint/$id: 填表完整（registry 字段齐全）"
    else bad "lint/$id: 填表完整（registry 字段齐全）" "见 bash $LINT $id"; fi
  else
    bad "lint/$id: lint-adapter.sh 可执行" "缺失或不可执行：$LINT"
  fi
done

# ⑨.1 零悬空：configure 脚本存在；各平台按自身容器形状核实 hook 产物可执行（无伪装）
for id in $LONGTAIL_IDS; do
  conf="$(reg_field "$id" configure)"
  if [ -n "$conf" ]; then assert_file "$id: configure 脚本存在（零悬空）：$conf" "$ROOT/$conf"
  else bad "$id: configure 字段非空" "registry 未登记 $id.configure"; fi
done
assert_exec  "continue hooks/inject.sh 可执行" "$ADAPTERS/continue/hooks/inject.sh"
assert_exec  "continue hooks/veto.sh 可执行"   "$ADAPTERS/continue/hooks/veto.sh"
assert_exec  "continue hooks/track.sh 可执行"  "$ADAPTERS/continue/hooks/track.sh"
assert_file  "continue settings.json 模板存在" "$ADAPTERS/continue/settings.json"
assert_exec  "aider hooks/inject.sh 可执行"     "$ADAPTERS/aider/hooks/inject.sh"
assert_exec  "aider hooks/veto.sh 可执行"       "$ADAPTERS/aider/hooks/veto.sh"
assert_exec  "aider hooks/track.sh 可执行"      "$ADAPTERS/aider/hooks/track.sh"
assert_exec  "cline hooks/PreToolUse 可执行"    "$ADAPTERS/cline/hooks/PreToolUse"
assert_exec  "cline hooks/PostToolUse 可执行"   "$ADAPTERS/cline/hooks/PostToolUse"
assert_exec  "cline hooks/TaskStart 可执行"     "$ADAPTERS/cline/hooks/TaskStart"
assert_exec  "cline hooks/TaskResume 可执行"    "$ADAPTERS/cline/hooks/TaskResume"
assert_file  "amp plugins/pipeline.js 存在"     "$ADAPTERS/amp/plugins/pipeline.js"
if command -v node >/dev/null 2>&1; then
  if node --check "$ADAPTERS/amp/plugins/pipeline.js" >/dev/null 2>&1; then ok "amp plugins/pipeline.js 语法有效（node --check）"
  else bad "amp plugins/pipeline.js 语法有效（node --check）" "node --check 报错"; fi
fi
assert_absent "zed 无 hooks/（hasHooks=false，不伪装强制）" "$ADAPTERS/zed/hooks"

# ════════════════════════════════════════════════════════════════════════════
# ⑨.2 continue（档 A，与 CC 逐字同构）——直接复用既有 run_veto_new/drive_track/inject 断言模式
# ════════════════════════════════════════════════════════════════════════════
assert_eq "tier/continue: registry tier=A" A "$(reg_field continue tier)"
p="$(mk_proj s9-continue-deny)"; touch "$p/.pipeline-pending-review"
run_veto_new "continue-V1-fresh-review" "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}" DENY continue
p="$(mk_proj s9-continue-none)"
run_veto_new "continue-V2-no-marker" "{\"cwd\":\"$p\",\"tool_name\":\"Bash\"}" ALLOW continue
p="$(mk_proj s9-continue-stale)"; touch "$p/.pipeline-pending-review"; touch_age "$p/.pipeline-pending-review" 4000
run_veto_new "continue-V3-stale" "{\"cwd\":\"$p\",\"tool_name\":\"Edit\"}" ALLOW continue
p="$(mk_proj s9-continue-nested)"; mkdir -p "$p/sub/deep"; touch "$p/.pipeline-pending-interaction"
run_veto_new "continue-V4-nested-cwd" "{\"cwd\":\"$p/sub/deep\",\"tool_name\":\"Write\"}" DENY continue

p="$(mk_change_proj s9-continue-inject)"
out="$(printf '{"cwd":"%s"}' "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/continue/hooks/inject.sh" SessionStart 2>/dev/null)"
assert_contains "inject/continue: 产出 hookSpecificOutput" "$out" "hookSpecificOutput"
assert_contains "inject/continue: additionalContext 真包 baseline 宪法" "$out" "pipeline-lite"

line="$(drive_track continue)"
assert_contains "track/continue: 真 append history（与 baseline 记录等价）" "$line" '"raw":"Skill: pipeline-explore"'

# ════════════════════════════════════════════════════════════════════════════
# ⑨.3 aider（档 B：veto 降级 commit-gate·inject/track native）
# ════════════════════════════════════════════════════════════════════════════
assert_eq "tier/aider: registry tier=B" B "$(reg_field aider tier)"
assert_eq "tier/aider: veto degraded"   degraded "$(reg_field aider veto_status)"
assert_eq "tier/aider: veto_fallback=commit-gate" commit-gate "$(reg_field aider veto_fallback)"
assert_eq "tier/aider: inject native"   native "$(reg_field aider inject_status)"
assert_eq "tier/aider: track native"    native "$(reg_field aider track_status)"

# veto：aider/hooks/veto.sh 支持与其余适配器同款 stdin JSON 调用协议（norm_veto 新增
# git-hook-exit-nonzero 分支），故可直接复用 run_veto_new 四场景。
p="$(mk_proj s9-aider-deny)"; touch "$p/.pipeline-pending-review"
run_veto_new "aider-V1-fresh-review" "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}" DENY aider
p="$(mk_proj s9-aider-none)"
run_veto_new "aider-V2-no-marker" "{\"cwd\":\"$p\",\"tool_name\":\"Bash\"}" ALLOW aider
p="$(mk_proj s9-aider-stale)"; touch "$p/.pipeline-pending-review"; touch_age "$p/.pipeline-pending-review" 4000
run_veto_new "aider-V3-stale" "{\"cwd\":\"$p\",\"tool_name\":\"Edit\"}" ALLOW aider

# inject：aider read: 文件是纯文本（非 JSON 包装，contract §3 不串格式）——断言纯文本含 baseline 宪法。
p="$(mk_change_proj s9-aider-inject)"
out="$(printf '{"cwd":"%s"}' "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/aider/hooks/inject.sh" SessionStart 2>/dev/null)"
assert_contains "inject/aider: 纯文本含 baseline 宪法（无 JSON 包装，不串格式）" "$out" "pipeline-lite"
case "$out" in *hookSpecificOutput*) bad "inject/aider: 未误用 JSON 包装" "纯文本输出里不该出现 hookSpecificOutput" ;; *) ok "inject/aider: 未误用 JSON 包装（纯文本，如实对应 read: 文件形态）" ;; esac

# track：aider 把 commit 当工作单元，skill 字段固定 "aider-edit"（诚实再解释，非伪造）。
p="$(mk_change_proj s9-aider-track)"
printf '{"cwd":"%s"}' "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/aider/hooks/track.sh" post-commit >/dev/null 2>&1 || true
if [ -f "$p/$HIST" ]; then
  assert_contains "track/aider: 真 append history（commit 工作单元，skill=aider-edit）" "$(cat "$p/$HIST")" '"raw":"Skill: aider-edit"'
else
  bad "track/aider: history 文件生成" "缺 $p/$HIST"
fi

# 端到端安装集成：真 git 仓库里跑 install.sh，断言 .aider.conf.yml / 上下文文件 / 真 git hook 落地
# 且 hook 真能挡/真能记（比单跑 wrapper 更进一步：验证 install.sh 接线本身无悬空）。
AIDER_IT="$TMP/aider-it"; mkdir -p "$AIDER_IT"
( cd "$AIDER_IT" && git init -q && git config user.email t@t.com && git config user.name t ) 2>/dev/null
mkdir -p "$AIDER_IT/openspec/changes/demo-change"
printf 'phase: explore\ntrack: backend\narchived: false\n' > "$AIDER_IT/openspec/changes/demo-change/.pipeline.yaml"
CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/aider/install.sh" --target "$AIDER_IT" --yes >/dev/null 2>&1
assert_file "aider install: .aider.conf.yml 落地" "$AIDER_IT/.aider.conf.yml"
assert_file "aider install: 上下文文件落地且含宪法" "$AIDER_IT/.aider-pipeline-context.md"
assert_contains "aider install: 上下文文件真含 baseline 宪法" "$(cat "$AIDER_IT/.aider-pipeline-context.md" 2>/dev/null)" "pipeline-lite"
assert_exec "aider install: .git/hooks/pre-commit 真落地可执行"  "$AIDER_IT/.git/hooks/pre-commit"
assert_exec "aider install: .git/hooks/post-commit 真落地可执行" "$AIDER_IT/.git/hooks/post-commit"
( cd "$AIDER_IT" && echo hi > f1.txt && git add f1.txt && git commit -q -m t1 </dev/null ) 2>/dev/null
if [ -f "$AIDER_IT/$HIST" ]; then ok "aider install 端到端：真 commit 后 history 真增（非单测 wrapper，是真装完的 git hook）"
else bad "aider install 端到端：真 commit 后 history 真增" "缺 $AIDER_IT/$HIST"; fi
( cd "$AIDER_IT" && touch .pipeline-pending-review && echo hi2 > f2.txt && git add f2.txt )
if ( cd "$AIDER_IT" && git commit -q -m t2 </dev/null ) 2>/dev/null; then
  bad "aider install 端到端：真装的 pre-commit 挡住新鲜 marker" "commit 竟然成功了"
else
  ok "aider install 端到端：真装的 pre-commit 真挡住新鲜 marker（commit 失败，非伪造硬拦）"
fi

# ════════════════════════════════════════════════════════════════════════════
# ⑨.4 cline（档 A：schema 与 CC 不同构——stdin-only 嵌套 JSON + 恒 JSON 输出，三能力仍 native）
# ════════════════════════════════════════════════════════════════════════════
assert_eq "tier/cline: registry tier=A" A "$(reg_field cline tier)"
assert_eq "tier/cline: inject native" native "$(reg_field cline inject_status)"
assert_eq "tier/cline: veto native"   native "$(reg_field cline veto_status)"
assert_eq "tier/cline: track native"  native "$(reg_field cline track_status)"

drive_veto_cline() { # <cwd> <toolName> -> DENY/ALLOW（cline 专用：嵌套 JSON + 恒 JSON 输出）
  local cwd="$1" tool="$2" json out
  json="$(printf '{"hookName":"PreToolUse","workspaceRoots":["%s"],"preToolUse":{"toolName":"%s","parameters":{}}}' "$cwd" "$tool")"
  out="$(printf '%s' "$json" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/cline/hooks/PreToolUse" 2>/dev/null)"
  norm_veto cancel-json 0 "$out"
}
run_cline_veto_scenario() { # <名> <cwd> <toolName> <expect>
  local name="$1" cwd="$2" tool="$3" expect="$4" b d
  b="$(baseline_veto "{\"cwd\":\"$cwd\",\"tool_name\":\"$tool\"}")"
  assert_eq "veto/cline-$name: baseline gate.sh 决策 = $expect" "$expect" "$b"
  d="$(drive_veto_cline "$cwd" "$tool")"
  assert_eq "veto/cline-$name: cline 与 baseline 等价 ($expect)" "$expect" "$d"
}
p="$(mk_proj s9-cline-deny)"; touch "$p/.pipeline-pending-review"
run_cline_veto_scenario "V1-fresh-review" "$p" write_to_file DENY
p="$(mk_proj s9-cline-none)"
run_cline_veto_scenario "V2-no-marker" "$p" execute_command ALLOW
p="$(mk_proj s9-cline-stale)"; touch "$p/.pipeline-pending-review"; touch_age "$p/.pipeline-pending-review" 4000
run_cline_veto_scenario "V3-stale" "$p" read_file ALLOW
p="$(mk_proj s9-cline-nested)"; mkdir -p "$p/sub/deep"; touch "$p/.pipeline-pending-interaction"
run_cline_veto_scenario "V4-nested-cwd" "$p/sub/deep" write_to_file DENY

p="$(mk_change_proj s9-cline-inject)"
json="$(printf '{"hookName":"TaskStart","workspaceRoots":["%s"],"taskStart":{"taskMetadata":{"taskId":"t1","ulid":"u1","initialTask":"x"}}}' "$p")"
out="$(printf '%s' "$json" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/cline/hooks/TaskStart" 2>/dev/null)"
assert_contains "inject/cline(TaskStart): 产出 contextModification 字段" "$out" "contextModification"
assert_contains "inject/cline(TaskStart): 真含 baseline 宪法" "$out" "pipeline-lite"
json2="$(printf '{"hookName":"TaskResume","workspaceRoots":["%s"],"taskResume":{"taskMetadata":{"taskId":"t1","ulid":"u1"},"previousState":{}}}' "$p")"
out2="$(printf '%s' "$json2" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/cline/hooks/TaskResume" 2>/dev/null)"
assert_contains "inject/cline(TaskResume): 委托 TaskStart 同款注入" "$out2" "contextModification"

p="$(mk_change_proj s9-cline-track)"
json3="$(printf '{"hookName":"PostToolUse","workspaceRoots":["%s"],"postToolUse":{"toolName":"pipeline-explore","parameters":{},"result":"ok","success":true,"executionTimeMs":1}}' "$p")"
printf '%s' "$json3" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$ADAPTERS/cline/hooks/PostToolUse" >/dev/null 2>&1 || true
if [ -f "$p/$HIST" ]; then
  assert_contains "track/cline: 真 append history（真实工具名强制映射，与 baseline 等价记录）" "$(cat "$p/$HIST")" '"raw":"Skill: pipeline-explore"'
else
  bad "track/cline: history 文件生成" "缺 $p/$HIST"
fi
CLINE_IT="$TMP/cline-it"; mkdir -p "$CLINE_IT"
bash "$ADAPTERS/cline/install.sh" --target "$CLINE_IT" --yes >/dev/null 2>&1
assert_contains "cline install: shim 转发到本仓库绝对路径（非拷贝，逻辑单一来源）" \
  "$(cat "$CLINE_IT/.clinerules/hooks/PreToolUse" 2>/dev/null)" "$ADAPTERS/cline/hooks/PreToolUse"

# ════════════════════════════════════════════════════════════════════════════
# ⑨.5 amp（档 A：进程内插件而非 exit-code 子进程，三能力保真度不打折——见 README §4/§5）
# ════════════════════════════════════════════════════════════════════════════
assert_eq "tier/amp: registry tier=A" A "$(reg_field amp tier)"
assert_eq "tier/amp: inject native" native "$(reg_field amp inject_status)"
assert_eq "tier/amp: veto native"   native "$(reg_field amp veto_status)"
assert_eq "tier/amp: track native"  native "$(reg_field amp track_status)"

AMP_PLUGIN="$ADAPTERS/amp/plugins/pipeline.js"
HAVE_NODE=0; command -v node >/dev/null 2>&1 && HAVE_NODE=1
if [ "$HAVE_NODE" = 1 ]; then
  drive_veto_amp() { # <cwd> <toolName> -> DENY/ALLOW
    local out
    out="$(CLAUDE_PLUGIN_ROOT="$ROOT" node "$AMP_PLUGIN" __test decideToolCall "$1" "$2" 2>/dev/null)"
    norm_veto reject-and-continue 0 "$out"
  }
  run_amp_veto_scenario() { # <名> <cwd> <toolName> <expect>
    local name="$1" cwd="$2" tool="$3" expect="$4" b d
    b="$(baseline_veto "{\"cwd\":\"$cwd\",\"tool_name\":\"$tool\"}")"
    assert_eq "veto/amp-$name: baseline gate.sh 决策 = $expect" "$expect" "$b"
    d="$(drive_veto_amp "$cwd" "$tool")"
    assert_eq "veto/amp-$name: amp 与 baseline 等价 ($expect)" "$expect" "$d"
  }
  p="$(mk_proj s9-amp-deny)"; touch "$p/.pipeline-pending-review"
  run_amp_veto_scenario "V1-fresh-review" "$p" Write DENY
  p="$(mk_proj s9-amp-none)"
  run_amp_veto_scenario "V2-no-marker" "$p" Bash ALLOW
  p="$(mk_proj s9-amp-stale)"; touch "$p/.pipeline-pending-review"; touch_age "$p/.pipeline-pending-review" 4000
  run_amp_veto_scenario "V3-stale" "$p" Edit ALLOW
  p="$(mk_proj s9-amp-nested)"; mkdir -p "$p/sub/deep"; touch "$p/.pipeline-pending-interaction"
  run_amp_veto_scenario "V4-nested-cwd" "$p/sub/deep" Write DENY

  p="$(mk_change_proj s9-amp-inject)"
  out="$(CLAUDE_PLUGIN_ROOT="$ROOT" node "$AMP_PLUGIN" __test buildInjectContext "$p" 2>/dev/null)"
  assert_contains "inject/amp: buildInjectContext 真含 baseline 宪法" "$out" "pipeline-lite"

  p="$(mk_change_proj s9-amp-track)"
  CLAUDE_PLUGIN_ROOT="$ROOT" node "$AMP_PLUGIN" __test recordToolResult "$p" pipeline-explore >/dev/null 2>&1 || true
  if [ -f "$p/$HIST" ]; then
    assert_contains "track/amp: 真 append history（真实工具名强制映射，与 baseline 等价记录）" "$(cat "$p/$HIST")" '"raw":"Skill: pipeline-explore"'
  else
    bad "track/amp: history 文件生成" "缺 $p/$HIST"
  fi

  # 插件注册层（amp.on 挂接）也真跑一次，不只测纯函数：mock PluginAPI 验证 once-per-thread inject 门控真生效。
  MOCK_HARNESS="$TMP/amp-mock-harness.mjs"
  cat > "$MOCK_HARNESS" <<'MOCKEOF'
const { default: plugin } = await import(process.argv[2]);
const handlers = {};
plugin({ on(e, h) { handlers[e] = h; } });
const cwd = process.argv[3];
const r1 = await handlers["agent.start"]({ thread: { id: "tA" }, cwd }, {});
const r2 = await handlers["agent.start"]({ thread: { id: "tA" }, cwd }, {});
console.log(JSON.stringify({ firstTurnMsgCount: r1.messages.length, secondTurnMsgCount: r2.messages.length }));
MOCKEOF
  p="$(mk_change_proj s9-amp-plugin-wiring)"
  out="$(CLAUDE_PLUGIN_ROOT="$ROOT" node "$MOCK_HARNESS" "$AMP_PLUGIN" "$p" 2>/dev/null)"
  assert_contains "amp 插件注册层：首回合真注入（messages 非空）" "$out" '"firstTurnMsgCount":1'
  assert_contains "amp 插件注册层：同线程次回合不重复注入（模拟 CC 每会话一次）" "$out" '"secondTurnMsgCount":0'
else
  printf 'SKIP - amp 全部运行时 conformance（无 node，跳过；lint/文件存在性断言仍生效，环境限制如实标注）\n'
fi

AMP_IT="$TMP/amp-it"; mkdir -p "$AMP_IT"
bash "$ADAPTERS/amp/install.sh" --target "$AMP_IT" --yes >/dev/null 2>&1
assert_file "amp install: .amp/plugins/pipeline.js 落地" "$AMP_IT/.amp/plugins/pipeline.js"
assert_contains "amp install: PIPELINE_ROOT 占位符已替换为绝对路径" \
  "$(cat "$AMP_IT/.amp/plugins/pipeline.js" 2>/dev/null)" "$ROOT"
case "$(cat "$AMP_IT/.amp/plugins/pipeline.js" 2>/dev/null)" in
  *__PIPELINE_ROOT__*) bad "amp install: 占位符不残留" "__PIPELINE_ROOT__ 字面量仍在文件里，替换失败" ;;
  *) ok "amp install: 占位符不残留（sed 替换真生效）" ;;
esac

# ════════════════════════════════════════════════════════════════════════════
# ⑨.6 zed（档 C：全静态降级，同 devin 形）
# ════════════════════════════════════════════════════════════════════════════
assert_eq "tier/zed: registry tier=C" C "$(reg_field zed tier)"
assert_eq "tier/zed: hasHooks=false" false "$(reg_field zed hasHooks)"
assert_eq "tier/zed: inject degraded" degraded "$(reg_field zed inject_status)"
assert_eq "tier/zed: veto degraded"   degraded "$(reg_field zed veto_status)"
assert_eq "tier/zed: track degraded"  degraded "$(reg_field zed track_status)"
ZED_IT="$TMP/zed-it"; mkdir -p "$ZED_IT"
bash "$ADAPTERS/zed/install.sh" --target "$ZED_IT" --yes >/dev/null 2>&1
assert_file "zed install: .rules 静态层落地" "$ZED_IT/.rules"
assert_contains "zed install: .rules 真含 pipeline 静态引导内容" "$(cat "$ZED_IT/.rules" 2>/dev/null)" "Pipeline Workflow"
# 幂等：重装一次不应产生第二份哨兵块
bash "$ADAPTERS/zed/install.sh" --target "$ZED_IT" --yes >/dev/null 2>&1
cnt="$(grep -c "PIPELINE:ZED:START" "$ZED_IT/.rules" 2>/dev/null || echo 0)"
assert_eq "zed install: 重装幂等（哨兵块恰一份，不重复）" "1" "$cnt"

# ════════════════════════════════════════════════════════════════════════════
# ⑨.7 变异测试（反例哨兵）：新架构形态（JSON-only 输出 / Node 插件）也要能被抓红，非空跑
# ════════════════════════════════════════════════════════════════════════════
# 变异 F：改坏 cline(A) 的 PreToolUse（恒放行）→ 判别器须报 ≠ baseline（会被 ⑨.4 抓红）
mkdir -p "$TMP/broken-cline"
cat > "$TMP/broken-cline/PreToolUse" <<'BROKEN'
#!/usr/bin/env bash
cat >/dev/null 2>&1
printf '{"cancel":false}\n'
BROKEN
chmod +x "$TMP/broken-cline/PreToolUse"
p="$(mk_proj mut-cline)"; touch "$p/.pipeline-pending-review"
b="$(baseline_veto "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}")"
json="$(printf '{"hookName":"PreToolUse","workspaceRoots":["%s"],"preToolUse":{"toolName":"Write","parameters":{}}}' "$p")"
broken_out="$(printf '%s' "$json" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$TMP/broken-cline/PreToolUse" 2>/dev/null)"
d="$(norm_veto cancel-json 0 "$broken_out")"
assert_eq "变异/cline: baseline 对新鲜 marker = DENY" DENY "$b"
assert_ne "变异/cline: 改坏的 PreToolUse（恒 cancel:false）被判别为 ≠ baseline → 抓红" "$b" "$d"

# 变异 G：改坏 amp(A) 的插件（tool.call 恒 allow）→ 判别器须报 ≠ baseline（会被 ⑨.5 抓红）
if [ "$HAVE_NODE" = 1 ]; then
  mkdir -p "$TMP/broken-amp"
  cat > "$TMP/broken-amp/pipeline.js" <<'BROKEN'
export function decideToolCall() { return { action: "allow" }; }
export function buildInjectContext() { return null; }
export function recordToolResult() {}
async function main() {
  const [, , mode, fnName, ...rest] = process.argv;
  if (mode !== "__test") return;
  const fns = { decideToolCall, buildInjectContext, recordToolResult };
  const fn = fns[fnName];
  const result = await fn(...rest);
  process.stdout.write(`${JSON.stringify(result === undefined ? null : result)}\n`);
}
if (process.argv[2] === "__test") { main(); }
BROKEN
  p="$(mk_proj mut-amp)"; touch "$p/.pipeline-pending-review"
  b="$(baseline_veto "{\"cwd\":\"$p\",\"tool_name\":\"Write\"}")"
  broken_out2="$(node "$TMP/broken-amp/pipeline.js" __test decideToolCall "$p" Write 2>/dev/null)"
  d2="$(norm_veto reject-and-continue 0 "$broken_out2")"
  assert_eq "变异/amp: baseline 对新鲜 marker = DENY" DENY "$b"
  assert_ne "变异/amp: 改坏的插件（tool.call 恒 allow）被判别为 ≠ baseline → 抓红" "$b" "$d2"
else
  printf 'SKIP - 变异/amp: 无 node，跳过（不计入 pass，也不误判——环境限制如实标注）\n'
fi

# 变异 H：改坏 aider(B) 的 track（post-commit 不写）→ 判别器须发现 history 未增
mkdir -p "$TMP/broken-aider"
cat > "$TMP/broken-aider/track.sh" <<'BROKEN'
#!/usr/bin/env bash
cat >/dev/null 2>&1
exit 0
BROKEN
chmod +x "$TMP/broken-aider/track.sh"
p="$(mk_change_proj mut-aider-track)"
printf '{"cwd":"%s"}' "$p" | CLAUDE_PLUGIN_ROOT="$ROOT" bash "$TMP/broken-aider/track.sh" post-commit >/dev/null 2>&1 || true
if [ -f "$p/$HIST" ]; then bad "变异/aider: 改坏的 track（不写）被抓红" "history 竟被写了：$(cat "$p/$HIST")"
else ok "变异/aider: 改坏的 track（不写 history）被判别为红（history 未生成）"; fi

# ════════════════════════════════════════════════════════════════════════════
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
