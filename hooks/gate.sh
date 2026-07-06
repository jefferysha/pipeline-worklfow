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

# marker 新鲜？存在且 age ≤ TTL（第 2 参，秒；缺省 1800）→ 0；陈旧（age > TTL）→ 清掉并 1；不存在 → 1。
# 边界与老内核 fresh() 一致：-gt 才陈旧（age == TTL 仍新鲜）。TTL 值同 types.ts GATE_TTL_MS。
fresh() {
  local m="$1" ttl="${2:-1800}" now mt
  [ -f "$m" ] || return 1
  now="$(date +%s)"
  mt="$(stat -f %m "$m" 2>/dev/null || stat -c %Y "$m" 2>/dev/null || echo "$now")"
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

exit 0
