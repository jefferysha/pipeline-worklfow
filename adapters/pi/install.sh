#!/usr/bin/env bash
# adapters/pi/install.sh — 安装 Pi Agent pipeline 适配器（lite，档 B）。
#
# 投影产物：
#   .pi/settings.json#hooks   inject(SessionStart) + track(PostToolUse)（__ADAPTER_DIR__ 定死绝对路径，
#                             wrapper 从仓库跑，自定位 lite baseline hooks/*.sh）
#   .pi/rules/pipeline.md     veto 降级 advisory 静态层（pi 无原生 pre-tool 硬拦 → 靠此 + CLI review receipt）
#
# 三能力：inject/track native、veto **降级**（不伪装原生硬拦，contract §1）。无 trust 机制、落盘即生效。
#
# 选项：--target <dir>（默认 $PWD）/ --pi-home <dir>（默认 $TARGET/.pi）/ --no-hooks（只装静态层）/ --yes / -h
set -uo pipefail

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

G='\033[32m'; Y='\033[33m'; R='\033[31m'; B='\033[1m'; Z='\033[0m'
info() { printf "${G}[pi]${Z} %b\n" "$1"; }
warn() { printf "${Y}[pi]${Z} %b\n" "$1"; }
err()  { printf "${R}[pi]${Z} %b\n" "$1" >&2; }
note() { printf "%b\n" "$1"; }

TARGET="$PWD"
PI_HOME_DIR=""
WITH_HOOKS=1
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)  TARGET="${2:?--target 需要目录}"; shift 2 ;;
    --pi-home) PI_HOME_DIR="${2:?--pi-home 需要目录}"; shift 2 ;;
    --no-hooks) WITH_HOOKS=0; shift ;;
    --yes|-y)  ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) err "未知参数: $1（见 --help）"; exit 2 ;;
  esac
done
[ -n "$PI_HOME_DIR" ] || PI_HOME_DIR="$TARGET/.pi"

# ── veto 降级 advisory 静态层 .pi/rules/pipeline.md（enforcement 走 .pi/extensions 运行时 + CLI review receipt）──
install_rules() {
  local rdir="$PI_HOME_DIR/rules"
  mkdir -p "$rdir"
  cat > "$rdir/pipeline.md" <<'EOF'
# Pipeline Workflow（Pi veto 降级 advisory 层）

> Pi 无原生 pre-tool 硬拦 hook——本规则文件是 veto 能力的降级 advisory 层（契约 §1）。
> inject/track 由 .pi/settings.json#hooks 原生实现；enforcement（veto）为 advisory：
> 写类工具遇新鲜门 marker 时**应自我暂停**；review 的确认由 `pipeline review acknowledge` 写入 canonical receipt，
> 不能通过删除 marker 伪造放行。

7-phase 流水线：open → explore → spec → build ⇄ verify → ship → archive。
状态操作一律走 `pipeline` CLI（status / get / set / transition / check），勿手改 .pipeline.yaml。

离开 review phase（explore / spec / verify）须对确切 event 取得人类显式确认：

    pipeline review request <change> --event <event>
    # 人类确认后：
    pipeline review acknowledge <change>

不得删除 `.pipeline-pending-review` 绕过 review-gate（会产生 solo 推进）。
EOF
  info "rules/pipeline.md → $rdir/pipeline.md（veto 降级 advisory 静态层）"
}

# ── settings.json#hooks 投递（inject/track；占位替换为绝对适配器路径）──
install_hooks_settings() {
  mkdir -p "$PI_HOME_DIR" || { err "无法创建 .pi: $PI_HOME_DIR"; exit 1; }
  local sj="$PI_HOME_DIR/settings.json"
  if [ -f "$sj" ]; then
    warn "$sj 已存在——不自动覆盖你既有 settings。替换版写到 $sj.pipeline-adapter 供合并。"
    sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/settings.json" > "$sj.pipeline-adapter"
    return 0
  fi
  sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/settings.json" > "$sj"
  info "settings.json#hooks → ${sj}（inject/track native；无 veto hook——如实降级）"
}

note "${B}Pi Agent pipeline 适配器安装${Z}  target=${TARGET}  pi-home=${PI_HOME_DIR}"
install_rules
if [ "$WITH_HOOKS" = 1 ]; then
  install_hooks_settings
  info "档 B 完成：inject/track native + veto 降级 advisory（无 trust，落盘即生效）。"
else
  warn "--no-hooks：跳过 settings.json#hooks（无 inject/track；review 仍须走 pipeline review request/acknowledge）。"
fi
exit 0
