#!/usr/bin/env bash
# interactive-skill-gate.sh — PostToolUse hook（matcher: Skill）。
#
# 让「交互式 skill」加载后强制守 L2.6 交互硬姿态：任何 gap / 分支 / 模糊点一律转成
# AskUserQuestion 问用户、批量问、迭代到清零，禁止自行假设糊弄。
#
# 机制（为什么 PostToolUse 而非 PreToolUse-block，对齐老仓 interactive-skill-gate.sh）：
#   交互式 skill 的「该问哪些问题 / 有哪些分支」写在 skill 内容里，必须先让它正常加载模型才知道要问什么。
#   故这里*不* block 加载，而是 skill 一加载完就双保险：
#     ① 软提醒：把 L2.6 硬姿态当 additionalContext 注入（non-blocking）——每轮重提，治长会话漂移。
#     ② 硬门：落 .pipeline-pending-interaction marker（gate.sh 在后续写类工具/AskUserQuestion 前物理挡住），
#        由 confirm-clear（AskUserQuestion 后）解封——形成「先问用户才放行」闭环。
#
# 中心清单（单一真相源）：lite manifest（templates/manifest.yaml，kernel-flow 所有）尚无
#   interactive_skills 字段且本 hook 无权改它，故清单内联在此（老仓原清单：manifest.yaml
#   interactive_skills: [brainstorming, grill-with-docs, prototype, huashu-design]）。新增交互式
#   skill 只改下面一处。plugin 前缀（superpowers: 等）自动剥离比对，裸名也命中。
#
# 纯 bash 热路径（CONTRACT §5.4：PostToolUse 每次工具后触发）：零解释器 / 外部 JSON 解析器 spawn。
# fail-safe：非 Skill / 不在清单 / 解析异常 → 一律 exit 0 放行，绝不打断。
set -uo pipefail

# === 中心清单（内联单一真相源；空格分隔）===
INTERACTIVE_SKILLS="brainstorming grill-with-docs prototype huashu-design"

INPUT="$(cat 2>/dev/null || printf '{}')"

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

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

TOOL="$(json_get tool_name || true)"
[ "$TOOL" = "Skill" ] || exit 0

SKILL="$(json_get skill || true)"
[ -z "$SKILL" ] && exit 0

# plugin 前缀（superpowers:brainstorming）→ 取冒号后末段比对；裸名也命中
SKILL_BASE="${SKILL##*:}"
MATCH=0
for s in $INTERACTIVE_SKILLS; do
  if [ "$SKILL_BASE" = "$s" ] || [ "$SKILL" = "$s" ]; then MATCH=1; break; fi
done
[ "$MATCH" -eq 1 ] || exit 0

# === 硬门：落 .pipeline-pending-interaction（供 gate.sh 在 AskUserQuestion / 写类工具前挡产出）===
CWD="$(json_get cwd || true)"
[ -z "$CWD" ] && CWD="$PWD"
[ -d "$CWD" ] && printf '%s\n' "$SKILL" > "$CWD/.pipeline-pending-interaction" 2>/dev/null || true

# === 软提醒：注入 L2.6 交互硬姿态（additionalContext，non-blocking）===
CTX="$(cat <<EOF
【交互式 skill 硬姿态 · L2.6 · 由 interactive-skill-gate 注入】
你刚加载了交互式 skill「${SKILL}」。在产出任何东西、做任何分支/方案选择前，必须守住：
1. 任何分歧 / 分支选择 / gap / 模糊点 → 一律转成问题，用 AskUserQuestion 问用户，禁止自行假设糊弄（推荐答案放第一项标「(推荐)」+ 真实备选，别埋进散文求盖章）。
2. 当前能看到的 gap 一次性批量问（一次 ≤4 问，多了连发几轮）；用户答完重扫一遍，还有没清的（含答案引出的新 gap）就再来一轮——gap 清零才算这一步完成。别问 2 个就收、别挤牙膏。
3. 上游标「需立即澄清 / 高风险」的决断必须当场逼出明确答案，不许「都要 / 先这样 / 双边」糊弄收场。
4. 只有用户确实不在场、无法回答时，才退回按周边代码/上下文推断，并把所做假设写在产出顶部显式标注。
（本提醒对内联清单内所有交互式 skill 统一生效；交互后用 AskUserQuestion 即由 confirm-clear 解封 interaction 门。）
EOF
)"

printf '{"additionalContext":"%s"}\n' "$(json_escape "$CTX")"
exit 0
