#!/usr/bin/env bash
# session-start.sh — SessionStart：简短引导 + 三注入（BACKLOG #20）+ 插件资产校验（CONTRACT §5.7）。
#
# 三注入（语义对齐老仓 workflow-enforcer / pipeline-context-injector / openspec-injector 的 lite 化）：
#   ① 宪法：cat templates/workflow.md（相对插件根定位）
#   ② 当前项目 pipeline 上下文：cwd 上溯找 openspec/changes，列活跃 change 的 名字/相位/门状态
#   ③ openspec 目录存在时输出一段使用提示
# 纯 bash（SessionStart 低频，但仍守 §5.4 红线：零解释器 spawn，yaml 只 grep 顶层键）；
# 校验交给 tools/verify-skills.sh。任何一步失败静默跳过、绝不阻断会话，exit 恒 0
# （fail-open——SessionStart 挂了会拖慢/卡死所有会话，宁可放行）。
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

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"

# ── 简短引导（一行相位图 + 项目 GOAL.md 头两行，若有）──
printf '[pipeline-lite] 7-phase 流水线已加载：open → explore → spec → build ⇄ verify → ship → archive。状态操作一律走 pipeline CLI（status / get / set / transition / check），编排入口 skill：/pipeline-lite。\n'
if [ -f "$CWD/GOAL.md" ]; then
  head -2 "$CWD/GOAL.md" 2>/dev/null || true
fi

# ── 注入①：工作流宪法（templates/workflow.md，相对插件根；缺文件静默跳过）──
WF="$PLUGIN_ROOT/templates/workflow.md"
if [ -f "$WF" ]; then
  printf '\n[pipeline-lite 宪法 — %s]\n' "$WF"
  cat "$WF" 2>/dev/null || true
  printf '[宪法完]\n'
fi

# ── 注入②：当前项目 pipeline 上下文（cwd 上溯至多 5 层找 openspec/，同 gate/breadcrumb 上溯语义）──
OS_ROOT="" d="$CWD"
for _ in 1 2 3 4 5; do
  if [ -d "$d/openspec" ]; then OS_ROOT="$d"; break; fi
  [ "$d" = "/" ] && break
  d="$(dirname "$d")"
done

# 顶层键提取：grep 首个 '^key: '，剥一层首尾同款引号（同 statusline.sh yget，单层去引号契约）
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

if [ -n "$OS_ROOT" ] && [ -d "$OS_ROOT/openspec/changes" ]; then
  # 活跃 change 列表（archived != true）
  CTX=""
  for f in "$OS_ROOT"/openspec/changes/*/.pipeline.yaml; do
    [ -f "$f" ] || continue
    [ "$(yget "$f" archived)" = "true" ] && continue
    name="$(basename "$(dirname "$f")")"
    phase="$(yget "$f" phase)"
    track="$(yget "$f" track)"
    CTX="${CTX}  - ${name}（track=${track:-?}, phase=${phase:-?}）
"
  done
  # 新鲜门 marker → 等:<kind>。TTL 分级同 gate.sh / types.ts GATE_TTL_MS（BACKLOG #13，
  # 对齐老内核：confirm 300s / review·interaction 1800s；边界 age ≤ TTL 仍新鲜）。
  GATES=""
  now="$(date +%s)"
  for kind in confirm review interaction; do
    m="$OS_ROOT/.pipeline-pending-$kind"
    [ -f "$m" ] || continue
    case "$kind" in confirm) ttl=300 ;; *) ttl=1800 ;; esac
    # GNU `stat -f` 是文件系统状态模式（非 mtime），在 Linux 上会"成功"吐非数字，兜底永不触发
    # ——先试 GNU 语法（-c）+ 数字校验，而非只靠退出码判断。
    mt="$(stat -c %Y "$m" 2>/dev/null)"
    case "$mt" in ''|*[!0-9]*) mt="$(stat -f %m "$m" 2>/dev/null)" ;; esac
    case "$mt" in ''|*[!0-9]*) mt="$now" ;; esac
    [ $((now - mt)) -le "$ttl" ] && GATES="$GATES 等:$kind"
  done
  if [ -n "$CTX" ]; then
    printf '\n[pipeline 上下文 — %s] 活跃 change：\n%s' "$OS_ROOT" "$CTX"
    [ -n "$GATES" ] && printf '  待处理交互门：%s（新鲜 marker，写类工具会被 gate.sh 拦，先 AskUserQuestion 解封）\n' "${GATES# }"
    printf '  断点恢复：pipeline status <name> 定位后从当前相位继续，不新开。\n'
  fi
fi

# ── 注入③：openspec 使用提示（openspec 目录存在才输出）──
if [ -n "$OS_ROOT" ]; then
  printf '\n[openspec 提示] 本项目使用 openspec：change 状态在 openspec/changes/<name>/.pipeline.yaml（勿手改，走 pipeline CLI）；主 spec 在 openspec/specs/<capability>/spec.md，动某能力前先 Read 对应 spec；归档产物沉在 openspec/changes/archive/。\n'
fi

# ── 插件资产校验（fail-open：失败仅警告）──
VS="$PLUGIN_ROOT/tools/verify-skills.sh"
if [ -f "$VS" ]; then
  if ! bash "$VS" --quiet --root "$PLUGIN_ROOT" 1>&2; then
    printf '[pipeline-lite] 警告：插件资产校验未通过（存在悬空引用，明细见上；复跑：bash %s）。会话不阻断，但请尽快修复。\n' "$VS" >&2
  fi
else
  printf '[pipeline-lite] 警告：未找到 %s，跳过插件资产校验（CONTRACT §5.7 要求安装期校验）。\n' "$VS" >&2
fi

exit 0
