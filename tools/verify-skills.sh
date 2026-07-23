#!/usr/bin/env bash
# verify-skills.sh — 插件资产零悬空引用校验（CONTRACT §5.7，安装/CI 期硬失败）。
#
# 校验面：
#   1. Codex/Claude manifests、Codex marketplace、hooks/hooks.json、CLI/dashboard 发布产物与 canonical helpers 存在；
#   2. hook command 必须同时支持 Codex 的 $PLUGIN_ROOT 与 Claude 的 $CLAUDE_PLUGIN_ROOT，且目标脚本存在并可执行；
#   3. skills/ 下每个 skill 目录都含 SKILL.md；
#   4. skills/**/SKILL.md、hooks/hooks.json、templates/manifest.yaml（若有）中形如
#      `external-skill: <名字>` 的可选集成引用，必须在 skills/EXTERNAL-SKILLS.md 中说明。
#   5. templates/skill-sources.yaml 的每一项必须是 bundled，并有同名（或 content_skill 指向）的
#      SKILL.md；这防止默认 workflow 悄悄重新引入外部安装依赖。
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
CODEX_PLUGIN_JSON="$ROOT/.codex-plugin/plugin.json"
CODEX_MARKETPLACE_JSON="$ROOT/.agents/plugins/marketplace.json"
HOOKS_JSON="$ROOT/hooks/hooks.json"
CANONICAL_STATE_HELPER="$ROOT/hooks/canonical-state.sh"
PROMPT_INTENT_HELPER="$ROOT/hooks/prompt-intent.sh"
AUTO_UPDATE_HELPER="$ROOT/hooks/auto-update.sh"
CLI_BUNDLE="$ROOT/packages/cli/dist/pipeline.mjs"
DASHBOARD_SERVER_BUNDLE="$ROOT/packages/server/dist/dashboard.mjs"
DASHBOARD_WEB_INDEX="$ROOT/packages/dashboard-app/dist/index.html"

# ── 1. 清单文件本体 ──
if [ ! -f "$PLUGIN_JSON" ]; then
  add_fail "缺失插件清单 .claude-plugin/plugin.json" "CC 插件规范（插件必需）" "在 $ROOT/.claude-plugin/ 下创建 plugin.json（至少含 name/description/version）"
else
  grep -q '"name"[[:space:]]*:' "$PLUGIN_JSON" \
    || add_fail "plugin.json 缺少 name 字段" ".claude-plugin/plugin.json" "补充 \"name\": \"<插件名>\""
fi
[ -f "$CODEX_PLUGIN_JSON" ] \
  || add_fail "缺失 Codex 插件清单 .codex-plugin/plugin.json" "Codex 插件规范（原生插件必需）" "在 $ROOT/.codex-plugin/ 下创建 plugin.json，并声明 skills/hooks"
if [ -f "$CODEX_PLUGIN_JSON" ]; then
  grep -q '"name"[[:space:]]*:[[:space:]]*"pipeline-lite"' "$CODEX_PLUGIN_JSON" \
    || add_fail "Codex plugin.json 缺 pipeline-lite name" ".codex-plugin/plugin.json" "补充 name: pipeline-lite"
  grep -q '"skills"[[:space:]]*:[[:space:]]*"\./skills/"' "$CODEX_PLUGIN_JSON" \
    || add_fail "Codex plugin.json 未声明打包 skills" ".codex-plugin/plugin.json" "补充 skills: ./skills/"
  grep -q '"hooks"[[:space:]]*:[[:space:]]*"\./hooks/hooks.json"' "$CODEX_PLUGIN_JSON" \
    || add_fail "Codex plugin.json 未声明共享 hooks" ".codex-plugin/plugin.json" "补充 hooks: ./hooks/hooks.json"
fi
[ -f "$CODEX_MARKETPLACE_JSON" ] \
  || add_fail "缺失 Codex marketplace .agents/plugins/marketplace.json" "Codex marketplace 规范（远程安装必需）" "创建 marketplace.json 并登记 pipeline-lite"
if [ -f "$CODEX_MARKETPLACE_JSON" ]; then
  grep -q '"name"[[:space:]]*:[[:space:]]*"pipeline-lite"' "$CODEX_MARKETPLACE_JSON" \
    || add_fail "Codex marketplace 未登记 pipeline-lite" ".agents/plugins/marketplace.json" "补充 pipeline-lite 插件条目"
  grep -q '"path"[[:space:]]*:[[:space:]]*"\./"' "$CODEX_MARKETPLACE_JSON" \
    || add_fail "Codex marketplace 未指向插件仓根" ".agents/plugins/marketplace.json" "把 source.path 设为 ./"
fi
[ -f "$HOOKS_JSON" ] \
  || add_fail "缺失 hooks 清单 hooks/hooks.json" "CC 插件规范（本插件挂 hook 必需）" "在 $ROOT/hooks/ 下创建 hooks.json"
[ -f "$CANONICAL_STATE_HELPER" ] && [ -r "$CANONICAL_STATE_HELPER" ] \
  || add_fail "缺失或不可读 hooks/canonical-state.sh" \
              "G1 hooks canonical state 共享读取依赖" \
              "把 hooks/canonical-state.sh 纳入插件资产并保证可读；禁止靠各 hook 的 legacy YAML fallback 运行"
[ -f "$PROMPT_INTENT_HELPER" ] && [ -r "$PROMPT_INTENT_HELPER" ] \
  || add_fail "缺失或不可读 hooks/prompt-intent.sh" \
              "UserPromptSubmit 跨会话恢复意图判定依赖" \
              "把 hooks/prompt-intent.sh 纳入插件资产并保证可读；router/breadcrumb 缺它时必须 fail-closed，避免旧 change 泄漏"
[ -f "$AUTO_UPDATE_HELPER" ] && [ -x "$AUTO_UPDATE_HELPER" ] \
  || add_fail "缺失或不可执行 hooks/auto-update.sh" "原生宿主 opt-in 自动升级" "把 hooks/auto-update.sh 纳入插件资产并 chmod +x"
[ -f "$CLI_BUNDLE" ] && [ -x "$CLI_BUNDLE" ] \
  || add_fail "缺失或不可执行 packages/cli/dist/pipeline.mjs" "完整插件 CLI runtime" "运行 npm run build，并提交 packages/cli/dist/pipeline.mjs"
[ -f "$DASHBOARD_SERVER_BUNDLE" ] && [ -r "$DASHBOARD_SERVER_BUNDLE" ] \
  || add_fail "缺失 dashboard server bundle: packages/server/dist/dashboard.mjs" "完整插件 dashboard runtime" "运行 npm run build，并提交 packages/server/dist/dashboard.mjs"
[ -f "$DASHBOARD_WEB_INDEX" ] && [ -r "$DASHBOARD_WEB_INDEX" ] \
  || add_fail "缺失 dashboard SPA: packages/dashboard-app/dist/index.html" "完整插件 dashboard runtime" "运行 npm run build，并提交 packages/dashboard-app/dist/"

# index.html 是 server 同源托管的入口；仅目录存在不足以保证哈希资源也随 release 进入仓库。
if [ -f "$DASHBOARD_WEB_INDEX" ]; then
  while IFS= read -r asset; do
    [ -n "$asset" ] || continue
    case "$asset" in
      assets/*)
        [ -f "$ROOT/packages/dashboard-app/dist/$asset" ] \
          || add_fail "dashboard SPA 缺少 index.html 引用的资源: $asset" \
                      "packages/dashboard-app/dist/index.html" \
                      "重新运行 npm run build，并把 packages/dashboard-app/dist/ 整目录纳入发布"
        ;;
    esac
  done < <(grep -oE 'assets/[A-Za-z0-9._-]+' "$DASHBOARD_WEB_INDEX" 2>/dev/null | sort -u)
fi

# ── 2. 跨宿主 hook root + 引用路径：存在 + *.sh 可执行 ──
# Codex 原生 plugin hook 注入 PLUGIN_ROOT，Claude 注入 CLAUDE_PLUGIN_ROOT。两者不能二选一，
# 否则 `pipeline setup --codex` 安装虽然成功，但正常对话的 router/auto-update hook 根本不会执行。
if [ -f "$HOOKS_JSON" ]; then
  grep -Fq '${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}/hooks/' "$HOOKS_JSON" \
    || add_fail "hooks 未同时兼容 PLUGIN_ROOT/CLAUDE_PLUGIN_ROOT" "hooks/hooks.json" "所有 hook command 使用 \${PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT:-}}/hooks/<script>"
  for rel in \
    hooks/session-start.sh \
    hooks/confirm-clear-prompt.sh \
    hooks/breadcrumb.sh \
    hooks/router.sh \
    hooks/gate.sh \
    hooks/confirm-clear.sh \
    hooks/decision-recorder.sh \
    hooks/skill-tracker.sh \
    hooks/interactive-skill-gate.sh; do
    N_PATH=$((N_PATH + 1))
    p="$ROOT/$rel"
    [ -f "$p" ] && [ -x "$p" ] \
      || add_fail "缺失或不可执行 hook 脚本: $rel" "hooks/hooks.json" "把 $rel 纳入发布包并 chmod +x"
  done
fi

check_refs() { # file
  local f="$1" rel p disp
  [ -f "$f" ] || return 0
  disp="${f#"$ROOT"/}"
  # 兼容历史的直写 ${CLAUDE_PLUGIN_ROOT}/<path> 引用；共享 hooks 已在上方按跨宿主模板逐项校验。
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

# ── 5. registry 完全打包完整性（防漂移）──
#   每一个 registry token 都必须是 bundled，并且有 plugins skills/ 中的实体。可选外部命令只能
#   出现在文档说明，绝不能进入这份默认 workflow 安装清单。
# 只 grep 顶层 token 键（`^  <token>: { … }` 单行流映射），不深解析 yaml。
REGISTRY="$ROOT/templates/skill-sources.yaml"
N_REG=0
if [ -f "$REGISTRY" ]; then
  while IFS= read -r line; do
    case "$line" in
      '  '[![:space:]#]*'{'*) : ;;   # 顶层 token 行：2 空格缩进 + 非 # 键 + 单行流映射
      *) continue ;;
    esac
    tool=""
    case "$line" in
      *"tool: skills-cli"*) tool=skills-cli ;;
      *"tool: claude-plugin"*) tool=claude-plugin ;;
      *"tool: npm"*) tool=npm ;;
      *"tool: bundled"*) tool=bundled ;;
      *"tool: builtin"*) tool=builtin ;;
      *) continue ;;
    esac
    token=$(printf '%s\n' "$line" | awk '{print $1}')
    token="${token%:}"
    [ -n "$token" ] || continue
    N_REG=$((N_REG + 1))
    if [ "$tool" != bundled ]; then
      add_fail "default registry 包含非 bundled token: ${token}（tool=${tool}）" \
        "templates/skill-sources.yaml" \
        "把该能力实现为 skills/<name>/SKILL.md 并登记 tool: bundled；默认 pipeline 不允许外部安装依赖"
      continue
    fi
    physical="$(printf '%s\n' "$line" | sed -n 's/.*content_skill:[[:space:]]*\([^,}[:space:]]*\).*/\1/p')"
    [ -n "$physical" ] || physical="$token"
    if [ ! -f "$ROOT/skills/$physical/SKILL.md" ]; then
      add_fail "bundled registry token 缺实体 SKILL.md: ${token} → ${physical}" \
        "templates/skill-sources.yaml" \
        "创建 skills/${physical}/SKILL.md，或把 content_skill 改为已有 first-party skill"
    fi
  done < "$REGISTRY"
fi

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

[ "$QUIET" = 1 ] || printf '[verify-skills] OK — 路径引用 %d 项 / skill 目录 %d 个 / 外部依赖引用 %d 项 / registry 可安装 token %d 项 全部通过（root: %s）\n' "$N_PATH" "$N_SKILL" "$N_EXT" "$N_REG" "$ROOT"
exit 0
