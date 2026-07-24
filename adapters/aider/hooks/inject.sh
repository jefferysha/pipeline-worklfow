#!/usr/bin/env bash
# adapters/aider/hooks/inject.sh — aider inject 内容生成器（档 B，"native" 判据见 README）。
#
# aider 没有「运行命令并把 stdout 注入本轮上下文」的动态 SessionStart 钩子（spike 实证：aider 仅有
# .aider.conf.yml 的 read: 静态只读文件原语，aider 每次进程启动都会重新读盘该文件——非缓存)。本脚本
# 承担「刷新 read: 目标文件内容」的职责：透传 lite baseline hooks/session-start.sh 的 stdout（宪法 +
# 活跃 change 上下文），由 install.sh / 重跑本 adapter 写入目标文件——只要在下次 aider 启动前刷新过，
# 效果等价 SessionStart 的新鲜上下文（比 cursor 类"完全无会话注入原语"更强，故归类 native）。
#
# 输出**纯文本**（非 JSON——aider read: 文件是纯 markdown 直接读入上下文，不走 hookSpecificOutput 包装；
# contract §3「不同工具不同格式，不串格式」）。
# fail-safe：找不到 baseline injector → 静默空输出（不产出伪上下文）。
# 用法：bash inject.sh [SessionStart] <<< '{"cwd":"..."}'（事件名参数保留位，供 conformance 统一调用）
set -uo pipefail

EVENT="${1:-SessionStart}"
if [ -n "${2:-}" ]; then
  INPUT="$2"
elif [ -t 0 ]; then
  INPUT='{}'   # stdin 是终端（人工交互场景）——不阻塞等待输入
else
  INPUT="$(cat 2>/dev/null || printf '{}')"
fi
[ -z "$INPUT" ] && INPUT='{}'
: "$EVENT"  # 保留事件名参数位（与其余适配器 wrapper 签名一致），本脚本行为不依赖具体事件名

_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$_ROOT" ] || [ ! -d "$_ROOT/hooks" ]; then
  _ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." 2>/dev/null && pwd || printf '%s' "$HOME/.claude")"
fi
export CLAUDE_PLUGIN_ROOT="$_ROOT"

CC_INJECTOR="${PIPELINE_CC_INJECTOR:-$_ROOT/hooks/session-start.sh}"
[ -f "$CC_INJECTOR" ] || exit 0

printf '%s' "$INPUT" | PIPELINE_SESSION_START_FORMAT=plain bash "$CC_INJECTOR" 2>/dev/null || true
exit 0
