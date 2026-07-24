#!/usr/bin/env bash
# adapters/devin/install.sh — 安装 Devin（前 Windsurf）pipeline 适配器（lite，档 C 静态降级）。
#
# devin 是 workflow-only 平台（hasHooks=false，无任何 enforcement hook）——三能力**全静态降级**：
#   inject → .devin/workflows/pipeline.md 静态层（无会话级注入原语）
#   veto   → 无硬拦；review 仍靠保留人工确认事实的 CLI receipt
#   track  → 无自动留痕；如实标注（tier C 无 hook 触发点）
#
# 诚实：devin 确实只能到 C 档，不伪装 hook 强制（本目录无 hooks/）。windsurf 用户经 --devin 派发
# （Cognition 2026-06 把 Windsurf 改名 Devin，configDir .windsurf/ → .devin/）。
#
# 选项：--target <dir>（默认 $PWD）/ --yes / -h
set -uo pipefail

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
CONFIG_DIR=".devin/workflows"

G='\033[32m'; Y='\033[33m'; R='\033[31m'; B='\033[1m'; Z='\033[0m'
info() { printf "${G}[devin]${Z} %b\n" "$1"; }
warn() { printf "${Y}[devin]${Z} %b\n" "$1"; }
err()  { printf "${R}[devin]${Z} %b\n" "$1" >&2; }
note() { printf "%b\n" "$1"; }

TARGET="$PWD"; ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)  TARGET="${2:?--target 需要目录}"; shift 2 ;;
    --yes|-y)  ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) err "未知参数: $1（见 --help）"; exit 2 ;;
  esac
done

# ── 旧 .windsurf/ 兜底提示（只告知，不迁移）──
note_legacy() {
  if [ -d "$TARGET/.windsurf/workflows" ]; then
    warn "检测到旧 .windsurf/workflows（Windsurf 已改名 Devin）——pipeline 在 .devin/ 重生产物；"
    warn "旧目录保留不动（无迁移系统）。可手动删除旧 .windsurf/ 若不再需要。"
  fi
}

# ── inject 降级静态层 .devin/workflows/pipeline.md（workflow-only 唯一注入路径）──
install_workflow() {
  local dst="$TARGET/$CONFIG_DIR"
  mkdir -p "$dst"
  cat > "$dst/pipeline.md" <<'EOF'
# Pipeline Workflow（Devin workflow-only 静态层，档 C）

> Devin 是 workflow-only 平台，无 enforcement hook——本 workflow 是 pipeline 三能力的全静态降级层（契约 §1）。
> inject=本文件；veto=静态 advisory；track=无自动留痕（如实标注）。review 仍以 CLI canonical receipt 为准。

7-phase 流水线：open → explore → spec → build ⇄ verify → ship → archive。
状态操作一律走 `pipeline` CLI（status / get / set / transition / check），勿手改 .pipeline.yaml。

离开 review phase（explore / spec / verify）须对确切 event 取得人类显式确认。Devin 无 hook 硬拦时仍须：

    pipeline review request <change> --event <event>
    # 记录人类确认后：
    pipeline review acknowledge <change>

不得删除 `.pipeline-pending-review` 绕过 review-gate（会产生 solo 推进）。命令前缀 /pipeline-（如 /pipeline-explore）。
EOF
  info "workflow → $dst/pipeline.md（inject 降级静态层；无 hook，review 仍走 CLI acknowledgement）"
}

note "${B}Devin（前 Windsurf）pipeline 适配器安装${Z}  target=${TARGET}"
note_legacy
install_workflow
info "档 C（静态降级）完成：三能力全静态，${B}未装 hook${Z}（workflow-only，不伪装强制）。"
exit 0
