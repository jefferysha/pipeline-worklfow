#!/usr/bin/env bash
# adapters/gemini/install.sh — 安装 Gemini CLI pipeline 适配器（lite，档 A 全保真）。
#
# 投影产物：
#   <GEMINI_HOME>/settings.json#hooks   三能力 hook（inject/veto/track，__ADAPTER_DIR__ 定死绝对路径，
#                                       wrapper 从仓库跑，自定位 lite baseline hooks/*.sh）
# Gemini CLI hook 与 CC 同构（settings.json#hooks）——三 wrapper 薄包 baseline，无 trust 机制、落盘即生效。
#
# 选项：--target <dir>（默认 $PWD，仅用于提示定位）/ --gemini-home <dir>（默认 ${GEMINI_HOME:-$TARGET/.gemini}）
#       / --no-hooks（跳过 hook 安装，降级）/ --yes / -h
set -uo pipefail

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

G='\033[32m'; Y='\033[33m'; R='\033[31m'; B='\033[1m'; Z='\033[0m'
info() { printf "${G}[gemini]${Z} %b\n" "$1"; }
warn() { printf "${Y}[gemini]${Z} %b\n" "$1"; }
err()  { printf "${R}[gemini]${Z} %b\n" "$1" >&2; }
note() { printf "%b\n" "$1"; }

TARGET="$PWD"
GEMINI_HOME_DIR=""
WITH_HOOKS=1
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)      TARGET="${2:?--target 需要目录}"; shift 2 ;;
    --gemini-home) GEMINI_HOME_DIR="${2:?--gemini-home 需要目录}"; shift 2 ;;
    --no-hooks)    WITH_HOOKS=0; shift ;;
    --yes|-y)      ASSUME_YES=1; shift ;;
    -h|--help)     sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) err "未知参数: $1（见 --help）"; exit 2 ;;
  esac
done
[ -n "$GEMINI_HOME_DIR" ] || GEMINI_HOME_DIR="${GEMINI_HOME:-$TARGET/.gemini}"

# ── settings.json#hooks 投递（占位替换为绝对适配器路径；已存在则不覆盖，写 .pipeline-adapter 供合并）──
install_hooks_settings() {
  mkdir -p "$GEMINI_HOME_DIR" || { err "无法创建 GEMINI_HOME: $GEMINI_HOME_DIR"; exit 1; }
  local sj="$GEMINI_HOME_DIR/settings.json"
  if [ -f "$sj" ]; then
    warn "$sj 已存在——不自动覆盖你既有 settings。"
    warn "已替换占位的版本写到 $sj.pipeline-adapter（供你手动合并 hooks 段）。"
    sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/settings.json" > "$sj.pipeline-adapter"
    return 0
  fi
  sed "s#__ADAPTER_DIR__#$ADAPTER_DIR#g" "$ADAPTER_DIR/settings.json" > "$sj"
  info "settings.json#hooks → ${sj}（inject/veto/track wrapper 绝对路径已绑定）"
}

note "${B}Gemini CLI pipeline 适配器安装${Z}  target=${TARGET}  gemini-home=${GEMINI_HOME_DIR}"
if [ "$WITH_HOOKS" = 1 ]; then
  install_hooks_settings
  info "档 A 全保真完成：三能力全 native（settings.json#hooks，无 trust，落盘即生效）。"
else
  warn "--no-hooks：跳过 hook 安装（无自动强制；靠手动 Unlock sentinel \`rm .pipeline-pending-<kind>\`）。"
fi
exit 0
