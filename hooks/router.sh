#!/usr/bin/env bash
# router.sh — UserPromptSubmit：项目级动态 Track 路由 + workflow breadcrumb/skill 注入。
#
# 冷路径从 effective Track Registry + manifest profile skills 生成 PIPELINE_ROUTER_V2；默认 cache
# 位于 <canonical-project-root>/.pipeline/cache/router.v2.data。cache 是严格字段化的 hex 数据，
# 本脚本只逐行校验和 builtin 解码，绝不把项目 cache 当 shell 程序执行。
#
# fail-open（对 hook 调用方）/fail-closed（对 stale 数据）：任何定位、解析或生成错误都 exit 0；
# 但 stale 后生成失败的当轮绝不继续消费旧 cache。
set -uo pipefail

INPUT=""
while IFS= read -r _input_line || [ -n "$_input_line" ]; do
  if [ -n "$INPUT" ]; then INPUT="${INPUT}"$'\n'; fi
  INPUT="${INPUT}${_input_line}"
  _input_line=""
done

# 从 $INPUT 提取顶层字符串键（与其它 hook 的窄 JSON 接口一致；不做通用 JSON 解析）。
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

PROMPT="$(json_get prompt || true)"
[ -n "$PROMPT" ] || exit 0
CWD="$(json_get cwd || true)"
[ -n "$CWD" ] || CWD="$PWD"
[ -d "$CWD" ] || exit 0

# 系统通知、自身回显、显式命令、L5 override、纯讨论均不触发路由。
case "$PROMPT" in
  *"<task-notification>"*|*"<task-id>"*|*"<output-file>"*|*"<workflow-state>"*|*"<pipeline-router"*|*"<pipeline-dispatch>"*) exit 0 ;;
esac
case "$PROMPT" in /*) exit 0 ;; esac
case "$PROMPT" in
  *只改*|*快速修复*|*临时修复*|*就这一行*|*就改这个*|*别想太多*|*just\ fix*|*quick\ patch*|*typo*|*hotfix\ only*|*one-liner*) exit 0 ;;
esac
case "$PROMPT" in
  *如何使用*|*怎么用*|*是什么*|*为什么*|*解释*|*文档在哪*|*在哪里*|*意思是*|*我觉得*|*我感觉*|*你觉得*|*是不是*|*怎么样*|*看法*|*聊聊*|*讨论一下*|*有没有更好*) exit 0 ;;
esac
if printf '%s' "$PROMPT" | grep -qiE '^[[:space:]]*(what|why|how|when|where|who|can you (tell|explain|describe))\b'; then
  exit 0
fi

STATE_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/canonical-state.sh"
if [ -r "$STATE_HELPER" ]; then
  . "$STATE_HELPER"
else
  pipeline_state_source() { [ -f "$1/.pipeline.yaml" ] && printf '%s' "$1/.pipeline.yaml"; }
  pipeline_state_get() { local v; v="$(grep -m1 "^$2: " "$1" 2>/dev/null || true)"; v="${v#"$2: "}"; case "$v" in '"'*'"') v="${v#\"}"; v="${v%\"}" ;; "'"*"'") v="${v#\'}"; v="${v%\'}" ;; esac; printf '%s' "$v"; }
fi
yget() { pipeline_state_get "$1" "$2"; }

# 共享根策略：bootstrap 模式让未初始化的 Git 项目也可在正常开发对话中选择 default
# pipeline，同时绝不向任意父目录扫描/借用另一个项目的 OpenSpec 状态。
ROOT_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/project-root.sh"
[ -r "$ROOT_HELPER" ] || exit 0
# shellcheck source=project-root.sh
. "$ROOT_HELPER"
PROOT="$(pipeline_project_root "$CWD" bootstrap changes || true)"
[ -n "$PROOT" ] || exit 0

CHANGE_NAME="" CHANGE_PHASE="" CHANGE_TRACK=""
SOLE_CHANGE_NAME="" SOLE_CHANGE_PHASE="" SOLE_CHANGE_TRACK=""
ACTIVE_CHANGE_COUNT=0
BEST_MTIME=0
for _change_dir in "$PROOT"/openspec/changes/*; do
  [ -d "$_change_dir" ] || continue
  f="$(pipeline_state_source "$_change_dir" || true)"
  [ -n "$f" ] || continue
  [ "$(yget "$f" archived)" = "true" ] && continue
  ACTIVE_CHANGE_COUNT=$((ACTIVE_CHANGE_COUNT + 1))
  SOLE_CHANGE_NAME="${_change_dir##*/}"
  SOLE_CHANGE_PHASE="$(yget "$f" phase)"
  SOLE_CHANGE_TRACK="$(yget "$f" track)"
  mt="$(stat -c %Y "$f" 2>/dev/null)"
  case "$mt" in ''|*[!0-9]*) mt="$(stat -f %m "$f" 2>/dev/null)" ;; esac
  case "$mt" in ''|*[!0-9]*) mt=0 ;; esac
  if [ "$mt" -ge "$BEST_MTIME" ]; then
    BEST_MTIME="$mt"
    CHANGE_NAME="${_change_dir##*/}"
    CHANGE_PHASE="$(yget "$f" phase)"
    CHANGE_TRACK="$(yget "$f" track)"
  fi
done

# mtime 仅可用于展示/诊断，不能在多个活跃 change 中猜测当前会话。没有显式
# `.pipeline-active` 时，只有唯一活跃 change 才是可恢复候选。
if [ "$ACTIVE_CHANGE_COUNT" -eq 1 ]; then
  CHANGE_NAME="$SOLE_CHANGE_NAME"
  CHANGE_PHASE="$SOLE_CHANGE_PHASE"
  CHANGE_TRACK="$SOLE_CHANGE_TRACK"
else
  CHANGE_NAME=""
  CHANGE_PHASE=""
  CHANGE_TRACK=""
fi

# Dashboard/CLI `session activate` writes a repo-level recovery candidate here.
# It may win over mtime discovery, but it is never an implicit binding for an
# unrelated/new conversation; binding is decided below from the user prompt.
ACTIVE_POINTER="$PROOT/.pipeline-active"
if [ -f "$ACTIVE_POINTER" ] && [ ! -L "$ACTIVE_POINTER" ] && [ -r "$ACTIVE_POINTER" ]; then
  IFS= read -r ACTIVE_NAME < "$ACTIVE_POINTER" || ACTIVE_NAME=""
  case "$ACTIVE_NAME" in
    ''|*[!A-Za-z0-9_-]*) ;;
    *)
      ACTIVE_DIR="$PROOT/openspec/changes/$ACTIVE_NAME"
      ACTIVE_STATE="$(pipeline_state_source "$ACTIVE_DIR" || true)"
      if [ -n "$ACTIVE_STATE" ] && [ "$(yget "$ACTIVE_STATE" archived)" != "true" ]; then
        CHANGE_NAME="$ACTIVE_NAME"
        CHANGE_PHASE="$(yget "$ACTIVE_STATE" phase)"
        CHANGE_TRACK="$(yget "$ACTIVE_STATE" track)"
      fi
      ;;
  esac
fi

# A project-level pointer cannot identify a Codex conversation.  Keep the old Change only when
# the user explicitly asks to continue it; a new objective must always start from open so the
# root skill can create an independent Change rather than inheriting stale phase/tasks context.
# With multiple active candidates and no selected pointer, a generic “continue” remains
# ambiguous and is surfaced to the root skill as `select`, never resolved by mtime.
INTENT_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/prompt-intent.sh"
DISPATCH_INTENT="new"
if [ -r "$INTENT_HELPER" ]; then
  # shellcheck source=prompt-intent.sh
  . "$INTENT_HELPER"
  if [ -n "$CHANGE_NAME" ] && pipeline_prompt_requests_resume "$PROMPT" "$CHANGE_NAME"; then
    DISPATCH_INTENT="resume"
  elif [ "$ACTIVE_CHANGE_COUNT" -gt 1 ] && pipeline_prompt_requests_resume "$PROMPT" ""; then
    DISPATCH_INTENT="select"
    CHANGE_NAME=""
    CHANGE_PHASE=""
    CHANGE_TRACK=""
  else
    CHANGE_NAME=""
    CHANGE_PHASE=""
    CHANGE_TRACK=""
  fi
else
  # Missing helper is a safety failure: do not leak a repo-level candidate into a new prompt.
  CHANGE_NAME=""
  CHANGE_PHASE=""
  CHANGE_TRACK=""
fi

hook_disabled() { # $1=root $2=hook $3=phase
  [ -n "$1" ] && [ -n "$3" ] || return 1
  grep -Fq "\"$2.$3\": false" "$1/.pipeline/hooks.json" 2>/dev/null
}
# 禁用判定必须早于任何冷生成解释器。
ROUTER_PHASE="${CHANGE_PHASE:-open}"
if hook_disabled "$PROOT" router "$ROUTER_PHASE"; then exit 0; fi

PLUGIN_ROOT="${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)}}"
MANIFEST="$PLUGIN_ROOT/templates/manifest.yaml"
TRACKS_FILE="$PROOT/.pipeline/tracks.yaml"
if [ -f "$TRACKS_FILE" ]; then TRACKS_PRESENT=1; else TRACKS_PRESENT=0; fi
CACHE="${PIPELINE_ROUTER_CACHE:-$PROOT/.pipeline/cache/router.v2.data}"
_CLI_BUNDLE="$PLUGIN_ROOT/packages/cli/dist/pipeline.mjs"
_GEN_MJS="$PLUGIN_ROOT/hooks/router-gen.mjs"

# Bash 3.2-compatible parallel arrays（不使用 associative array 或动态变量名）。
_router_clear_cache() {
  CACHE_ROOT="" CACHE_MANIFEST_SHA="" CACHE_REGISTRY_REV="" CACHE_TRACKS_PRESENT=""
  ROUTER_ORDERS=() ROUTER_PRIORITIES=() ROUTER_IDS=() ROUTER_PATTERNS=() ROUTER_PROFILES=()
  ROUTER_MATRICES=() ROUTER_BUILTINS=() ROUTER_LABELS=()
  CACHE_BC_PHASES=() CACHE_BC_TEXTS=()
  CACHE_CELL_PHASES=() CACHE_CELL_PROFILES=() CACHE_CELL_KINDS=() CACHE_CELL_SOURCES=()
  CACHE_SKILL_PHASES=() CACHE_SKILL_PROFILES=() CACHE_SKILL_KINDS=() CACHE_SKILL_INDEXES=() CACHE_SKILL_TOKENS=()
}

_uint_ok() { # unsigned JS-safe integer, canonical decimal spelling
  local value="$1" length
  case "$value" in
    0) return 0 ;;
    [1-9]) return 0 ;;
    [1-9][0-9]*) ;;
    *) return 1 ;;
  esac
  length="${#value}"
  [ "$length" -lt 16 ] && return 0
  [ "$length" -gt 16 ] && return 1
  [[ "$value" > "9007199254740991" ]] && return 1
  return 0
}

_hex_ok() {
  local value="$1"
  case "$value" in *[!0-9a-f]*) return 1 ;; esac
  [ $(( ${#value} % 2 )) -eq 0 ]
}

# 输出写入固定全局 HEX_VALUE；每个 byte 的 \xHH 只在 HH 已过 hex 白名单后交给 builtin printf。
_hex_decode() {
  local rest="$1" pair byte
  _hex_ok "$rest" || return 1
  HEX_VALUE=""
  while [ -n "$rest" ]; do
    pair="${rest:0:2}"
    rest="${rest:2}"
    [ "$pair" != "00" ] || return 1 # bash 字符串不能无损承载 NUL
    printf -v byte '%b' "\\x$pair" || return 1
    HEX_VALUE="${HEX_VALUE}${byte}"
  done
  return 0
}

_track_id_ok() {
  local value="$1"
  [ "${#value}" -le 32 ] || return 1
  case "$value" in
    ''|_all|[!a-z]*|*[!a-z0-9_-]*) return 1 ;;
    *) return 0 ;;
  esac
}

# PARTS 最后一格永远是 sentinel，因此尾部空字段也不会被 read 吞掉。
_split_cache_line() {
  PARTS=()
  IFS='|' read -r -a PARTS <<< "${1}|__PIPELINE_END__"
  local last=$(( ${#PARTS[@]} - 1 ))
  [ "$last" -ge 0 ] && [ "${PARTS[$last]}" = "__PIPELINE_END__" ]
}

_router_load_cache() { # file expected-root expected-tracks-present
  local file="$1" expected_root="$2" expected_tracks="$3"
  local line line_no=0 metadata_seen=0 previous_order=-1 stage=0 i found count
  local order priority id pattern profile matrix builtin label phase prose kind cell_source index token
  _router_clear_cache
  [ -f "$file" ] || return 1

  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))
    if [ "$line_no" -eq 1 ]; then
      [ "$line" = "PIPELINE_ROUTER_V2" ] || { _router_clear_cache; return 1; }
      continue
    fi
    [ -n "$line" ] || { _router_clear_cache; return 1; }
    _split_cache_line "$line" || { _router_clear_cache; return 1; }

    case "${PARTS[0]}" in
      M)
        [ "$line_no" -eq 2 ] && [ "$metadata_seen" -eq 0 ] && [ "${#PARTS[@]}" -eq 6 ] \
          || { _router_clear_cache; return 1; }
        _hex_decode "${PARTS[1]}" || { _router_clear_cache; return 1; }
        CACHE_ROOT="$HEX_VALUE"
        _hex_ok "${PARTS[2]}" && [ "${#PARTS[2]}" -eq 64 ] \
          || { _router_clear_cache; return 1; }
        _hex_ok "${PARTS[3]}" && [ "${#PARTS[3]}" -ge 16 ] && [ "${#PARTS[3]}" -le 64 ] \
          || { _router_clear_cache; return 1; }
        case "${PARTS[4]}" in 0|1) ;; *) _router_clear_cache; return 1 ;; esac
        CACHE_MANIFEST_SHA="${PARTS[2]}"
        CACHE_REGISTRY_REV="${PARTS[3]}"
        CACHE_TRACKS_PRESENT="${PARTS[4]}"
        [ "$CACHE_ROOT" = "$expected_root" ] && [ "$CACHE_TRACKS_PRESENT" = "$expected_tracks" ] \
          || { _router_clear_cache; return 1; }
        metadata_seen=1
        ;;
      R)
        [ "$metadata_seen" -eq 1 ] && [ "$stage" -eq 0 ] && [ "${#PARTS[@]}" -eq 10 ] \
          || { _router_clear_cache; return 1; }
        order="${PARTS[1]}"; priority="${PARTS[2]}"
        _uint_ok "$order" && _uint_ok "$priority" || { _router_clear_cache; return 1; }
        [ "$order" -le 31 ] && [ "${#ROUTER_IDS[@]}" -lt 32 ] || { _router_clear_cache; return 1; }
        [ "$order" -gt "$previous_order" ] || { _router_clear_cache; return 1; }
        previous_order="$order"
        _hex_decode "${PARTS[3]}" || { _router_clear_cache; return 1; }; id="$HEX_VALUE"
        _track_id_ok "$id" || { _router_clear_cache; return 1; }
        _hex_decode "${PARTS[4]}" || { _router_clear_cache; return 1; }; pattern="$HEX_VALUE"
        [ -n "$pattern" ] || { _router_clear_cache; return 1; }
        _hex_decode "${PARTS[5]}" || { _router_clear_cache; return 1; }; profile="$HEX_VALUE"
        [ -n "$profile" ] || { _router_clear_cache; return 1; }
        matrix="${PARTS[6]}"; builtin="${PARTS[7]}"
        case "$matrix" in 0|1) ;; *) _router_clear_cache; return 1 ;; esac
        case "$builtin" in 0|1) ;; *) _router_clear_cache; return 1 ;; esac
        _hex_decode "${PARTS[8]}" || { _router_clear_cache; return 1; }; label="$HEX_VALUE"
        [ -n "$label" ] || { _router_clear_cache; return 1; }
        i=0
        while [ "$i" -lt "${#ROUTER_IDS[@]}" ]; do
          [ "${ROUTER_IDS[$i]}" != "$id" ] || { _router_clear_cache; return 1; }
          i=$((i + 1))
        done
        i="${#ROUTER_IDS[@]}"
        ROUTER_ORDERS[$i]="$order"; ROUTER_PRIORITIES[$i]="$priority"; ROUTER_IDS[$i]="$id"
        ROUTER_PATTERNS[$i]="$pattern"; ROUTER_PROFILES[$i]="$profile"; ROUTER_MATRICES[$i]="$matrix"
        ROUTER_BUILTINS[$i]="$builtin"; ROUTER_LABELS[$i]="$label"
        ;;
      B)
        [ "$metadata_seen" -eq 1 ] && [ "$stage" -le 1 ] && [ "${#PARTS[@]}" -eq 4 ] \
          || { _router_clear_cache; return 1; }
        stage=1
        _hex_decode "${PARTS[1]}" || { _router_clear_cache; return 1; }; phase="$HEX_VALUE"
        [ -n "$phase" ] || { _router_clear_cache; return 1; }
        _hex_decode "${PARTS[2]}" || { _router_clear_cache; return 1; }; prose="$HEX_VALUE"
        i=0
        while [ "$i" -lt "${#CACHE_BC_PHASES[@]}" ]; do
          [ "${CACHE_BC_PHASES[$i]}" != "$phase" ] || { _router_clear_cache; return 1; }
          i=$((i + 1))
        done
        i="${#CACHE_BC_PHASES[@]}"; CACHE_BC_PHASES[$i]="$phase"; CACHE_BC_TEXTS[$i]="$prose"
        ;;
      C)
        [ "$metadata_seen" -eq 1 ] && [ "$stage" -le 2 ] && [ "${#PARTS[@]}" -eq 6 ] \
          || { _router_clear_cache; return 1; }
        stage=2
        _hex_decode "${PARTS[1]}" || { _router_clear_cache; return 1; }; phase="$HEX_VALUE"
        _hex_decode "${PARTS[2]}" || { _router_clear_cache; return 1; }; profile="$HEX_VALUE"
        [ -n "$phase" ] && [ -n "$profile" ] || { _router_clear_cache; return 1; }
        kind="${PARTS[3]}"; cell_source="${PARTS[4]}"
        case "$kind" in M|R) ;; *) _router_clear_cache; return 1 ;; esac
        case "$cell_source" in P|A|E) ;; *) _router_clear_cache; return 1 ;; esac
        i=0
        while [ "$i" -lt "${#CACHE_CELL_PHASES[@]}" ]; do
          if [ "${CACHE_CELL_PHASES[$i]}" = "$phase" ] && [ "${CACHE_CELL_PROFILES[$i]}" = "$profile" ] \
            && [ "${CACHE_CELL_KINDS[$i]}" = "$kind" ]; then
            _router_clear_cache; return 1
          fi
          i=$((i + 1))
        done
        i="${#CACHE_CELL_PHASES[@]}"; CACHE_CELL_PHASES[$i]="$phase"; CACHE_CELL_PROFILES[$i]="$profile"
        CACHE_CELL_KINDS[$i]="$kind"; CACHE_CELL_SOURCES[$i]="$cell_source"
        ;;
      S)
        [ "$metadata_seen" -eq 1 ] && [ "$stage" -eq 2 ] && [ "${#PARTS[@]}" -eq 7 ] \
          || { _router_clear_cache; return 1; }
        _hex_decode "${PARTS[1]}" || { _router_clear_cache; return 1; }; phase="$HEX_VALUE"
        _hex_decode "${PARTS[2]}" || { _router_clear_cache; return 1; }; profile="$HEX_VALUE"
        kind="${PARTS[3]}"; index="${PARTS[4]}"
        [ -n "$phase" ] && [ -n "$profile" ] && _uint_ok "$index" || { _router_clear_cache; return 1; }
        case "$kind" in M|R) ;; *) _router_clear_cache; return 1 ;; esac
        _hex_decode "${PARTS[5]}" || { _router_clear_cache; return 1; }; token="$HEX_VALUE"
        [ -n "$token" ] || { _router_clear_cache; return 1; }
        found=0; i=0
        while [ "$i" -lt "${#CACHE_CELL_PHASES[@]}" ]; do
          if [ "${CACHE_CELL_PHASES[$i]}" = "$phase" ] && [ "${CACHE_CELL_PROFILES[$i]}" = "$profile" ] \
            && [ "${CACHE_CELL_KINDS[$i]}" = "$kind" ]; then
            [ "${CACHE_CELL_SOURCES[$i]}" != "E" ] || { _router_clear_cache; return 1; }
            found=1; break
          fi
          i=$((i + 1))
        done
        [ "$found" -eq 1 ] || { _router_clear_cache; return 1; }
        count=0; i=0
        while [ "$i" -lt "${#CACHE_SKILL_PHASES[@]}" ]; do
          if [ "${CACHE_SKILL_PHASES[$i]}" = "$phase" ] && [ "${CACHE_SKILL_PROFILES[$i]}" = "$profile" ] \
            && [ "${CACHE_SKILL_KINDS[$i]}" = "$kind" ]; then count=$((count + 1)); fi
          i=$((i + 1))
        done
        [ "$index" -eq "$count" ] || { _router_clear_cache; return 1; }
        i="${#CACHE_SKILL_PHASES[@]}"; CACHE_SKILL_PHASES[$i]="$phase"; CACHE_SKILL_PROFILES[$i]="$profile"
        CACHE_SKILL_KINDS[$i]="$kind"; CACHE_SKILL_INDEXES[$i]="$index"; CACHE_SKILL_TOKENS[$i]="$token"
        ;;
      *) _router_clear_cache; return 1 ;;
    esac
    line=""
  done < "$file"

  [ "$line_no" -ge 2 ] && [ "$metadata_seen" -eq 1 ] || { _router_clear_cache; return 1; }
  return 0
}

_router_regen() { # manifest root output
  local manifest="$1" root="$2" output="$3" cache_dir tmp
  command -v node >/dev/null 2>&1 || return 1
  [ -f "$manifest" ] && [ -d "$root" ] || return 1
  cache_dir="${output%/*}"
  [ "$cache_dir" != "$output" ] || cache_dir="."
  mkdir -p -- "$cache_dir" 2>/dev/null || return 1
  tmp="$(mktemp "$cache_dir/.router.v2.tmp.XXXXXX" 2>/dev/null)" || return 1

  if [ -f "$_CLI_BUNDLE" ] \
    && (cd "$root" && node "$_CLI_BUNDLE" _gen-router-sh "$manifest" "$root") > "$tmp" 2>/dev/null \
    && _router_load_cache "$tmp" "$root" "$TRACKS_PRESENT"; then
    if mv "$tmp" "$output" 2>/dev/null; then return 0; fi
    _router_clear_cache
  fi

  : > "$tmp" 2>/dev/null || { rm -f "$tmp" 2>/dev/null; _router_clear_cache; return 1; }
  if [ -f "$_GEN_MJS" ] \
    && (cd "$root" && node "$_GEN_MJS" "$manifest" "$root") > "$tmp" 2>/dev/null \
    && _router_load_cache "$tmp" "$root" "$TRACKS_PRESENT"; then
    if mv "$tmp" "$output" 2>/dev/null; then return 0; fi
    _router_clear_cache
  fi

  rm -f "$tmp" 2>/dev/null
  _router_clear_cache
  return 1
}

LC_ALL=C
_router_clear_cache
CACHE_STALE=0
if [ ! -f "$CACHE" ] || [ ! -f "$MANIFEST" ]; then
  CACHE_STALE=1
elif [ "$MANIFEST" -nt "$CACHE" ]; then
  CACHE_STALE=1
elif [ "$TRACKS_PRESENT" -eq 1 ] && [ "$TRACKS_FILE" -nt "$CACHE" ]; then
  CACHE_STALE=1
elif ! _router_load_cache "$CACHE" "$PROOT" "$TRACKS_PRESENT"; then
  # schema/root/tracks-presence mismatch 或逐行结构损坏。
  CACHE_STALE=1
fi

if [ "$CACHE_STALE" -eq 1 ]; then
  _router_clear_cache
  if ! _router_regen "$MANIFEST" "$PROOT" "$CACHE"; then
    # 旧文件可留作诊断，但本轮内存态为空，立即结束。
    _router_clear_cache
    exit 0
  fi
fi

# ═══ HOT PATH（每轮命中缓存：严格 data parser + 动态打分；零 node/python/python3/jq）═══
[ "${#ROUTER_IDS[@]}" -gt 0 ] || exit 0

score_track() {
  local count
  count="$(printf '%s' "$PROMPT" | grep -ciE -- "$1" 2>/dev/null)" || count=0
  case "$count" in ''|*[!0-9]*) count=0 ;; esac
  printf '%s' "$count"
}

BEST_SCORE=0 BEST_PRIORITY=0 TRACK="" PROFILE=""
i=0
while [ "$i" -lt "${#ROUTER_IDS[@]}" ]; do
  SCORE="$(score_track "${ROUTER_PATTERNS[$i]}")"
  if [ "$SCORE" -gt 0 ] && {
    [ "$SCORE" -gt "$BEST_SCORE" ] \
      || { [ "$SCORE" -eq "$BEST_SCORE" ] && [ "${ROUTER_PRIORITIES[$i]}" -gt "$BEST_PRIORITY" ]; }
  }; then
    BEST_SCORE="$SCORE"
    BEST_PRIORITY="${ROUTER_PRIORITIES[$i]}"
    TRACK="${ROUTER_IDS[$i]}"
    PROFILE="${ROUTER_PROFILES[$i]}"
  fi
  i=$((i + 1))
done
[ "$BEST_SCORE" -gt 0 ] && [ -n "$TRACK" ] || exit 0

EFF_PHASE="${CHANGE_PHASE:-open}"
case "$EFF_PHASE" in
  ''|*[!a-zA-Z0-9_-]*) EFF_PHASE=open ;;
esac

BC="" REC="" MAND=""
i=0
while [ "$i" -lt "${#CACHE_BC_PHASES[@]}" ]; do
  if [ "${CACHE_BC_PHASES[$i]}" = "$EFF_PHASE" ]; then BC="${CACHE_BC_TEXTS[$i]}"; break; fi
  i=$((i + 1))
done
i=0
while [ "$i" -lt "${#CACHE_SKILL_PHASES[@]}" ]; do
  if [ "${CACHE_SKILL_PHASES[$i]}" = "$EFF_PHASE" ] && [ "${CACHE_SKILL_PROFILES[$i]}" = "$PROFILE" ]; then
    if [ "${CACHE_SKILL_KINDS[$i]}" = "R" ]; then
      if [ -n "$REC" ]; then REC="$REC, ${CACHE_SKILL_TOKENS[$i]}"; else REC="${CACHE_SKILL_TOKENS[$i]}"; fi
    else
      if [ -n "$MAND" ]; then MAND="$MAND, ${CACHE_SKILL_TOKENS[$i]}"; else MAND="${CACHE_SKILL_TOKENS[$i]}"; fi
    fi
  fi
  i=$((i + 1))
done

if [ "$DISPATCH_INTENT" = "resume" ] && [ -n "$CHANGE_NAME" ]; then
  HDR="change=${CHANGE_NAME} · phase=${EFF_PHASE} · 疑似 track=${TRACK}（评分 ${BEST_SCORE}）"
  TAIL="本轮疑似 ${TRACK} 相关操作；已在 pipeline 中。必须立即调用 Skill 工具的 pipeline，由它分派当前相位的 OpenSpec 与阶段 skill；先按 tasks.md 的阶段任务建立/更新 Todo，勿先生成通用 Todo、勿绕过 pipeline 直接实现。按 ${EFF_PHASE} 相位纪律推进，勿自动 transition，产出交用户确认后再推进。"
elif [ "$DISPATCH_INTENT" = "select" ]; then
  HDR="疑似 track=${TRACK}（评分 ${BEST_SCORE}）· 恢复目标未选择"
  TAIL="用户明确要继续，但项目中有多个未选择的活跃 change。必须立即调用 Skill 工具的 pipeline，让入口 skill 用 pipeline list/status 列出候选并要求用户点名；严禁按 mtime 猜测，也严禁把它当作新任务创建。"
else
  HDR="疑似 track=${TRACK}（评分 ${BEST_SCORE}）· 独立新任务"
  TAIL="疑似 ${TRACK} Track 新任务。项目内已有 change 仅是显式恢复时的候选，严禁把它们绑定到本轮或复用其 phase/tasks。默认选择 default workflow：必须立即调用 Skill 工具的 pipeline，让入口 skill 创建并激活独立 Change、初始化 OpenSpec，并按 open 相位开始；不要先询问是否走工作流，也不要直接执行某个阶段 skill。仅当用户明确指定自定义 workflow 时才改用该 workflow；L5 override（快速修复等）仍可直接跳过。"
fi

printf '\n<workflow-state>\nrouter: %s\n' "$HDR"
[ -n "$BC" ] && printf '%s\n' "$BC"
[ -n "$REC" ] && printf '推荐 skill：%s\n' "$REC"
[ -n "$MAND" ] && printf '本相位强制 skill：%s\n' "$MAND"
printf '%s\n</workflow-state>\n' "$TAIL"
printf '<pipeline-dispatch>\naction: invoke-skill\nskill: pipeline\nworkflow: default\ntrack: %s\nintent: %s\n' "$TRACK" "$DISPATCH_INTENT"
if [ "$DISPATCH_INTENT" = "resume" ] && [ -n "$CHANGE_NAME" ]; then
  printf 'change: %s\nphase: %s\ntodo_source: openspec/changes/%s/tasks.md\n' "$CHANGE_NAME" "$EFF_PHASE" "$CHANGE_NAME"
elif [ "$DISPATCH_INTENT" = "select" ]; then
  printf 'phase: select\ntodo_source: pipeline-active-change-selection\n'
else
  printf 'phase: open\ntodo_source: pipeline-phase-template\n'
fi
printf 'required: true\n</pipeline-dispatch>\n'
exit 0
