#!/usr/bin/env bash
# router.sh — UserPromptSubmit hook：每轮 Track 识别评分 + <workflow-state> breadcrumb 注入
#             （GOAL A2/D1；移植老仓 scripts/hooks/pipeline-router.sh 的评分 + 注入语义）。
#
# 机制：
#   ① 纯 bash 提取 stdin JSON 的 prompt/cwd（同 gate.sh json_get，零外部 JSON 解析器）。
#   ② 上溯定位项目根 + 最新活跃 change 的 相位/track（同 session-start.sh/statusline.sh yget）。
#   ③ 用 manifest 派生的 FE/BE/PM 评分正则给 prompt 打分，选最高分 Track（老 score_track 语义）。
#   ④ 命中 Track → 注入 <workflow-state>：相位 + 检测 Track + 该 phase×track 推荐/强制 skill +
#      breadcrumb 行动提示（有活跃 change=纪律提示；无 change=先 AskUserQuestion 路由建议）。
#
# 派生缓存（消费 #18 kernel genRouterSh/breadcrumbs/skillsFor，单一真相源）：
#   评分正则/breadcrumb/skill 全由 hooks/router-gen.mjs 从 templates/manifest.yaml 派生到缓存 .sh。
#   **mtime 缓存**：仅当 manifest.yaml 比缓存新时 spawn 一次 node 重生成（老仓同款可接受模式）；
#   否则纯 `source` 缓存——命中缓存 = 零 node/解释器 spawn（CONTRACT §5.4 热路径红线）。
#
# fail-safe（绝不阻断、绝不死锁，对齐老仓）：prompt 空 / 非项目 / patterns 未载入 / 任何异常 → exit 0。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

# 从 $INPUT 提取顶层字符串键（逐字复用 gate.sh json_get；纯 bash，不 spawn jq/node）
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
[ -z "$PROMPT" ] && exit 0
CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] || exit 0

# ── 跳过规则（老仓同款，纯 bash；避免对非任务输入误路由）──
# 0. 系统通知 / 自身回显（含本 hook 上一轮注入的 <workflow-state>）——非用户新指令
case "$PROMPT" in
  *"<task-notification>"*|*"<task-id>"*|*"<output-file>"*|*"<workflow-state>"*|*"<pipeline-router"*) exit 0 ;;
esac
# 1. 显式命令 /xxx——用户已明确指令
case "$PROMPT" in /*) exit 0 ;; esac
# 2. L5 override 关键字——用户要求快速修复，跳过路由
case "$PROMPT" in
  *只改*|*快速修复*|*临时修复*|*就这一行*|*就改这个*|*别想太多*|*just\ fix*|*quick\ patch*|*typo*|*hotfix\ only*|*one-liner*) exit 0 ;;
esac
# 3. chat / 讨论类——直接对话，即便含 track 关键词也不路由
case "$PROMPT" in
  *如何使用*|*怎么用*|*是什么*|*为什么*|*解释*|*文档在哪*|*在哪里*|*意思是*|*我觉得*|*我感觉*|*你觉得*|*是不是*|*怎么样*|*看法*|*聊聊*|*讨论一下*|*有没有更好*) exit 0 ;;
esac
if printf '%s' "$PROMPT" | grep -qiE '^[[:space:]]*(what|why|how|when|where|who|can you (tell|explain|describe))\b'; then
  exit 0
fi

# ── 定位项目根 + 最新活跃 change 相位/track（上溯至多 5 层，同 gate/breadcrumb/statusline）──
yget() { # $1=file $2=key —— grep 首个 '^key: '，剥一层首尾同款引号（单层去引号契约）
  local v
  v="$(grep -m1 "^$2: " "$1" 2>/dev/null || true)"
  v="${v#"$2: "}"
  case "$v" in
    '"'*'"') v="${v#\"}"; v="${v%\"}" ;;
    "'"*"'") v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}
PROOT="" d="$CWD"
for _ in 1 2 3 4 5; do
  if [ -d "$d/openspec/changes" ]; then PROOT="$d"; break; fi
  [ "$d" = "/" ] && break
  d="$(dirname "$d")"
done
CHANGE_NAME="" CHANGE_PHASE="" CHANGE_TRACK=""
if [ -n "$PROOT" ]; then
  BEST=0
  for f in "$PROOT"/openspec/changes/*/.pipeline.yaml; do
    [ -f "$f" ] || continue
    [ "$(yget "$f" archived)" = "true" ] && continue
    mt="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
    [[ "$mt" =~ ^[0-9]+$ ]] || mt=0
    if [ "$mt" -ge "$BEST" ]; then
      BEST="$mt"
      CHANGE_NAME="$(basename "$(dirname "$f")")"
      CHANGE_PHASE="$(yget "$f" phase)"
      CHANGE_TRACK="$(yget "$f" track)"
    fi
  done
fi

# ── 派生缓存定位 + mtime 缓存重生成（**唯一** spawn node 的分支；仅 manifest 变更时触发）──
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)}"
MANIFEST="$PLUGIN_ROOT/templates/manifest.yaml"
CACHE="${PIPELINE_ROUTER_CACHE:-${HOME:-/tmp}/.claude/.pipeline-router.generated.sh}"
_CLI_BUNDLE="$PLUGIN_ROOT/packages/cli/dist/pipeline.mjs"
_GEN_MJS="$PLUGIN_ROOT/hooks/router-gen.mjs"

# 缓存生成器（**非热路径**：仅 stale 时调用一次）。生产优先走 bundle 内部子命令
# `pipeline _gen-router-sh`（待主会话接线，bundle 自含 kernel、安装态最稳）；回退自带 router-gen.mjs。
# 原子写：写 tmp、校验含 FE_PATTERN 才 mv，失败保留旧缓存（宁可陈旧 patterns 也不清空→静默失效）。
_router_regen() { # $1=manifest $2=out
  command -v node >/dev/null 2>&1 || return 1
  [ -f "$1" ] || return 1
  mkdir -p "$(dirname "$2")" 2>/dev/null || true
  local tmp="$2.tmp.$$"
  if [ -f "$_CLI_BUNDLE" ] && node "$_CLI_BUNDLE" _gen-router-sh "$1" > "$tmp" 2>/dev/null && grep -q 'FE_PATTERN=' "$tmp" 2>/dev/null; then
    mv "$tmp" "$2" 2>/dev/null || rm -f "$tmp" 2>/dev/null
    return 0
  fi
  if [ -f "$_GEN_MJS" ] && node "$_GEN_MJS" "$1" > "$tmp" 2>/dev/null && grep -q 'FE_PATTERN=' "$tmp" 2>/dev/null; then
    mv "$tmp" "$2" 2>/dev/null || rm -f "$tmp" 2>/dev/null
    return 0
  fi
  rm -f "$tmp" 2>/dev/null
  return 1
}
if [ ! -f "$CACHE" ] || [ "$MANIFEST" -nt "$CACHE" ]; then
  _router_regen "$MANIFEST" "$CACHE" || true
fi

# ══════════════════════════════════════════════════════════════════════════════════════
# ═══ HOT PATH（每轮命中缓存走这里：纯 bash `source` + `grep` 打分，零 node/解释器 spawn）═══
# 本行以下**不得**出现任何 node/python/解释器 spawn（tools/test-hooks.sh 红线段自证之）。
# ══════════════════════════════════════════════════════════════════════════════════════
[ -f "$CACHE" ] && . "$CACHE" 2>/dev/null

# fail-safe：patterns 未载入（manifest/node 坏、且无旧缓存）→ 不路由、非阻断 exit 0（老仓同款）
[ -z "${FE_PATTERN:-}" ] && exit 0

# 关键词命中评分（老 score_track 语义：grep -ciE，无匹配 grep exit 非 0 用 || n=0 兜底）
score_track() {
  local n
  n="$(printf '%s' "$PROMPT" | grep -ciE "$1" 2>/dev/null)" || n=0
  [[ "$n" =~ ^[0-9]+$ ]] || n=0
  printf '%s' "$n"
}
FE_SCORE="$(score_track "${FE_PATTERN:-}")"
BE_SCORE="$(score_track "${BE_PATTERN:-}")"
PM_SCORE="$(score_track "${PM_PATTERN:-}")"

# 选最高分 Track（平手时按 fe→be→pm 先到先得，与老仓一致：仅 `>` 才更新 MAX）
MAX=0 TRACK=""
[ "$FE_SCORE" -gt "$MAX" ] && { MAX="$FE_SCORE"; TRACK=frontend; }
[ "$BE_SCORE" -gt "$MAX" ] && { MAX="$BE_SCORE"; TRACK=backend; }
[ "$PM_SCORE" -gt "$MAX" ] && { MAX="$PM_SCORE"; TRACK=pm; }
# 阈值：单类得分 < 1 不注入；未识别 Track → 不注入（让用户自由对话）
[ "$MAX" -lt 1 ] && exit 0
[ -z "$TRACK" ] && exit 0

# ── 组装注入体：相位 + Track + 推荐/强制 skill + breadcrumb 行动提示 ──
# EFF_PHASE：有活跃 change 用其相位，否则视作待立项 open；白名单化以安全用于间接变量名
EFF_PHASE="${CHANGE_PHASE:-open}"
case "$EFF_PHASE" in open|explore|spec|build|verify|ship|archive) ;; *) EFF_PHASE=open ;; esac
_bcv="BREADCRUMB_${EFF_PHASE}"; BC="${!_bcv:-}"
_rsv="RECSKILL_${EFF_PHASE}_${TRACK}"; REC="${!_rsv:-}"
_msv="MANDSKILL_${EFF_PHASE}_${TRACK}"; MAND="${!_msv:-}"

if [ -n "$CHANGE_NAME" ]; then
  HDR="change=${CHANGE_NAME} · phase=${EFF_PHASE} · 疑似 track=${TRACK}（评分 ${MAX}）"
  TAIL="本轮疑似 ${TRACK} 相关操作；已在 pipeline 中，按 ${EFF_PHASE} 相位纪律推进（勿跳相位、勿自动 transition，产出交用户确认后再推进）。"
else
  HDR="疑似 track=${TRACK}（评分 ${MAX}）· 尚无活跃 change"
  TAIL="疑似 ${TRACK} Track 新任务。**先用 AskUserQuestion 与用户确认怎么走**：走 pipeline 全流程（${TRACK}：open→explore→spec→build⇄verify→ship→archive）/ 直接执行相关 skill / 仅提问讨论。仅当用户选「走 pipeline」才加载 pipeline skill；L5 override（快速修复等）可直接跳过。"
fi

printf '\n<workflow-state>\nrouter: %s\n' "$HDR"
[ -n "$BC" ] && printf '%s\n' "$BC"
[ -n "$REC" ] && printf '推荐 skill：%s\n' "$REC"
[ -n "$MAND" ] && printf '本相位强制 skill：%s\n' "$MAND"
printf '%s\n</workflow-state>\n' "$TAIL"
exit 0
