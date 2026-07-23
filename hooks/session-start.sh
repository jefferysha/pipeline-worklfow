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

PLUGIN_ROOT="${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}}"
CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"

# Release updates are opt-in (`pipeline setup --codex|--claude --auto-update`).  Keep SessionStart
# non-blocking: the helper only claims a once-per-day slot and backgrounds the host marketplace
# refresh; failure remains invisible to the workflow hook and is written to the user-owned log.
AUTO_UPDATE="$PLUGIN_ROOT/hooks/auto-update.sh"
[ -x "$AUTO_UPDATE" ] && "$AUTO_UPDATE" "$PLUGIN_ROOT" >/dev/null 2>&1 || true

# ── 项目根定位：只接受 cwd、显式根或 Git worktree 根，绝不从共同父目录借 OpenSpec。──
ROOT_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/project-root.sh"
OS_ROOT=""
if [ -r "$ROOT_HELPER" ]; then
  # shellcheck source=project-root.sh
  . "$ROOT_HELPER"
  OS_ROOT="$(pipeline_project_root "$CWD" existing openspec || true)"
fi

# 顶层键提取：grep 首个 '^key: '，剥一层首尾同款引号（同 statusline.sh yget，单层去引号契约）
STATE_HELPER="$(dirname "${BASH_SOURCE[0]:-$0}")/canonical-state.sh"
if [ -r "$STATE_HELPER" ]; then
  . "$STATE_HELPER"
else
  pipeline_state_source() { [ -f "$1/.pipeline.yaml" ] && printf '%s' "$1/.pipeline.yaml"; }
  pipeline_state_get() { local v; v="$(grep -m1 "^$2: " "$1" 2>/dev/null || true)"; v="${v#"$2: "}"; case "$v" in '"'*'"') v="${v#\"}"; v="${v%\"}" ;; "'"*"'") v="${v#\'}"; v="${v%\'}" ;; esac; printf '%s' "$v"; }
fi
yget() { pipeline_state_get "$1" "$2"; }

# 阶段×hook 开关（v5 T5 / 决议#2）：读 <项目根>/.pipeline/hooks.json（server 写端点落盘，
# canonical 一键一行 `"<hook>.<阶段>": false`，只存禁用项，见 packages/server/src/hooksConfig.ts）。
# 纯 bash（SessionStart 低频但仍守 §5.4 红线：零解释器/外部 JSON 解析器 spawn）：grep -F 定长匹配即可判定；
# 缺文件/缺键/手改格式漂移/损坏 JSON → 一律 fail-open 到启用（行为与本配置诞生之前完全一致）。
# gate.sh 交互门与 interactive-skill-gate.sh 安全门强制常开：不读本配置（server 写端点也拒绝这两个 id）。
hook_disabled() { # $1=项目根 $2=hook id $3=阶段 → 0=该阶段已禁用
  [ -n "$1" ] && [ -n "$3" ] || return 1
  grep -Fq "\"$2.$3\": false" "$1/.pipeline/hooks.json" 2>/dev/null
}

# 当前阶段只用于 SessionStart 开关与 AFK 静态提示，取 mtime 最新的非归档 change；它不是
# 会话绑定，真实恢复必须由 UserPromptSubmit 的明确意图判定。
# 同一趟顺手判定 v6 T5 AFK 首跑提示命中（活跃 change 的 automation 字段非 off/空）——复用本循环已在
# 做的文件遍历/archived 判断，不另起第二趟目录扫描（T5 TDD 要求③「无新增子进程 spawn」：另起一趟
# 会让本函数 stat/grep 调用数翻倍，实测在 40-change 项目上耗时从 ~0.65s 升到 ~0.96s，故合并进本循环）。
SS_PHASE=""
SS_AFK_HIT=""
[ -n "$OS_ROOT" ] && [ -f "$OS_ROOT/.pipeline/automation.json" ] && SS_AFK_HIT=1
if [ -n "$OS_ROOT" ] && [ -d "$OS_ROOT/openspec/changes" ]; then
  SS_BEST=0
  for change_dir in "$OS_ROOT"/openspec/changes/*; do
    [ -d "$change_dir" ] || continue
    f="$(pipeline_state_source "$change_dir" || true)"
    [ -n "$f" ] || continue
    [ "$(yget "$f" archived)" = "true" ] && continue
    # GNU `stat -f` 是文件系统状态模式（非 mtime），先试 GNU 语法（-c）+ 数字校验兜底（同各 hook）。
    mt="$(stat -c %Y "$f" 2>/dev/null)"
    case "$mt" in ''|*[!0-9]*) mt="$(stat -f %m "$f" 2>/dev/null)" ;; esac
    case "$mt" in ''|*[!0-9]*) mt=0 ;; esac
    if [ "$mt" -ge "$SS_BEST" ]; then SS_BEST="$mt"; SS_PHASE="$(yget "$f" phase)"; fi
    if [ -z "$SS_AFK_HIT" ]; then
      case "$(yget "$f" automation)" in
        ''|off) ;;
        *) SS_AFK_HIT=1 ;;
      esac
    fi
  done
fi
if [ -n "$OS_ROOT" ]; then
  hook_disabled "$OS_ROOT" session-start "$SS_PHASE" && exit 0
fi

# ── 简短引导（一行相位图 + 项目 GOAL.md 头两行，若有）──
printf '[pipeline-lite] 7-phase 流水线已加载：open → explore → spec → build ⇄ verify → ship → archive。状态操作一律走 pipeline CLI（status / get / set / transition / check），编排入口 skill：pipeline。\n'
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

# ── 注入②：当前项目 pipeline 上下文（OS_ROOT/yget 已在文件头定位/定义，开关判定同源复用）──
if [ -n "$OS_ROOT" ] && [ -d "$OS_ROOT/openspec/changes" ]; then
  # 活跃 change 列表（archived != true）
  CTX=""
  for change_dir in "$OS_ROOT"/openspec/changes/*; do
    [ -d "$change_dir" ] || continue
    f="$(pipeline_state_source "$change_dir" || true)"
    [ -n "$f" ] || continue
    [ "$(yget "$f" archived)" = "true" ] && continue
    name="$(basename "$change_dir")"
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
    printf '  上述均为恢复候选，未与本会话自动绑定；只有用户明确说“继续 <change>”或点名 change 才恢复。新目标会独立从 open 创建。\n'
  fi
fi

# ── 注入③：openspec 使用提示（openspec 目录存在才输出）──
if [ -n "$OS_ROOT" ]; then
  printf '\n[openspec 提示] 本项目使用 openspec：change 唯一状态在 openspec/changes/<name>/.pipeline-run/current.json，.pipeline.yaml 仅兼容投影（两者均勿手改，走 pipeline CLI）；主 spec 在 openspec/specs/<capability>/spec.md，动某能力前先 Read 对应 spec；归档产物沉在 openspec/changes/archive/。\n'
fi

# ── v6 T5 / full-install 批2 P2-T2：AFK 首跑 + 技能就绪提示（轻量静态提示，不做真探测）──
#    SS_AFK_HIT 已在文件头「当前阶段」循环里顺手判定（.pipeline/automation.json 存在，或活跃 change 的
#    automation 字段非 off/空）；此处只管输出。刻意不做任何 docker/凭证/技能真探测——SessionStart
#    零阻断纪律下探测可能挂起（守零 spawn，只改文案不加探测）。指向 dashboard 就绪三灯（GET
#    /api/afk/readiness，v6 T4）**并**指向 `pipeline doctor`——批2 A1 已给 doctor 补上缺技能检测与
#    保障生效面，v6 计划附录矛盾登记 1 的取舍在本批已消解，故回改指向该命令。
[ -n "$SS_AFK_HIT" ] && printf '\n[pipeline-lite] 检测到 AFK 自动化配置：AFK 就绪状态见 dashboard（就绪三灯）；技能齐全度/保障生效面跑 pipeline doctor 核对。\n'

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
