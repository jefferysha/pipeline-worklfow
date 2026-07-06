#!/usr/bin/env bash
# breadcrumb.sh — UserPromptSubmit 薄 shim：每轮重提当前 phase 面包屑，对抗长会话漂移。
#
# 缓存由 CLI 在 transition 时写 openspec/changes/<name>/.breadcrumb（CONTRACT §5.4）；
# 本 shim 只做文件存在性检查 + cat mtime 最新的一个，无缓存则静默 exit 0。
# 纯 bash 热路径：不 spawn 任何解释器/外部 JSON 解析器。
# fail-open：stdin 解析失败 → 回退 $PWD；任何异常 → 静默 exit 0。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

# 从 $INPUT 提取顶层字符串键（同 gate.sh，保持各 shim 自包含、免 source）
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

# 上溯至多 5 层找 openspec/changes（与 gate.sh 的 marker 上溯对称）
CHANGES=""
d="$CWD"
for i in 1 2 3 4 5; do
  if [ -d "$d/openspec/changes" ]; then CHANGES="$d/openspec/changes"; break; fi
  [ "$d" = "/" ] && break
  d="$(dirname "$d")"
done
[ -n "$CHANGES" ] || exit 0

# 多 change 并存时取 mtime 最新的 .breadcrumb（治「取 glob 第一个」的字母序错绑）
newest=""
newest_mt=-1
for f in "$CHANGES"/*/.breadcrumb; do
  [ -f "$f" ] || continue
  mt="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
  if [ "$mt" -gt "$newest_mt" ]; then
    newest_mt="$mt"
    newest="$f"
  fi
done

[ -n "$newest" ] && cat "$newest" 2>/dev/null
exit 0
