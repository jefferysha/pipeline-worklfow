#!/usr/bin/env bash
# skill-tracker.sh — PostToolUse hook（matcher: Skill）。
#
# Skill 工具被调用且项目内有活跃 change 时，把该次调用 append 进
#   openspec/changes/<name>/.pipeline-history.jsonl（一行一个 JSON，CONTRACT §1）——
# kind=tool、raw="Skill: <skill 名>"，逐字对齐 pipeline import 老仓 tools_history 的 tool kind
# 形态（kernel legacy.ts：raw="<tool>: <detail>"），live 与 import 同构，供审计 / 触发率分析。
# 兼容旁挂：若日后 matcher 扩到 Agent/Task，按 subagent_type 记 raw="<Tool>: <name>"（防御性，不改行为）。
#
# 纯 bash 热路径（CONTRACT §5.4：PostToolUse 每次工具后触发）：零解释器 / 外部 JSON 解析器 spawn，
# stdin JSON 只用 bash 字符串提取所需键。fire & forget：非目标工具 / 无活跃 change / 异常 → exit 0。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

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

# JSON 字符串体转义（单行合法 JSON）——skill 名一般无特殊字符，仍防御性转义防写坏 JSONL
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

yget() { # $1=file $2=key
  local v
  v="$(grep -m1 "^$2: " "$1" 2>/dev/null || true)"
  v="${v#"$2: "}"
  case "$v" in
    '"'*'"') v="${v#\"}"; v="${v%\"}" ;;
    "'"*"'") v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}

# 阶段×hook 开关（v5 T5 / 决议#2）：读 <项目根>/.pipeline/hooks.json（server 写端点落盘，
# canonical 一键一行 `"<hook>.<阶段>": false`，只存禁用项，见 packages/server/src/hooksConfig.ts）。
# 纯 bash 热路径（CONTRACT §5.4：零解释器/外部 JSON 解析器 spawn）：grep -F 定长匹配即可判定；缺文件/缺键/
# 手改格式漂移/损坏 JSON → 一律 fail-open 到启用（行为与本配置诞生之前完全一致）。
# gate.sh 交互门与 interactive-skill-gate.sh 安全门强制常开：不读本配置（server 写端点也拒绝这两个 id）。
hook_disabled() { # $1=项目根 $2=hook id $3=阶段 → 0=该阶段已禁用
  [ -n "$1" ] && [ -n "$3" ] || return 1
  grep -Fq "\"$2.$3\": false" "$1/.pipeline/hooks.json" 2>/dev/null
}

CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] || exit 0

TOOL="$(json_get tool_name || true)"
case "$TOOL" in
  Skill)       NAME="$(json_get skill || true)" ;;
  Agent|Task)  NAME="$(json_get subagent_type || true)" ;;
  *) exit 0 ;;
esac
[ -z "$NAME" ] && exit 0

# ── 定位活跃 change（cwd 上溯至多 5 层找 openspec/changes；取 mtime 最新的非归档）──
PROOT="" d="$CWD"
for _ in 1 2 3 4 5; do
  if [ -d "$d/openspec/changes" ]; then PROOT="$d"; break; fi
  [ "$d" = "/" ] && break
  d="$(dirname "$d")"
done
[ -n "$PROOT" ] || exit 0

BEST=0 CHANGE_DIR=""
for f in "$PROOT"/openspec/changes/*/.pipeline.yaml; do
  [ -f "$f" ] || continue
  [ "$(yget "$f" archived)" = "true" ] && continue
  # GNU `stat -f` 是文件系统状态模式（非 mtime），在 Linux 上会"成功"吐非数字，兜底永不触发
  # ——先试 GNU 语法（-c）+ 数字校验，而非只靠退出码判断。
  mt="$(stat -c %Y "$f" 2>/dev/null)"
  case "$mt" in ''|*[!0-9]*) mt="$(stat -f %m "$f" 2>/dev/null)" ;; esac
  case "$mt" in ''|*[!0-9]*) mt=0 ;; esac
  [[ "$mt" =~ ^[0-9]+$ ]] || mt=0
  if [ "$mt" -ge "$BEST" ]; then BEST="$mt"; CHANGE_DIR="$(dirname "$f")"; fi
done
[ -n "$CHANGE_DIR" ] || exit 0

# ── 阶段×hook 开关（v5 T5 / 决议#2）：当前 change 阶段被配置禁用 → 零副作用退出 ──
hook_disabled "$PROOT" skill-tracker "$(yget "$CHANGE_DIR/.pipeline.yaml" phase)" && exit 0

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"
RAW="$(json_escape "$TOOL: $NAME")"
printf '{"ts":"%s","kind":"tool","raw":"%s"}\n' "$TS" "$RAW" >> "$CHANGE_DIR/.pipeline-history.jsonl" 2>/dev/null || true

exit 0
