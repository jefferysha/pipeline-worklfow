#!/usr/bin/env bash
# adapters/lint-adapter.sh — 平台填表完整性机器校验（BACKLOG #39，对标老仓 lint-adapter.sh）。
#
# 把 contract.md §4 的散文 checklist 升级为机器约束：加平台是**填表**（registry.yaml 一行 +
# configure 脚本），本 lint 抓「填漏了字段」。GOAL D7/D14 平台矩阵策略面的守门。
#
# 校验（缺任一非零）：
#   ① registry platforms 块必填字段非空：tier / configDir / cliFlag / agentCapable / hasHooks
#      + 三能力 status（inject_status / veto_status / track_status）
#   ② tier ∈ {A,B,C}；<cap>_status ∈ {native,degraded,none}
#   ③ configure 脚本存在（baseline claude-code 内建插件、configure 空 → 豁免）
#   ④ hasHooks=true → hookContainer 非空
#   ⑤ <cap>_status=degraded → <cap>_fallback 非空（不许声明降级却不给落点）
#
# 自足：不依赖老仓 resolve-placeholders.sh 等引擎，内嵌 registry 扁平读取。
# 用法: adapters/lint-adapter.sh <platform-id> | --all
set -u

ADAPTERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$ADAPTERS_DIR/.." && pwd)"
REG="${PIPELINE_REGISTRY:-$ADAPTERS_DIR/registry.yaml}"
R='\033[31m'; G='\033[32m'; Z='\033[0m'

# platforms: 块内平台 id 列举（止于下一顶层 key，避免混入 planned:）
platform_ids() {
  awk '
    /^platforms:[[:space:]]*$/ { inp=1; next }
    /^[A-Za-z_].*:[[:space:]]*$/ { if(inp) inp=0 }
    inp && /^  - id: / { sub(/^  - id:[[:space:]]*/,""); print }
  ' "$REG"
}

# 平台块内扁平字段读取（4 空格缩进 key: value；剥一层引号）；块止于下一 `  - id:`
reg_field() { # <id> <key>
  awk -v id="$1" -v key="$2" '
    $0 ~ "^  - id: " id "[[:space:]]*$" { inb=1; next }
    /^  - id: / { inb=0 }
    inb && $0 ~ ("^    " key ":") {
      line=$0; sub(/^    [A-Za-z_]+:[ ]*/,"",line);
      gsub(/^"/,"",line); gsub(/"$/,"",line);
      gsub(/^'\''/,"",line); gsub(/'\''$/,"",line);
      print line; exit
    }
  ' "$REG"
}

REQUIRED="tier configDir cliFlag agentCapable hasHooks inject_status veto_status track_status"

lint_one() { # <id> → 0 全绿 / 非零 缺项数
  local pid="$1" miss=0 f v
  # ① 必填非空
  for f in $REQUIRED; do
    v="$(reg_field "$pid" "$f")"
    [ -n "$v" ] || { printf "${R}[FAIL] %s 缺字段 %s${Z}\n" "$pid" "$f" >&2; miss=$((miss+1)); }
  done
  # ② tier 枚举
  v="$(reg_field "$pid" tier)"
  case "$v" in A|B|C|"") ;; *) printf "${R}[FAIL] %s tier 非法: %s（须 A/B/C）${Z}\n" "$pid" "$v" >&2; miss=$((miss+1)) ;; esac
  # ② <cap>_status 枚举 + ⑤ degraded 须 fallback
  local cap
  for cap in inject veto track; do
    v="$(reg_field "$pid" "${cap}_status")"
    case "$v" in
      native|none|"") ;;
      degraded)
        [ -n "$(reg_field "$pid" "${cap}_fallback")" ] \
          || { printf "${R}[FAIL] %s %s_status=degraded 但 %s_fallback 空${Z}\n" "$pid" "$cap" "$cap" >&2; miss=$((miss+1)); } ;;
      *) printf "${R}[FAIL] %s %s_status 非法: %s${Z}\n" "$pid" "$cap" "$v" >&2; miss=$((miss+1)) ;;
    esac
  done
  # ③ configure 脚本存在（claude-code baseline 豁免）
  local conf; conf="$(reg_field "$pid" configure)"
  if [ "$pid" != claude-code ]; then
    if [ -z "$conf" ]; then
      printf "${R}[FAIL] %s configure 空（非 baseline 必填）${Z}\n" "$pid" >&2; miss=$((miss+1))
    elif [ ! -f "$REPO_ROOT/$conf" ]; then
      printf "${R}[FAIL] %s configure 脚本不存在: %s${Z}\n" "$pid" "$conf" >&2; miss=$((miss+1))
    fi
  fi
  # ④ hasHooks=true → hookContainer 非空
  if [ "$(reg_field "$pid" hasHooks)" = "true" ]; then
    [ -n "$(reg_field "$pid" hookContainer)" ] \
      || { printf "${R}[FAIL] %s hasHooks=true 但 hookContainer 空${Z}\n" "$pid" >&2; miss=$((miss+1)); }
  fi
  if [ "$miss" -eq 0 ]; then printf "${G}[OK] %s 填表完整${Z}\n" "$pid"; return 0; fi
  return "$miss"
}

main() {
  local arg="${1:-}"
  if [ "$arg" = "--all" ] || [ -z "$arg" ]; then
    local pid rc=0
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      lint_one "$pid" || rc=1
    done < <(platform_ids)
    exit "$rc"
  fi
  lint_one "$arg" || exit 1
}
main "$@"
