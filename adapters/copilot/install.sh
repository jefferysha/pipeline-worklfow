#!/usr/bin/env bash
# adapters/copilot/install.sh — 安装 GitHub Copilot pipeline 适配器（lite，档 B）。
#
# 投影产物：
#   .github/copilot/hooks.json      veto(preToolUse) + track(postToolUse)   ┐ dual hookContainer：
#   .github/hooks/trellis.json      同源第二份（漏一份 copilot 引擎不生效）  ┘ 两份都写
#   .github/copilot-instructions.md inject 降级静态层（copilot session-start 平台私有不可控，contract §1）
#
# 三能力：veto/track native、inject **降级**（不伪装会话级 inject）。__ADAPTER_DIR__ 定死为
# 仓库内适配器绝对路径，wrapper 从仓库跑，自定位 lite baseline hooks/gate.sh · skill-tracker.sh。
#
# 选项：--target <dir>（默认 $PWD）/ --no-hooks（只装静态层，降级）/ --yes / -h
set -uo pipefail

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

G='\033[32m'; Y='\033[33m'; R='\033[31m'; B='\033[1m'; Z='\033[0m'
info() { printf "${G}[copilot]${Z} %b\n" "$1"; }
warn() { printf "${Y}[copilot]${Z} %b\n" "$1"; }
err()  { printf "${R}[copilot]${Z} %b\n" "$1" >&2; }
note() { printf "%b\n" "$1"; }

TARGET="$PWD"
WITH_HOOKS=1
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)   TARGET="${2:?--target 需要目录}"; shift 2 ;;
    --no-hooks) WITH_HOOKS=0; shift ;;
    --yes|-y)   ASSUME_YES=1; shift ;;
    -h|--help)  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) err "未知参数: $1（见 --help）"; exit 2 ;;
  esac
done

# ── inject 降级静态层 .github/copilot-instructions.md（copilot 平台文档级上下文文件）──
install_instructions() {
  local dir="$TARGET/.github"
  mkdir -p "$dir"
  local f="$dir/copilot-instructions.md"
  local START="<!-- PIPELINE:COPILOT:START -->" END="<!-- PIPELINE:COPILOT:END -->"
  local block; block="$(cat <<'EOF'
## Pipeline Workflow（Copilot inject 降级静态层）

> Copilot session-start 为平台私有、不可控——本文件是 pipeline 上下文的降级静态层（契约 §1）。
> 动态 breadcrumb 由 userPromptSubmitted 补偿（若平台支持）；enforcement 由 hooks preToolUse 硬拦。

7-phase 流水线：open → explore → spec → build ⇄ verify → ship → archive。
状态操作一律走 `pipeline` CLI（status / get / set / transition / check），勿手改 `.pipeline.yaml`。

离开 review phase（explore / spec / verify）须对确切 event 取得人类显式确认：

    pipeline review request <change> --event <event>
    # 人类确认后：
    pipeline review acknowledge <change>

不得删除 `.pipeline-pending-review` 绕过 review-gate（会产生 solo 推进）。
EOF
)"
  if [ -f "$f" ] && grep -qF "$START" "$f" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    awk -v s="$START" -v e="$END" -v blk="$block" '
      $0==s {print s; print blk; print e; skip=1; next}
      $0==e {skip=0; next}
      !skip {print}
    ' "$f" > "$tmp" && mv "$tmp" "$f"
  else
    { printf '\n%s\n' "$START"; printf '%s\n' "$block"; printf '%s\n' "$END"; } >> "$f"
  fi
  info "copilot-instructions.md 静态层 → ${f}（inject 降级，哨兵块幂等）"
}

# ── dual hookContainer：同源写 .github/copilot/hooks.json + .github/hooks/trellis.json ──
install_hooks_dual() {
  local d1="$TARGET/.github/copilot" d2="$TARGET/.github/hooks"
  mkdir -p "$d1" "$d2"
  local dst
  for dst in "$d1/hooks.json" "$d2/trellis.json"; do
    if [ -f "$dst" ] && ! grep -q "pipeline 适配器 hook 注册" "$dst" 2>/dev/null; then
      warn "$dst 已存在（疑似你既有 hook）——不覆盖，替换版写到 $dst.pipeline-adapter 供合并。"
      sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/hooks.json" > "$dst.pipeline-adapter"
    else
      sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/hooks.json" > "$dst"
      info "hooks → ${dst}（veto/track 绝对路径已绑定）"
    fi
  done
  warn "dual hookContainer：两份都已写（漏一份 copilot 引擎读不到 hook、不生效）。"
}

note "${B}GitHub Copilot pipeline 适配器安装${Z}  target=${TARGET}"
install_instructions
if [ "$WITH_HOOKS" = 1 ]; then
  install_hooks_dual
  info "档 B 完成：veto/track native（dual hookContainer）+ inject 降级静态层。"
else
  warn "--no-hooks：跳过 hooks（无自动强制；review 仍须走 pipeline review request/acknowledge）。"
fi
exit 0
