#!/usr/bin/env bash
# decision-recorder.sh — PostToolUse hook（matcher: AskUserQuestion）。
#
# 捕获每次 AskUserQuestion 的「问 + 答」，append 进当前活跃 change 的
#   openspec/changes/<name>/.pipeline-history.jsonl（一行一个 JSON，CONTRACT §1）。
# lite 用 JSONL 侧文件（非老仓 base64 塞 YAML），kind=prompt、raw="Q: <q> | A: <a>"——
# 逐字对齐 pipeline import 老仓历史迁移的 prompt kind 形态（kernel legacy.ts），live 与 import 同构。
# 修复断档：自由文本 prompt 有 recorder，但用户对 AskUserQuestion 的硬取舍决策以前不入库，这里补齐。
#
# 纯 bash 热路径（CONTRACT §5.4：PostToolUse 每次工具后触发）：零解释器 / 外部 JSON 解析器 spawn，
# stdin JSON 全用 bash 字符串扫描提取。JSON 构造严格转义（\ " \t \r \n）——绝不写坏 JSONL。
# Fire & forget：无活跃 change / 解析空 / 任何异常一律静默 exit 0，绝不阻塞主流程。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

# ── 顶层字符串键（cwd）：逐字复用 gate.sh json_get ──
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

# ── 某键的所有字符串值（多问一答场景全保留），以 " | " 连接 ──
# 朴素捕获到下一个 '"'（不处理值内转义引号）→ 遇转义引号即截断，仍是合法（虽截断）审计串；fail-safe。
json_values_of_key() { # $1=key
  local key="$1" rest="$INPUT" out="" v
  while true; do
    case "$rest" in *"\"$key\""*) rest="${rest#*\"$key\"}" ;; *) break ;; esac
    while true; do case "$rest" in [$' \t\r\n']*) rest="${rest#?}" ;; *) break ;; esac; done
    case "$rest" in ':'*) rest="${rest#:}" ;; *) continue ;; esac
    while true; do case "$rest" in [$' \t\r\n']*) rest="${rest#?}" ;; *) break ;; esac; done
    case "$rest" in
      '"'*) rest="${rest#\"}"; v="${rest%%\"*}"; rest="${rest#*\"}"
            out="${out:+$out | }$v" ;;
      *) : ;;
    esac
  done
  printf '%s' "$out"
}

# ── 某子串内「冒号后的字符串值」（= JSON 对象的叶子字符串值；键在冒号前不被捕获）──
# 用于 answers 对象/数组抽取：老仓 .tool_response.answers|to_entries|map(.value) 口径的纯 bash 等价。
json_colon_values() { # $1=haystack
  local rest="$1" out="" v
  while true; do
    case "$rest" in *':'*) rest="${rest#*:}" ;; *) break ;; esac
    while true; do case "$rest" in [$' \t\r\n']*) rest="${rest#?}" ;; *) break ;; esac; done
    case "$rest" in
      '"'*) rest="${rest#\"}"; v="${rest%%\"*}"; rest="${rest#*\"}"
            out="${out:+$out | }$v" ;;
      *) : ;;
    esac
  done
  printf '%s' "$out"
}

# ── JSON 字符串体转义（单物理行、合法 JSON）：反斜杠→\\、引号→\"、Tab/CR/LF→\t\r\n ──
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# ── yaml 顶层键读取（archived 判活跃）：grep 首个 '^key: '，剥一层同款引号（同 router.sh yget）──
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

CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] || exit 0

# 问题：.tool_input.questions[].question 全部拼接；答案：.tool_response.answers 叶子值拼接
Q="$(json_values_of_key question)"
case "$INPUT" in
  *'"answers"'*) A="$(json_colon_values "${INPUT#*\"answers\"}")" ;;
  *'"tool_response"'*) A="$(json_colon_values "${INPUT#*\"tool_response\"}")" ;;
  *) A="" ;;
esac
[ -z "$Q" ] && [ -z "$A" ] && exit 0

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
  mt="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
  [[ "$mt" =~ ^[0-9]+$ ]] || mt=0
  if [ "$mt" -ge "$BEST" ]; then BEST="$mt"; CHANGE_DIR="$(dirname "$f")"; fi
done
[ -n "$CHANGE_DIR" ] || exit 0

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"
RAW="$(json_escape "Q: $Q | A: $A")"
printf '{"ts":"%s","kind":"prompt","raw":"%s"}\n' "$TS" "$RAW" >> "$CHANGE_DIR/.pipeline-history.jsonl" 2>/dev/null || true

exit 0
