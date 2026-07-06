#!/usr/bin/env bash
# tools/oracle/run.sh — T6 golden-oracle 双跑 harness
#
# 对同一 fixture 项目分别跑老内核 bash 状态机（oracle）与新 TS CLI，对
# init / get / set / transition / check 逐命令比三面：stdout、exit code、
# 落盘 openspec/changes/<name>/.pipeline.yaml（逐字 diff）。
#
# 白名单（唯二放宽，其余逐字）：
#   · 时间戳字段值：`*_at` 字段只比 key 存在性（值统一归一为 <WHITELISTED>）
#   · 老内核历史区块：tools_history / prompts_history / transitions_history 的
#     key 行 + `  - ` 项行两侧剥除后再 diff（老内核 transition 会往 yaml 追加历史项，
#     lite 契约写 .pipeline-history.jsonl）。fixture 预置的历史尾块另做 PRESERVE
#     校验：全程跑完后新侧 yaml 必须逐字保留基线块（CONTRACT §1「读时跳过、写回原样」）。
#   · check 的 stdout 是人读 guard 报告（CONTRACT §3），stdout 面记 SKIP、exit 面照比。
#
# 用法:
#   bash tools/oracle/run.sh [fixture ...]      # 缺省跑全部 fixtures/*.sh
#
# 环境变量:
#   ORACLE_OLD_SCRIPT     oracle 脚本路径（默认老仓 pipeline-state.sh）
#   ORACLE_NEW_CLI        新 CLI 命令串（默认 node <repo>/packages/cli/dist/main.js；
#                         设置后跳过构建产物存在性检查——测试注入 stub 用）
#   ORACLE_REPO_ROOT      仓库根覆盖（默认本脚本上两级）
#   ORACLE_WORKDIR        工作目录（默认 mktemp；保留现场，报告在 <workdir>/report.txt）
#   ORACLE_FORCE_DEGRADED 置 1 强制降级（契约测试）模式
#
# 退出码:
#   0 = 双跑全一致，或降级模式（降级恒 0，报告标明 DEGRADED——LOOP.md kill criteria 第 3 条语义）
#   1 = 双跑存在不一致
#   2 = 新 CLI 构建产物缺失（先 npm run build）
set -uo pipefail

ORACLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${ORACLE_REPO_ROOT:-$(cd "$ORACLE_DIR/../.." && pwd)}"
OLD_SCRIPT="${ORACLE_OLD_SCRIPT:-/Users/a1234/Documents/code-manager/projects/workflow-plugin/skills/pipeline/scripts/pipeline-state.sh}"
NEW_CLI_DEFAULT="$REPO_ROOT/packages/cli/dist/main.js"

if [ -n "${ORACLE_NEW_CLI:-}" ]; then
  # 测试注入口：整串按空白切词（路径含空格不支持）
  read -r -a NEW_CMD <<<"$ORACLE_NEW_CLI"
else
  if [ ! -f "$NEW_CLI_DEFAULT" ]; then
    echo "先 npm run build（缺新 CLI 构建产物: ${NEW_CLI_DEFAULT}）" >&2
    exit 2
  fi
  NEW_CMD=(node "$NEW_CLI_DEFAULT")
fi

WORKDIR="${ORACLE_WORKDIR:-$(mktemp -d "${TMPDIR:-/tmp}/pipeline-oracle.XXXXXX")}"
mkdir -p "$WORKDIR"
REPORT="$WORKDIR/report.txt"
ROWS="$WORKDIR/rows.tsv"
: > "$REPORT"
: > "$ROWS"

say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
row() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" "$6" >> "$ROWS"; }

# types.ts::FIELD_ORDER 的 37 字段（降级模式 yaml 面 = 契约 §1 字段序校验）
FIELD_ORDER_STR="track preset created_by assignee phase phase_status design_doc plan verification_report build_mode isolation build_sha agent_review_result codex_review_result verify_result branch_status direct_override prd_path pr_url automation automation_queued_at automation_sandbox automation_worktree automation_attempts automation_last_error automation_preserved_path branch base_branch scope related_files spec_scope depends_on created_at updated_at verified_at archived_at archived"

FAILS=0
DEGRADED_REASON=""
MODE=dual

count_fail() { [ "$1" = FAIL ] && FAILS=$((FAILS + 1)); return 0; }

is_ts_field() { case "${1:-}" in *_at) return 0 ;; *) return 1 ;; esac; }

# 三面白名单归一：剥历史区块 + *_at 值归一
normalize_yaml() {
  awk '
    /^(tools_history|prompts_history|transitions_history):/ { inhist = 1; next }
    {
      if (inhist) {
        if ($0 ~ /^[[:space:]]+- /) next
        inhist = 0
      }
      if ($0 ~ /^[a-z_]+_at:/) { sub(/:.*$/, ": <WHITELISTED>"); print; next }
      print
    }
  ' "$1"
}

# 契约 §1：37 字段按 FIELD_ORDER 全量在序（未知行/历史区不计）
keyorder_ok() {
  local got
  got=$(awk -v list="$FIELD_ORDER_STR" '
    BEGIN { n = split(list, a, " "); for (i = 1; i <= n; i++) known[a[i]] = 1 }
    match($0, /^[a-z_]+:/) {
      k = substr($0, 1, RLENGTH - 1)
      if (k in known) { printf "%s%s", sep, k; sep = " " }
    }
  ' "$1")
  [ "$got" = "$FIELD_ORDER_STR" ]
}

# 老/新两侧参数映射（老: init <name> <track> <preset> / check <name> <phase>；
#  新: init <name> --track --preset [--user] / check <name>——CONTRACT §3）
build_args() {
  local cmd="$1"; shift
  case "$cmd" in
    init)
      OLD_ARGS=(init "$1" "$2" "$3" --user oracle)
      NEW_ARGS=(init "$1" --track "$2" --preset "$3" --user oracle)
      ;;
    check)
      OLD_ARGS=(check "$1" "$2")
      NEW_ARGS=(check "$1")
      ;;
    *)
      OLD_ARGS=("$cmd" "$@")
      NEW_ARGS=("$cmd" "$@")
      ;;
  esac
}

# ---------- oracle 可用性探针 ----------
probe_oracle() {
  local pd="$WORKDIR/.probe" out phase
  rm -rf "$pd"
  mkdir -p "$pd/openspec/changes"
  if ! out=$(cd "$pd" && PIPELINE_ASSUME_YES=1 bash "$OLD_SCRIPT" init oracle-probe backend full --user oracle 2>&1); then
    DEGRADED_REASON="老脚本 init 探针失败: $(printf '%s' "$out" | tail -n 3 | tr '\n' ' ')"
    return 1
  fi
  phase=$(cd "$pd" && PIPELINE_ASSUME_YES=1 bash "$OLD_SCRIPT" get oracle-probe phase 2>/dev/null)
  if [ "$phase" != "open" ]; then
    DEGRADED_REASON="老脚本 get 探针异常（phase='$phase'，期望 open）"
    return 1
  fi
  return 0
}

if [ "${ORACLE_FORCE_DEGRADED:-0}" = "1" ]; then
  MODE=degraded
  DEGRADED_REASON="ORACLE_FORCE_DEGRADED=1（人工强制降级）"
elif [ ! -f "$OLD_SCRIPT" ]; then
  MODE=degraded
  DEGRADED_REASON="老脚本不存在: $OLD_SCRIPT"
elif ! probe_oracle; then
  MODE=degraded
fi

say "golden-oracle 双跑 harness (T6)"
say "  oracle : $OLD_SCRIPT"
say "  new CLI: ${NEW_CMD[*]}"
say "  workdir: $WORKDIR"
if [ "$MODE" = degraded ]; then
  say ""
  say "DEGRADED: 契约测试模式 — 老脚本(oracle)不可独立运行，本次不做双跑。"
  say "  原因: $DEGRADED_REASON"
  say "  仅校验新 CLI 输出是否符合 docs/CONTRACT.md §3 契约表 + §1 字段序；"
  say "  本次恒 exit 0（LOOP.md kill criteria 第 3 条语义），报告已标明降级。"
else
  say "  模式  : DUAL（双跑逐字对比；oracle 探针通过）"
fi
say ""

# ---------- 双跑单步 ----------
run_step_dual() {
  local fx="$1" idx="$2" cmd="$3" step_dir="$4" base="$5"
  shift 5
  local args=("$@")
  local change="${args[0]}"
  local old_rc new_rc f_out f_exit f_yaml label

  (cd "$base/old" && PIPELINE_ASSUME_YES=1 bash "$OLD_SCRIPT" "${OLD_ARGS[@]}") \
    > "$step_dir/old.out" 2> "$step_dir/old.err"
  old_rc=$?
  (cd "$base/new" && "${NEW_CMD[@]}" "${NEW_ARGS[@]}") \
    > "$step_dir/new.out" 2> "$step_dir/new.err"
  new_rc=$?

  # exit 面
  f_exit=PASS
  [ "$old_rc" = "$new_rc" ] || f_exit=FAIL

  # stdout 面
  if [ "$cmd" = check ]; then
    f_out=SKIP # 人读 guard 报告（CONTRACT §3）
  elif [ "$cmd" = get ] && is_ts_field "${args[1]:-}"; then
    local o n
    o=$(tr -d '[:space:]' < "$step_dir/old.out")
    n=$(tr -d '[:space:]' < "$step_dir/new.out")
    if { [ -n "$o" ] && [ -n "$n" ]; } || { [ -z "$o" ] && [ -z "$n" ]; }; then
      f_out=PASS # 时间戳白名单：比存在性不比值
    else
      f_out=FAIL
    fi
  elif cmp -s "$step_dir/old.out" "$step_dir/new.out"; then
    f_out=PASS
  else
    f_out=FAIL
  fi

  # yaml 面
  local oy="$base/old/openspec/changes/$change/.pipeline.yaml"
  local ny="$base/new/openspec/changes/$change/.pipeline.yaml"
  if [ ! -f "$oy" ] && [ ! -f "$ny" ]; then
    f_yaml=SKIP
  elif [ -f "$oy" ] && [ -f "$ny" ]; then
    normalize_yaml "$oy" > "$step_dir/old.norm"
    normalize_yaml "$ny" > "$step_dir/new.norm"
    if diff -u "$step_dir/old.norm" "$step_dir/new.norm" > "$step_dir/yaml.diff" 2>&1; then
      f_yaml=PASS
    else
      f_yaml=FAIL
    fi
  else
    f_yaml=FAIL
    printf '单侧缺文件: old=%s new=%s\n' "$([ -f "$oy" ] && echo 有 || echo 无)" "$([ -f "$ny" ] && echo 有 || echo 无)" > "$step_dir/yaml.diff"
  fi

  label="$cmd ${args[*]}"
  label="${label:0:30}"
  row "$fx" "$idx" "$label" "$f_out" "$f_exit" "$f_yaml"
  count_fail "$f_out"; count_fail "$f_exit"; count_fail "$f_yaml"

  if [ "$f_out" = FAIL ]; then
    say "  x [$fx #$idx $label] stdout 不一致："
    sed 's/^/      old| /' "$step_dir/old.out" | head -5 | tee -a "$REPORT"
    sed 's/^/      new| /' "$step_dir/new.out" | head -5 | tee -a "$REPORT"
  fi
  if [ "$f_exit" = FAIL ]; then
    say "  x [$fx #$idx $label] exit 不一致: old=$old_rc new=$new_rc"
  fi
  if [ "$f_yaml" = FAIL ]; then
    say "  x [$fx #$idx $label] .pipeline.yaml 不一致（白名单归一后）："
    head -40 "$step_dir/yaml.diff" | sed 's/^/      /' | tee -a "$REPORT"
  fi
}

# ---------- 降级（契约测试）单步 ----------
run_step_degraded() {
  local fx="$1" idx="$2" cmd="$3" step_dir="$4" base="$5" expect="$6"
  shift 6
  local args=("$@")
  local change="${args[0]}"
  local new_rc f_out f_exit f_yaml label

  (cd "$base/new" && "${NEW_CMD[@]}" "${NEW_ARGS[@]}") \
    > "$step_dir/new.out" 2> "$step_dir/new.err"
  new_rc=$?

  # exit 面：契约表期望值（fixture 计划第 1 列）
  f_exit=PASS
  [ "$new_rc" = "$expect" ] || f_exit=FAIL

  # stdout 面：CONTRACT §3 契约
  if [ "$expect" != 0 ]; then
    # 出错路径：stdout 必须干净（报错走 stderr）
    if [ -s "$step_dir/new.out" ]; then f_out=FAIL; else f_out=PASS; fi
  else
    case "$cmd" in
      init) # 创建路径一行
        if [ "$(wc -l < "$step_dir/new.out" | tr -d ' ')" = 1 ] && [ -s "$step_dir/new.out" ]; then
          f_out=PASS
        else
          f_out=FAIL
        fi
        ;;
      get) # 裸值，无尾空格
        if grep -qE '[[:blank:]]$' "$step_dir/new.out"; then f_out=FAIL; else f_out=PASS; fi
        ;;
      set) # 无输出
        if [ -s "$step_dir/new.out" ]; then f_out=FAIL; else f_out=PASS; fi
        ;;
      transition) # `old -> new` 一行
        if grep -qE '^[a-z]+ -> [a-z]+$' "$step_dir/new.out" \
          && [ "$(wc -l < "$step_dir/new.out" | tr -d ' ')" = 1 ]; then
          f_out=PASS
        else
          f_out=FAIL
        fi
        ;;
      check) f_out=SKIP ;; # 人读 guard 报告
      *) f_out=SKIP ;;
    esac
  fi

  # yaml 面：契约 §1 字段序（37 字段全量在序）
  local ny="$base/new/openspec/changes/$change/.pipeline.yaml"
  if [ -f "$ny" ]; then
    if keyorder_ok "$ny"; then f_yaml=PASS; else f_yaml=FAIL; fi
  elif [ "$cmd" = init ] && [ "$expect" = 0 ]; then
    f_yaml=FAIL
  else
    f_yaml=SKIP
  fi

  label="$cmd ${args[*]}"
  label="${label:0:30}"
  row "$fx" "$idx" "$label" "$f_out" "$f_exit" "$f_yaml"
  count_fail "$f_out"; count_fail "$f_exit"; count_fail "$f_yaml"

  [ "$f_exit" = FAIL ] && say "  x [$fx #$idx $label] exit 不符契约: got=$new_rc want=$expect"
  [ "$f_out" = FAIL ] && say "  x [$fx #$idx $label] stdout 不符 CONTRACT §3 契约（cmd=${cmd}）"
  [ "$f_yaml" = FAIL ] && say "  x [$fx #$idx $label] .pipeline.yaml 不符 §1 字段序契约"
  return 0
}

# ---------- 历史尾块 PRESERVE 校验（新侧，逐字子串） ----------
check_preserve() {
  local fx="$1" base="$2"
  local pf="$base/new/.oracle-preserve"
  [ -f "$pf" ] || return 0
  local change baseline content res
  change=$(head -n 1 "$pf")
  baseline=$(tail -n +2 "$pf")
  content=$(cat "$base/new/openspec/changes/$change/.pipeline.yaml" 2>/dev/null || printf '')
  case "$content" in
    *"$baseline"*) res=PASS ;;
    *)
      res=FAIL
      say "  x [$fx PRESERVE] 老内核 base64 历史尾块未被新侧逐字保留（CONTRACT §1）"
      ;;
  esac
  count_fail "$res"
  row "$fx" "--" "PRESERVE(history-tail)" "-" "-" "$res"
}

# ---------- fixture 主循环 ----------
run_fixture() {
  local fx="$1"
  local fxsh="$ORACLE_DIR/fixtures/$fx.sh"
  if [ ! -f "$fxsh" ]; then
    say "x fixture 不存在: ${fx}（可用: $(ls "$ORACLE_DIR/fixtures" | sed 's/\.sh$//' | tr '\n' ' ')）"
    FAILS=$((FAILS + 1))
    return 0
  fi
  local base="$WORKDIR/$fx"
  rm -rf "$base"
  mkdir -p "$base"
  local sides="new"
  [ "$MODE" = dual ] && sides="old new"
  local s
  for s in $sides; do
    if ! bash "$fxsh" "$base/$s" > "$base/fixture-gen.$s.log" 2>&1; then
      say "x fixture 生成失败: $fx ($s)，见 $base/fixture-gen.$s.log"
      FAILS=$((FAILS + 1))
      return 0
    fi
  done

  say "== fixture: $fx =="
  local plan="$base/new/.oracle-plan"
  local idx=0 line
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    idx=$((idx + 1))
    local F
    IFS=$'\t' read -r -a F <<< "$line"
    local expect="${F[0]}" cmd="${F[1]}"
    local args=("${F[@]:2}")
    local step_dir
    step_dir="$base/steps/$(printf '%02d' "$idx")"
    mkdir -p "$step_dir"
    build_args "$cmd" "${args[@]}"
    if [ "$MODE" = dual ]; then
      run_step_dual "$fx" "$idx" "$cmd" "$step_dir" "$base" "${args[@]}"
    else
      run_step_degraded "$fx" "$idx" "$cmd" "$step_dir" "$base" "$expect" "${args[@]}"
    fi
  done < "$plan"
  check_preserve "$fx" "$base"
}

FIXTURES=("$@")
if [ ${#FIXTURES[@]} -eq 0 ]; then
  FIXTURES=(backend-full frontend-quotegate pm-history)
fi

for fx in "${FIXTURES[@]}"; do
  run_fixture "$fx"
done

# ---------- 汇总（命令 × 三面） ----------
say ""
say "=== 汇总（命令 × 三面：STDOUT / EXIT / YAML）==="
{
  printf '%-20s %-4s %-32s %-7s %-7s %-7s\n' FIXTURE STEP COMMAND STDOUT EXIT YAML
  while IFS=$'\t' read -r c1 c2 c3 c4 c5 c6; do
    printf '%-20s %-4s %-32s %-7s %-7s %-7s\n' "$c1" "$c2" "$c3" "$c4" "$c5" "$c6"
  done < "$ROWS"
} | tee -a "$REPORT"
say ""

if [ "$MODE" = degraded ]; then
  say "DEGRADED: 契约测试模式（未做双跑）。原因: $DEGRADED_REASON"
  say "结果: 契约不符 $FAILS 项（降级运行恒 exit 0，报告已标明降级）"
  say "报告: $REPORT"
  exit 0
fi

if [ "$FAILS" -eq 0 ]; then
  say "结果: 双跑全部一致（0 处不一致）"
  say "报告: $REPORT"
  exit 0
fi
say "结果: $FAILS 处不一致（明细见上方与 ${REPORT}，现场保留在 ${WORKDIR}）"
say "报告: $REPORT"
exit 1
