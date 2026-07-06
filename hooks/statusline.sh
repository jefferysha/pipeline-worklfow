#!/usr/bin/env bash
# statusline.sh — Claude Code statusLine 命令（BACKLOG #10）。
# 一行输出：<change> · <phase> [· 等:<门>…]，无 pipeline 项目/无活跃 change → 输出空。
#
# 接入（用户 settings.json）：
#   "statusLine": { "type": "command", "command": "bash <本仓路径>/hooks/statusline.sh" }
#
# 热路径红线（CONTRACT §5.4）：statusline 每次渲染都执行——纯 bash，绝不 spawn
# 任何解释器；.pipeline.yaml 只用 grep 提取顶层键；fail-open：任何异常输出空 exit 0。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

# 与 gate.sh 同款极简 JSON 顶层字符串键提取（cwd / current_dir 两个键名都试）
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

CWD="$(json_get cwd || json_get current_dir || true)"
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] || exit 0

# 上溯至多 5 层找项目根（有 openspec/changes 的目录）
ROOT="" d="$CWD"
for _ in 1 2 3 4 5; do
  if [ -d "$d/openspec/changes" ]; then ROOT="$d"; break; fi
  [ "$d" = "/" ] && break
  d="$(dirname "$d")"
done
[ -n "$ROOT" ] || exit 0

# 顶层键提取：grep 首个 '^key: '，剥一层首尾同款引号（单层去引号契约的 bash 镜像）
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

# 最新活跃 change：按 .pipeline.yaml mtime 取最大且 archived != true
NAME="" PHASE="" BEST=0
for f in "$ROOT"/openspec/changes/*/.pipeline.yaml; do
  [ -f "$f" ] || continue
  [ "$(yget "$f" archived)" = "true" ] && continue
  mt="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
  if [ "$mt" -ge "$BEST" ]; then
    BEST="$mt"
    NAME="$(basename "$(dirname "$f")")"
    PHASE="$(yget "$f" phase)"
  fi
done
[ -n "$NAME" ] || exit 0

# 新鲜（< 15min，同 gate.sh TTL）门 marker → 等:<kind>
TTL=900
GATES=""
now="$(date +%s)"
for kind in confirm review interaction; do
  m="$ROOT/.pipeline-pending-$kind"
  [ -f "$m" ] || continue
  mt="$(stat -f %m "$m" 2>/dev/null || stat -c %Y "$m" 2>/dev/null || echo "$now")"
  [ $((now - mt)) -lt "$TTL" ] && GATES="$GATES · 等:$kind"
done

printf '%s · %s%s\n' "$NAME" "${PHASE:-?}" "$GATES"
exit 0
