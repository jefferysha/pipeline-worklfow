#!/usr/bin/env bash
# breadcrumb.sh — UserPromptSubmit 薄 shim：每轮重提当前 phase 面包屑，对抗长会话漂移。
#
# 缓存由 CLI 在 transition 时写 openspec/changes/<name>/.breadcrumb（CONTRACT §5.4）；
# 本 shim 只做文件存在性检查 + cat mtime 最新的一个，无缓存则静默 exit 0。
# 阶段×hook 开关（v5 T5 / 决议#2）：.pipeline/hooks.json 关掉当前阶段的 breadcrumb → 静默退出。
# 纯 bash 热路径：不 spawn 任何解释器/外部 JSON 解析器。
# fail-open：stdin 解析失败 → 回退 $PWD；任何异常 → 静默 exit 0。
set -uo pipefail

INPUT="$(cat 2>/dev/null || printf '{}')"

# 从 $INPUT 提取顶层字符串键（同 gate.sh，保持各 shim 自包含、免 source）
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

CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] || exit 0

# 上溯至多 5 层找 openspec/changes（与 gate.sh 的 marker 上溯对称）；PROOT=项目根（开关判定用）
CHANGES="" PROOT=""
d="$CWD"
for i in 1 2 3 4 5; do
  if [ -d "$d/openspec/changes" ]; then CHANGES="$d/openspec/changes"; PROOT="$d"; break; fi
  [ "$d" = "/" ] && break
  d="$(dirname "$d")"
done
[ -n "$CHANGES" ] || exit 0

# yget：读 .pipeline.yaml 单个顶层 key（同 gate.sh/router.sh，保持各 shim 自包含、免 source）
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

# 阶段×hook 开关（v5 T5 / 决议#2）：读 <项目根>/.pipeline/hooks.json（server 写端点落盘，
# canonical 一键一行 `"<hook>.<阶段>": false`，只存禁用项，见 packages/server/src/hooksConfig.ts）。
# 纯 bash 热路径（CONTRACT §5.4：零解释器/外部 JSON 解析器 spawn）：grep -F 定长匹配即可判定；缺文件/缺键/
# 手改格式漂移/损坏 JSON → 一律 fail-open 到启用（行为与本配置诞生之前完全一致）。
# gate.sh 交互门与 interactive-skill-gate.sh 安全门强制常开：不读本配置（server 写端点也拒绝这两个 id）。
hook_disabled() { # $1=项目根 $2=hook id $3=阶段 → 0=该阶段已禁用
  [ -n "$1" ] && [ -n "$3" ] || return 1
  grep -Fq "\"$2.$3\": false" "$1/.pipeline/hooks.json" 2>/dev/null
}

# 多 change 并存时取 mtime 最新的 .breadcrumb（治「取 glob 第一个」的字母序错绑）
newest=""
newest_mt=-1
for f in "$CHANGES"/*/.breadcrumb; do
  [ -f "$f" ] || continue
  # GNU `stat -f` 是文件系统状态模式（非 mtime），在 Linux 上会"成功"吐非数字，兜底永不触发
  # ——先试 GNU 语法（-c）+ 数字校验，而非只靠退出码判断。
  mt="$(stat -c %Y "$f" 2>/dev/null)"
  case "$mt" in ''|*[!0-9]*) mt="$(stat -f %m "$f" 2>/dev/null)" ;; esac
  case "$mt" in ''|*[!0-9]*) mt=0 ;; esac
  if [ "$mt" -gt "$newest_mt" ]; then
    newest_mt="$mt"
    newest="$f"
  fi
done

[ -n "$newest" ] || exit 0

# ── 阶段×hook 开关（v5 T5 / 决议#2）：newest 所属 change 的阶段被配置禁用 → 静默退出 ──
hook_disabled "$PROOT" breadcrumb "$(yget "$(dirname "$newest")/.pipeline.yaml" phase)" && exit 0

cat "$newest" 2>/dev/null
exit 0
