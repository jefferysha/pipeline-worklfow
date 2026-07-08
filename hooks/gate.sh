#!/usr/bin/env bash
# gate.sh — PreToolUse 统一交互门（lite 版，语义对齐老内核 pipeline-gate.sh）。
#
# 机制：项目根存在新鲜（TTL 分级，CONTRACT §2 / types.ts GATE_TTL_MS）的
#   .pipeline-pending-{confirm,review,interaction} 任一 marker → exit 2 + stderr 中文指引；
#   无 marker / 陈旧（顺手清掉）→ exit 0。
# TTL 分级（BACKLOG #13，对齐老内核 pipeline-gate.sh，勿改回统一值）：
#   - confirm 300s：正常流程同轮 AskUserQuestion 即清（秒级），300s 只是「漏确认」安全网。
#   - review / interaction 1800s：跨整个决策 phase（常 >5min），缩短会中途误清 → 绕过强制复核。
# marker 从 stdin JSON 的 cwd 起上溯至多 5 层查找——marker 写在项目根，
#   而工具 cwd 可能是子目录（老内核同款不对称 bug 的修复，勿删）。
# 纯 bash 热路径（CONTRACT §5.4）：不 spawn 任何解释器/外部 JSON 解析器，
#   stdin JSON 只用 bash 字符串提取所需两键（cwd / tool_name）。
# 例外（Task 9，GOAL 清单 E）：非 default workflow 的 change 调用 Skill 工具时，文件尾段
#   委托 `node .../pipeline.mjs internal-skill-gate` 做 skill DAG 解锁判定——这是本文件
#   唯一会 spawn 解释器的分支，且只在该分支触达；workflow==='default'（最高频路径）/
#   无活跃 change / 非 Skill 调用，三者任一成立就直接跳过，零 spawn，热路径承诺不变。
# fail-open（绝不死锁）：stdin 解析失败 / cwd 不存在 / 任何异常 → 放行 exit 0。
set -uo pipefail

# AFK 逃生门（BACKLOG #7b，对齐老内核沙箱放行语义）：headless 自动化（Docker/CI）里
# 无人应答 AskUserQuestion，三门必死锁——显式 PIPELINE_AFK=1 时整门放行；
# 不清 marker（人回来时门还在）。仅字面 "1" 生效，其它值一律不放行。
[ "${PIPELINE_AFK:-}" = "1" ] && exit 0

INPUT="$(cat 2>/dev/null || printf '{}')"

# 从 $INPUT 提取顶层字符串键（仅支持 "key" : "value" 形态；值含转义引号等奇形 → 返回 1 → fail-open）
json_get() {
  local key="$1" rest
  case "$INPUT" in *"\"$key\""*) ;; *) return 1 ;; esac
  rest="${INPUT#*\"$key\"}"
  while true; do
    case "$rest" in
      [$' \t\r\n']*) rest="${rest#?}" ;;
      ':'*) rest="${rest#:}"; break ;;
      *) return 1 ;;
    esac
  done
  while true; do
    case "$rest" in
      [$' \t\r\n']*) rest="${rest#?}" ;;
      *) break ;;
    esac
  done
  case "$rest" in
    '"'*) rest="${rest#\"}"; printf '%s' "${rest%%\"*}"; return 0 ;;
    *) return 1 ;;
  esac
}

CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] || exit 0
TOOL="$(json_get tool_name || true)"
[ -z "$TOOL" ] && TOOL="?"

# yget：读 .pipeline.yaml 单个顶层 key（grep 首个 '^key: '，剥一层首尾同款引号）——逐字复用
# hooks/router.sh / hooks/skill-tracker.sh 同名函数，本文件之前不需要读 .pipeline.yaml 字段，
# Task 9（非 default workflow 的 skill DAG 判定）新增才要用。
yget() {
  local v
  v="$(grep -m1 "^$2: " "$1" 2>/dev/null || true)"
  v="${v#"$2: "}"
  case "$v" in
    '"'*'"') v="${v#\"}"; v="${v%\"}" ;;
    "'"*"'") v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}

# marker 新鲜？存在且 age ≤ TTL（第 2 参，秒；缺省 1800）→ 0；陈旧（age > TTL）→ 清掉并 1；不存在 → 1。
# 边界与老内核 fresh() 一致：-gt 才陈旧（age == TTL 仍新鲜）。TTL 值同 types.ts GATE_TTL_MS。
fresh() {
  local m="$1" ttl="${2:-1800}" now mt
  [ -f "$m" ] || return 1
  now="$(date +%s)"
  # GNU `stat -f` 是「文件系统状态」模式（%m=挂载点字符串），非文件 mtime——在 Linux 上会
  # "成功"但吐非数字，导致 || 兜底永不触发。先试 GNU 语法（-c，BSD stat 不识别该 flag 会真
  # 报错退出）+ 数字校验兜底，而非只靠退出码判断（真机 Linux CI 抓出，本机 macOS 测不出）。
  mt="$(stat -c %Y "$m" 2>/dev/null)"
  case "$mt" in ''|*[!0-9]*) mt="$(stat -f %m "$m" 2>/dev/null)" ;; esac
  case "$mt" in ''|*[!0-9]*) mt="$now" ;; esac
  if [ $((now - mt)) -gt "$ttl" ]; then
    rm -f "$m" 2>/dev/null
    return 1
  fi
  return 0
}

# 从 CWD 上溯至多 5 层找 marker，返回找到的路径（stdout），找不到返回 1
resolve_marker() {
  local base="$1" d="$CWD" i
  for i in 1 2 3 4 5; do
    if [ -f "$d/$base" ]; then printf '%s' "$d/$base"; return 0; fi
    [ "$d" = "/" ] && break
    d="$(dirname "$d")"
  done
  return 1
}

for kind in confirm review interaction; do
  base=".pipeline-pending-$kind"
  m="$(resolve_marker "$base" || true)"
  [ -n "$m" ] || continue
  case "$kind" in confirm) ttl=300 ;; *) ttl=1800 ;; esac
  if fresh "$m" "$ttl"; then
    printf '【pipeline 门】检测到待处理交互标记 %s（%s 已被拦截）：请先用 AskUserQuestion 把当前决策/产出交用户确认，用户答复后自动解封再重发本次操作；若用户已明示无需确认，删除 %s 即可放行。\n' "$base" "$TOOL" "$m" >&2
    exit 2
  fi
done

# ── 非 default workflow 的 skill DAG 解锁判定（Task 9，GOAL 清单 E）：委托进 CLI 判定 ──
# 只对 Skill 工具调用生效（skill DAG 只约束 skill 调用本身；Bash/Edit/Write/MultiEdit 等其它
# 工具类型即便当前 change 是非 default workflow 也完全不受影响，不会走进本分支半步）。
# default workflow 的 change 在这里零改动：找不到活跃 change / workflow 字段缺失或就是
# "default" → 直接跳过整段，不 spawn 任何进程——本文件"纯 bash 热路径"的承诺只对
# workflow==='default' 这条最高频路径许诺，这条路径完全不变，仍然零 node/解释器 spawn。
if [ "$TOOL" = "Skill" ]; then
  SKILL_ID="$(json_get skill || true)"
  if [ -n "$SKILL_ID" ]; then
    # 定位活跃 change（同 hooks/skill-tracker.sh 一致手法：cwd 上溯至多 5 层找
    # openspec/changes；取 mtime 最新的非归档 change——单一活跃 change 的启发式判定，与本仓
    # 其余 hook（router.sh/skill-tracker.sh）同一口径，非本文件独创，变量名加 SG_ 前缀防与
    # 未来本文件可能新增的其它变量撞名）。
    SG_PROOT="" sg_d="$CWD"
    for _ in 1 2 3 4 5; do
      if [ -d "$sg_d/openspec/changes" ]; then SG_PROOT="$sg_d"; break; fi
      [ "$sg_d" = "/" ] && break
      sg_d="$(dirname "$sg_d")"
    done
    if [ -n "$SG_PROOT" ]; then
      SG_BEST=0 SG_CHANGE_DIR=""
      for sg_f in "$SG_PROOT"/openspec/changes/*/.pipeline.yaml; do
        [ -f "$sg_f" ] || continue
        [ "$(yget "$sg_f" archived)" = "true" ] && continue
        sg_mt="$(stat -c %Y "$sg_f" 2>/dev/null)"
        case "$sg_mt" in ''|*[!0-9]*) sg_mt="$(stat -f %m "$sg_f" 2>/dev/null)" ;; esac
        case "$sg_mt" in ''|*[!0-9]*) sg_mt=0 ;; esac
        [[ "$sg_mt" =~ ^[0-9]+$ ]] || sg_mt=0
        if [ "$sg_mt" -ge "$SG_BEST" ]; then SG_BEST="$sg_mt"; SG_CHANGE_DIR="$(dirname "$sg_f")"; fi
      done
      if [ -n "$SG_CHANGE_DIR" ]; then
        SG_WORKFLOW="$(yget "$SG_CHANGE_DIR/.pipeline.yaml" workflow)"
        if [ -n "$SG_WORKFLOW" ] && [ "$SG_WORKFLOW" != "default" ]; then
          SG_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)}"
          SG_BUNDLE="$SG_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs"
          if [ -f "$SG_BUNDLE" ] && command -v node >/dev/null 2>&1; then
            SG_CHANGE_NAME="$(basename "$SG_CHANGE_DIR")"
            # 子 shell 里先 cd 到项目根（SG_PROOT）再 spawn：CLI 的 deps.cwd = process.cwd()
            # （main.ts），change 定位靠 <cwd>/openspec/changes/<name> 拼出来——不 cd 的话 node
            # 继承的是 gate.sh 自己的 cwd（可能是任意调用方目录，不是项目根），会把 change 定位
            # 到错误路径导致 store.read 抛 ENOENT，被内部 catch 静默 fail-open 成误放行。子 shell
            # 包一层，避免影响本文件后续（虽然此刻后面只剩 exit 0，仍保持这个更安全的写法）。
            ( cd "$SG_PROOT" && node "$SG_BUNDLE" internal-skill-gate "$SG_CHANGE_NAME" "$SKILL_ID" )
            sg_rc=$?
            # fail-open 对齐文件头总纲：只有明确的"拦截"信号（exit 2）才真拦；node/bundle 崩溃
            # 等其它非零 code 一律不当真、继续放行，绝不因本机制自身故障变相锁死用户。
            [ "$sg_rc" -eq 2 ] && exit 2
          fi
        fi
      fi
    fi
  fi
fi

exit 0
