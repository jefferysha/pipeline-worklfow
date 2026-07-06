#!/usr/bin/env bash
# adapters/codex/install.sh — 安装 Codex pipeline 适配器（lite 版，分档 A/B/C）。
#
# 三档（互斥，由 flag 选）：
#   默认（无 flag）= 档 A 全保真·manual-trust：
#       写 hooks.json（inject/veto/track wrapper 绝对路径）到 CODEX_HOME，落静态上下文层，
#       结尾打印一次性 trust 指引（codex TUI 里 /hooks 按 t）。
#   --managed  = 档 B 全保真·managed/MDM：写 /etc/codex/{requirements.toml,managed_hooks}。需 root。
#       绝不静默 sudo——非 root 就打印需手动 sudo 的命令、不自动执行。
#   --static   = 档 C 静态降级：只落静态上下文层（AGENTS.md 哨兵块），不装 hooks（无自动强制，
#       靠 AGENTS.md 自律 + 手动 Unlock sentinel `rm .pipeline-pending-<kind>`）。
#
# 选项：--target <dir>（默认 $PWD）/ --codex-home <dir>（默认 ${CODEX_HOME:-$HOME/.codex}）/ --yes / -h
# 安全：默认绝不碰 /etc 或 root 路径；--managed 检测非 root 即停、只打印命令。
set -uo pipefail

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLATFORM_ID=codex

G='\033[32m'; Y='\033[33m'; R='\033[31m'; B='\033[1m'; Z='\033[0m'
info() { printf "${G}[codex]${Z} %b\n" "$1"; }
warn() { printf "${Y}[codex]${Z} %b\n" "$1"; }
err()  { printf "${R}[codex]${Z} %b\n" "$1" >&2; }
note() { printf "%b\n" "$1"; }

MODE="full"        # full(A) | managed(B) | static(C)
TARGET="$PWD"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --managed) MODE="managed"; shift ;;
    --static)  MODE="static";  shift ;;
    --target)  TARGET="${2:?--target 需要目录参数}"; shift 2 ;;
    --codex-home) CODEX_HOME_DIR="${2:?--codex-home 需要目录参数}"; shift 2 ;;
    --yes|-y)  ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) err "未知参数: $1（见 --help）"; exit 2 ;;
  esac
done

confirm() { # prompt → 0 同意
  [ "$ASSUME_YES" = 1 ] && return 0
  printf "%b%s%b [y/N] " "$B" "$1" "$Z"
  local ans; read -r ans </dev/tty 2>/dev/null || ans=""
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# ── 静态上下文层（三档共用）：AGENTS.md 哨兵 managed-block，幂等可重刷 ──
install_static() {
  local dest="$1"
  mkdir -p "$dest" || { err "无法创建目标目录: $dest"; exit 1; }
  local START="<!-- PIPELINE:CODEX:START -->" END="<!-- PIPELINE:CODEX:END -->"
  local block; block="$(cat <<'EOF'
## Pipeline Workflow（Codex 静态层）

7-phase 流水线：open → explore → spec → build ⇄ verify → ship → archive。状态操作一律走 `pipeline` CLI
（status / get / set / transition / check），勿手改 `.pipeline.yaml`。

进入 review phase（explore / spec / verify 出口）须人类显式确认才能 transition。档 C 无 hook 硬拦，
用 **Unlock sentinel** 放行：确认无误后删除项目根 marker 即可——

    rm .pipeline-pending-review   # 或 .pipeline-pending-confirm / .pipeline-pending-interaction

不得绕过 review-gate（会产生 solo 推进）。
EOF
)"
  local f="$dest/AGENTS.md"
  if [ -f "$f" ] && grep -qF "$START" "$f" 2>/dev/null; then
    # 哨兵块精确替换（块内重刷、块外用户内容原样保留）
    local tmp; tmp="$(mktemp)"
    awk -v s="$START" -v e="$END" -v blk="$block" '
      $0==s {print s; print blk; print e; skip=1; next}
      $0==e {skip=0; next}
      !skip {print}
    ' "$f" > "$tmp" && mv "$tmp" "$f"
  else
    { printf '\n%s\n' "$START"; printf '%s\n' "$block"; printf '%s\n' "$END"; } >> "$f"
  fi
  info "AGENTS.md 静态层 → ${f}（哨兵块幂等）"
}

# ── hooks.json 投递（档 A）：占位替换为绝对适配器路径 ──
install_hooks_codex_home() {
  mkdir -p "$CODEX_HOME_DIR" || { err "无法创建 CODEX_HOME: $CODEX_HOME_DIR"; exit 1; }
  local hj="$CODEX_HOME_DIR/hooks.json"
  if [ -f "$hj" ]; then
    warn "CODEX_HOME 已存在 hooks.json: $hj —— 不自动覆盖你既有 hook。"
    warn "已替换占位的版本写到 $hj.pipeline-adapter（供你手动合并事件 group）。"
    sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/hooks.json" > "$hj.pipeline-adapter"
    return 0
  fi
  sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/hooks.json" > "$hj"
  info "hooks.json → ${hj}（inject/veto/track wrapper 绝对路径已绑定）"
}

print_trust_instructions() {
  note ""
  note "${B}════════ 档 A 全保真：还差一步（一次性 trust）════════${Z}"
  note "Codex 普通用户态对自定义 hook 要求一次性人工 trust。未 trust 前 inject/veto/track 不生效。"
  note "  1. 启动 Codex TUI：${B}codex${Z}   2. 输入 ${B}/hooks${Z}   3. 对 pipeline hooks.json 按 ${B}t${Z}"
  note "改动 wrapper/hooks.json 后需重新 trust。之后 \`codex exec\` 复用 trust，三能力自动跑。"
  note "${B}══════════════════════════════════════════════════${Z}"
}

install_managed() {
  local req="/etc/codex/requirements.toml" mdir="/etc/codex/managed_hooks"
  note ""
  warn "档 B（managed/MDM 全保真）需写系统级 root 路径 ${req} 与 ${mdir}（唯一 trust-free 的 headless 路径）。"
  local staged_hooks; staged_hooks="$(mktemp "${TMPDIR:-/tmp}/codex-managed-hooks.XXXXXX.json")"
  sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/hooks.json" > "$staged_hooks"
  local staged_req; staged_req="$(mktemp "${TMPDIR:-/tmp}/codex-requirements.XXXXXX.toml")"
  printf '# pipeline-workflow codex adapter — managed hooks（档 B）\n[hooks]\nmanaged_dir = "%s"\n' "$mdir" > "$staged_req"
  if [ "$(id -u)" -ne 0 ]; then
    err "当前非 root。${B}绝不静默 sudo${Z}——请手动执行（先审阅暂存文件）："
    note "  cat $staged_req ; cat $staged_hooks"
    note "  sudo mkdir -p $mdir && sudo cp $staged_hooks $mdir/hooks.json"
    note "  sudo cp $staged_req $req   # 若已存在改为手动合并 [hooks] 段"
    install_static "$TARGET"
    return 0
  fi
  confirm "确认以 root 写入 ${req} 与 ${mdir}？" || { warn "已取消，未改动系统。"; return 0; }
  mkdir -p "$mdir"; cp "$staged_hooks" "$mdir/hooks.json"
  [ -f "$req" ] && warn "$req 已存在——请手动并 [hooks] 段。" || { cp "$staged_req" "$req"; info "requirements.toml → $req"; }
  info "managed hooks → $mdir/hooks.json（always-on、免 trust）"
  install_static "$TARGET"
}

# ════════════════ 主流程 ════════════════
note "${B}Codex pipeline 适配器安装${Z}  mode=${MODE}  target=${TARGET}"
case "$MODE" in
  static)
    install_static "$TARGET"
    info "档 C（静态降级）完成：AGENTS.md 静态层已落地，${B}未装 hooks${Z}（无自动强制，靠 Unlock sentinel）。"
    ;;
  full)
    install_static "$TARGET"; install_hooks_codex_home; print_trust_instructions
    ;;
  managed)
    install_managed
    ;;
esac
exit 0
