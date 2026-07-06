#!/usr/bin/env bash
# verify-skills.sh — 插件资产零悬空引用校验（CONTRACT §5.7，安装/CI 期硬失败）。
#
# 校验面：
#   1. .claude-plugin/plugin.json 与 hooks/hooks.json 存在，plugin.json 含 name 字段；
#   2. 两清单中所有 ${CLAUDE_PLUGIN_ROOT}/<path> 引用：路径存在；*.sh 还须可执行；
#   3. skills/ 下每个 skill 目录都含 SKILL.md；
#   4. skills/**/SKILL.md、hooks/hooks.json、templates/manifest.yaml（若有）中形如
#      `external-skill: <名字>` 的外部 skill 引用，必须在 skills/EXTERNAL-SKILLS.md 中
#      以 `- <名字>` 显式声明。
# 任何缺失 → exit 1，逐条列出「缺什么 / 在哪引用的 / 怎么修」。
#
# 用法：verify-skills.sh [--quiet] [--root <plugin根>]
#   --quiet  成功时零输出（SessionStart hook 用）；失败输出照常（stderr）
#   --root   指定插件根（默认：本脚本所在 tools/ 的上级）；测试用它指向 sandbox
#
# 纯 bash + POSIX 工具（grep/sed/sort/find/stat）——SessionStart 会调本脚本，保持零解释器。
set -uo pipefail

QUIET=0
ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --quiet) QUIET=1 ;;
    --root)
      shift
      [ $# -gt 0 ] || { echo "verify-skills: --root 需要参数" >&2; exit 2; }
      ROOT="$1"
      ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "verify-skills: 未知参数 ${1}（支持 --quiet / --root <dir>）" >&2; exit 2 ;;
  esac
  shift
done
[ -z "$ROOT" ] && ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$ROOT" ] || { echo "verify-skills: 插件根不存在: $ROOT" >&2; exit 2; }

# ── 失败收集（bash 3.2 兼容：普通数组 + 下标循环，避免 set -u 下空数组展开）──
FAIL_WHAT=()
FAIL_WHERE=()
FAIL_FIX=()
add_fail() { # what where fix
  FAIL_WHAT[${#FAIL_WHAT[@]}]="$1"
  FAIL_WHERE[${#FAIL_WHERE[@]}]="$2"
  FAIL_FIX[${#FAIL_FIX[@]}]="$3"
}

N_PATH=0
N_SKILL=0
N_EXT=0

PLUGIN_JSON="$ROOT/.claude-plugin/plugin.json"
HOOKS_JSON="$ROOT/hooks/hooks.json"

# ── 1. 清单文件本体 ──
if [ ! -f "$PLUGIN_JSON" ]; then
  add_fail "缺失插件清单 .claude-plugin/plugin.json" "CC 插件规范（插件必需）" "在 $ROOT/.claude-plugin/ 下创建 plugin.json（至少含 name/description/version）"
else
  grep -q '"name"[[:space:]]*:' "$PLUGIN_JSON" \
    || add_fail "plugin.json 缺少 name 字段" ".claude-plugin/plugin.json" "补充 \"name\": \"<插件名>\""
fi
[ -f "$HOOKS_JSON" ] \
  || add_fail "缺失 hooks 清单 hooks/hooks.json" "CC 插件规范（本插件挂 hook 必需）" "在 $ROOT/hooks/ 下创建 hooks.json"

# ── 2. ${CLAUDE_PLUGIN_ROOT}/<path> 引用：存在 + *.sh 可执行 ──
check_refs() { # file
  local f="$1" rel p disp
  [ -f "$f" ] || return 0
  disp="${f#"$ROOT"/}"
  # 提取 CLAUDE_PLUGIN_ROOT}/ 后到引号/反斜杠（JSON 转义 \" 的前半）/空白为止的相对路径
  for rel in $(grep -o 'CLAUDE_PLUGIN_ROOT}/[^"[:space:]\\]*' "$f" 2>/dev/null | sed 's|^CLAUDE_PLUGIN_ROOT}/||' | sort -u); do
    N_PATH=$((N_PATH + 1))
    p="$ROOT/$rel"
    if [ ! -e "$p" ]; then
      add_fail "缺失路径: $rel" "$disp" "创建 ${rel}，或修正 $disp 中的该引用"
      continue
    fi
    case "$rel" in
      *.sh)
        [ -x "$p" ] || add_fail "脚本不可执行: $rel" "$disp" "chmod +x $p"
        ;;
    esac
  done
}
check_refs "$PLUGIN_JSON"
check_refs "$HOOKS_JSON"

# ── 3. skills/ 下每个 skill 目录含 SKILL.md ──
if [ -d "$ROOT/skills" ]; then
  for d in "$ROOT"/skills/*/; do
    [ -d "$d" ] || continue
    N_SKILL=$((N_SKILL + 1))
    [ -f "${d}SKILL.md" ] \
      || add_fail "skill 目录缺少 SKILL.md: ${d#"$ROOT"/}" "skills/ 目录约定（每个 skill 目录必须含 SKILL.md）" "在 ${d#"$ROOT"/} 下创建 SKILL.md，或删除该空目录"
  done
fi

# ── 4. 外部 skill 引用必须在 skills/EXTERNAL-SKILLS.md 声明 ──
EXT_MANIFEST="$ROOT/skills/EXTERNAL-SKILLS.md"
check_ext() { # name where
  local name="$1" where="$2"
  N_EXT=$((N_EXT + 1))
  if [ ! -f "$EXT_MANIFEST" ]; then
    add_fail "外部 skill 未声明: ${name}（显式清单 EXTERNAL-SKILLS.md 不存在）" "$where" "创建 skills/EXTERNAL-SKILLS.md 并添加行: - $name"
  elif ! grep -Fq -- "- $name" "$EXT_MANIFEST"; then
    add_fail "外部 skill 未声明: $name" "$where" "在 skills/EXTERNAL-SKILLS.md 的「已声明依赖」中添加行: - $name"
  fi
}
scan_ext() { # file
  local f="$1" name
  [ -f "$f" ] || return 0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    check_ext "$name" "${f#"$ROOT"/}"
  done < <(grep -o 'external-skill:[[:space:]]*[^[:space:]]*' "$f" 2>/dev/null | sed 's/^external-skill:[[:space:]]*//' | sort -u)
}
if [ -d "$ROOT/skills" ]; then
  while IFS= read -r sk; do
    scan_ext "$sk"
  done < <(find "$ROOT/skills" -name 'SKILL.md' -type f 2>/dev/null | sort)
fi
scan_ext "$HOOKS_JSON"
scan_ext "$ROOT/templates/manifest.yaml"

# ── 汇总 ──
NFAIL=${#FAIL_WHAT[@]}
if [ "$NFAIL" -gt 0 ]; then
  {
    printf '[verify-skills] FAIL — 发现 %d 处悬空引用/缺失（root: %s）：\n' "$NFAIL" "$ROOT"
    i=0
    while [ "$i" -lt "$NFAIL" ]; do
      printf '  %d) 缺什么: %s\n' "$((i + 1))" "${FAIL_WHAT[$i]}"
      printf '     在哪引用: %s\n' "${FAIL_WHERE[$i]}"
      printf '     怎么修: %s\n' "${FAIL_FIX[$i]}"
      i=$((i + 1))
    done
    printf '修复后复跑: bash %s\n' "$0"
  } >&2
  exit 1
fi

[ "$QUIET" = 1 ] || printf '[verify-skills] OK — 路径引用 %d 项 / skill 目录 %d 个 / 外部依赖引用 %d 项 全部通过（root: %s）\n' "$N_PATH" "$N_SKILL" "$N_EXT" "$ROOT"
exit 0
