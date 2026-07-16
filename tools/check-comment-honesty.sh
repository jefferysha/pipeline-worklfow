#!/usr/bin/env bash
# check-comment-honesty.sh —— 注释可信度门禁（防「假待做注释」复发）。
#
# ── 为什么存在 ──────────────────────────────────────────────────────────────
# W0 清账（commit d34b5f7）实测：本仓 21 条「待做/TODO」类注释里 **17 条是假的**——
# 事情早就实现了，注释还在说「以后要做」。后果不是脏，是**误导**：注释被当作事实读，
# 导致架构规划全盘误判（照着假注释去「补」早已存在的功能）。
# 注释腐烂是单向的：代码会被改，描述未来的注释不会跟着改，只会越来越假。
#
# ── 纪律 ────────────────────────────────────────────────────────────────────
# 注释只描述「**现在是什么**、**为什么这样**」，不描述「**以后要做什么**」。
#   ✗ // TODO: 以后接上 claude adapter
#   ✓ // 只识别 echo；claude/codex 的进程协议由调用方注入 resolveAdapter（本模块不内置）
# 真实缺口（gap）不写进注释，写成**当前限制测试**：测试断言「缺口存在」，
# 谁实现了功能谁就会看到测试变红，被迫删掉旧断言——假描述在物理上无法存活。
# 计划/待办属于 issue、spec、BACKLOG，不属于源码注释。
#
# ── 校验面 ──────────────────────────────────────────────────────────────────
#   1. 注释诚实：hooks/ packages/ tools/ 下不得出现「未来式」注释（见 PATTERN_*）。
#      **含 *.test.***（旧版整类豁免测试文件，是最大的盲区：实测 6 条真债务只藏在测试里）。
#      dist/、node_modules/ 不扫。
#   2. 结构反漂移：transition.ts 不得引用 buildHandoff（gap #3 的绊线，理由见 section 2）。
#   3. 扫描器完整性：阳性对照 + grep 退出码三态区分（防「扫描失败 → 零命中 → 假绿」）。
# 任何命中 → exit 1，逐条列出「哪一条 / 在哪 / 怎么修」。扫描器本身故障 → exit 3（不是 0）。
#
# 用法：check-comment-honesty.sh [--quiet]
#   --quiet  成功时零输出（CI 用）；失败输出照常（stderr）
#
# ── 为什么用 grep 而不是 ripgrep ────────────────────────────────────────────
# 本仓既没有 vendored ripgrep，package.json 也没把它列为依赖：宿主机上是否有 rg 是**环境属性**，
# 不是仓库契约。把「某台机器上 rg 恰好可用」当门禁前提，换台机器/进 CI 即挂——那正是本门禁
# 要防的「看着通过、其实没跑」。
#   （反面教材：本文件旧版曾断言「本机 bash 找不到 rg」。那是**环境相关的观测**，写成普适事实
#    就是失真：换台装了 rg 的机器它立刻变假。门禁脚本自己写失真陈述 = 自打耳光。）
# 且 rg 与 grep **语义不等价**，不是可互换实现：
#   · rg 默认遵守 .gitignore、跳过隐藏文件；grep 不遵守 → **grep 版扫描面更宽**。
#   · 故本文件的豁免/基线条数只对 grep 语义成立，换 rg 需重新校准，不能假设两者结果相同。
# 所用扩展（-r/-I/-E/--exclude-dir/\b）是 **BSD/GNU 通用扩展，不是 POSIX**
# （POSIX grep 仅有 -E -F -c -i -l -n -q -s -v -x -e -f）。实测过的实现**只有两个**：
#   · BSD grep 2.6.0-FreeBSD（macOS 开发机，`bash -c` 解析到的 /usr/bin/grep）
#   · GNU grep 3.11（`docker run ubuntu:24.04`，= CI runner 的 grep）
#   两者对本文件的 PATTERN 结果一致。**没测过** busybox/ugrep 等其它实现，故不作任何声称。
#
# ── locale 铁律：中文一律用字面量，绝不放进方括号 ────────────────────────────
# 本门禁在开发机绿、在 CI 红过一次，根因值得写死在这儿：
#   CI runner 的 LANG/LC_ALL **是 unset（= C/POSIX locale）**，而开发机是 UTF-8 locale。
#   C locale 下 grep 按**字节**解释方括号：`后续[:：]` 里的「：」(EF BC 9A) 会被拆成
#   {EF, BC, 9A} 三个字节塞进字符集 → `后续（`（（= EF BC 88）的首字节 EF 命中该集合 →
#   **误报**。同理 `[^等]`、`.{0,8}` 的窗口宽度也随 locale 在「字节/字符」之间漂移。
# 故：多字节字符只许出现在**字面量**里（`后续:|后续：` 这样交替），方括号内只许 ASCII
# （`[[:space:]]`、`[A-Za-z0-9#]`）。这样字节序列精确匹配，任何 locale 下结果都相同。
# 已在 C / C.UTF-8 两种 locale × BSD/GNU 两种实现下实测同结果。
set -uo pipefail

QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --quiet) QUIET=1 ;;
    -h|--help)
      sed -n '2,52p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "check-comment-honesty: 未知参数 ${1}（支持 --quiet）" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || { echo "check-comment-honesty: 无法进入仓根: $ROOT" >&2; exit 2; }

WORK="$(mktemp -d)" || { echo "check-comment-honesty: mktemp 失败" >&2; exit 3; }
trap 'rm -rf "$WORK"' EXIT

# ── 扫描器三态封装 ──────────────────────────────────────────────────────────
# grep 的退出码约定：**0=有命中 / 1=无命中 / 2+=真错误**（坏正则、参数不支持、读取失败、
# 二进制损坏…）。旧版对主扫描与 transition 扫描都写了无差别 `2>/dev/null || true`，把 2+ 一并
# 当成「零命中」——实测把 grep 换成恒返回 2 的函数后，旧版**照样打印「通过」并 exit 0**。
# 那是本门禁最严重的失效模式：门禁坏了却报绿，比没有门禁更糟（它还提供虚假保证）。
# 故此处严格区分：rc<=1 正常；rc>=2 立即 exit 3 并把 grep 的 stderr 原样吐出。
# 注意：本函数**不能**在 $( ) 里调用——命令替换是子 shell，exit 只会杀掉子 shell 而非脚本。
# 故约定把命中写进文件（$1），由调用方读文件。
scan() { # $1=命中输出文件 ; 其余=grep 参数
  local out="$1"; shift
  local rc
  grep "$@" >"$out" 2>"$WORK/grep.err"
  rc=$?
  if [ "$rc" -ge 2 ]; then
    {
      printf 'check-comment-honesty: 扫描器故障（grep rc=%d）——拒绝把「扫描失败」当「零命中」。\n' "$rc"
      printf '  参数: %s\n' "$*"
      printf '  grep stderr: '
      cat "$WORK/grep.err"
      printf '门禁未能完成扫描，结论未知 → 按失败处理（exit 3）。\n'
    } >&2
    exit 3
  fi
  return 0
}

# ═══ section 1：注释诚实扫描 ════════════════════════════════════════════════
# 词表分两类，**刻意不收裸「后续」「未来」**——见下方「为什么不收」。
#
# ① 标记类：无歧义的欠债标记。
#    · 大写 TODO/FIXME/XXX/HACK 用 \b 词边界（避免 TODOS、myTODO 之类误伤）。
#    · 小写 todo/fixme **锚定在注释前缀之后**（`// todo`、`# todo`、`* todo`）。
#      理由：本仓小写 `todo` 是**状态枚举值**（`type CellState = 'done'|'current'|'todo'`，
#      ProjectsView/TaskDetail/AfkView 共 17 处），全是合法数据、零债务。无差别大小写不敏感
#      匹配会一次性造出 17 条噪音——**噪音会让门禁被绕过/关掉，那正是本门禁要防的病**。
#      锚定注释前缀后，`// todo: x` 照抓，枚举值/对象键 `todo:` 不误伤。
#
#    ⚠ **中文一律用字面量，绝不放进方括号**（`[:：]`、`[^等]` 这类）——见文件头「locale 铁律」。
PATTERN_MARK='\b(TODO|FIXME|XXX|HACK)\b|(//|/\*|^[[:space:]]*\*|#)[[:space:]]*([Tt][Oo][Dd][Oo]|[Ff][Ii][Xx][Mm][Ee])\b|待做|待实现|待接线|待完成|待补|见报告接线清单'
#
# ② 未来式谓语类：中文里「预告将来要做某事」的**短语**。
#    为什么不收裸「后续」「未来」「待办」（codex review 点名要收，实测**不能收**）：
#      · 「后续」全仓 34 处，绝大多数是**时序副词**而非欠债——「避免影响本文件后续」
#        「后续 render 里新建的」「后续调用者会当它是活锁」。这些描述的是**现在的代码顺序**。
#      · 「未来」全仓 15 处，**15/15 都是防御性理由**——「以防未来回归」「允许 manifest 未来加节
#        而不破 kernel」「哪怕未来新增调用方遗漏校验」。它们解释的是**当下代码为何这样写**，
#        正是本纪律鼓励的「为什么这样」型注释。收了它们等于惩罚好注释。
#      · 「待办」是本仓的**领域名词**（compress 抽取的关键词、inbox 的待办项），收它要额外豁免
#        3 个文件——而「待做/待实现/TODO」已覆盖同一标记语义，收益为零、腐烂成本为正。
#    结论：收**谓语短语**（留给后续 / 后续实现 / 待 X 后续 / 后续: X …），不收裸副词。
#    这样既抓全了 codex 点名的三处真债务（manifest.ts / opencode.ts / tap index.ts），又零噪音。
#    「待 X 后续」（待 A1 后续 / 待 M3 后续）中间段刻意限定成 **ASCII 单号**而非 `.{0,8}`：
#    `.` 在 C locale 按字节、UTF-8 locale 按字符，窗口宽度会随 locale 漂移（见「locale 铁律」）。
PATTERN_FUT='留给后续|留后续|后续实现|后续轮迁|后续期次|后续:|后续：|待消费|待[[:space:]]*[A-Za-z0-9#]{1,6}[[:space:]]*后续|以后|未来再|留给未来|稍后再'
PATTERN="${PATTERN_MARK}|${PATTERN_FUT}"

SCAN_ROOTS="hooks packages tools"

# 本脚本自身是**唯一的整文件豁免**：PATTERN 就写在这儿，命中是机械必需（不写关键词就无从扫起）。
# 不给它钉条数的理由：每次改本文件的文档都会动条数，钉了只会制造纯摩擦、零债务防护价值
# （没人会把债务藏进门禁脚本本身——它是全仓被 review 最密的文件）。
# 用仓根相对路径而非 $0：$0 可能是相对调用方 cwd 的路径，上面已 cd 到 ROOT，$0 会失效。
SELF_FILE='tools/check-comment-honesty.sh'

# ── 阳性对照（positive control）─────────────────────────────────────────────
# 上面的三态封装能挡住「grep 报错」，但挡不住另一类坏法：**grep 返回 0/1 却什么都不匹配**
# （被 shim 成 no-op、正则被静默降级、locale 把中文字节吃掉…）。那同样会让门禁恒绿。
# 故先做阳性对照：本文件自身必然含 PATTERN（词表就写在这儿），扫不到 = 扫描器不可信。
scan "$WORK/canary" -cE "$PATTERN" "$SELF_FILE"
CANARY="$(cat "$WORK/canary" 2>/dev/null || echo 0)"
if [ "${CANARY:-0}" -lt 5 ]; then
  {
    printf 'check-comment-honesty: 阳性对照失败——%s 自身应含大量 PATTERN 关键词，实测只匹配到 %s 条。\n' "$SELF_FILE" "${CANARY:-0}"
    printf '扫描器/正则/locale 不可信，「零命中」不可信 → 按失败处理（exit 3）。\n'
  } >&2
  exit 3
fi

# ── 豁免与基线：**精确文件 + 预期命中数**（不是整棵子树、不是整文件无条件放行）─────────
# 旧版豁免 `^packages/kernel/src/compress/` **整棵子树** + doc-scaffold.ts **整文件** +
# `*.test.*` **整类**。前两者意味着「往该目录新增任意文件即可藏债务」，第三者是最大的盲区。
# 现在改成逐文件钉死条数：**新增文件 → 红；已豁免文件里多写一条 → 红；少写一条也 → 红**
# （逼人回来改数字并解释，而不是让豁免额度自己长大）。
#
# 两张表语义**完全不同**，不要混：
#   · EXEMPT（领域例外）：关键词是**被处理/被生成的数据**，不是欠债。永久合法，清不掉也不该清。
#   · DEBT（债务基线）：**真的是未来式注释**，每一条都该被清掉。它在这里不是被赦免，是被**钉住**：
#     数字只许降、不许升；清完请把该行删掉。
#
# ① EXEMPT —— 领域例外（精确文件 → 预期条数）
#    · compress/：该模块的领域功能**就是识别并压缩 TODO 关键词**（markdown.ts 的 TODO_KEYWORD
#      正则、compress.ts 的 `## Open TODOs` 章节标题）。这里的 TODO 是**被处理的数据**。
#    · scaffold/doc-scaffold.ts：它**生成**带 TODO 占位的空文档 stub，占位符是给用户填的产品输出。
#    · 上述两者的 *.test.ts 断言的正是这些领域数据，同理。
#    · commands/migrateWorkflow.ts：那句注释描述的是**字面量信号值** `"待补齐"`（cas 层拿它去比对
#      锁内重读的当前值），是**被描述的数据**，不是该文件欠的债。
EXEMPT_FILES=(
  'packages/kernel/src/compress/markdown.ts'
  'packages/kernel/src/compress/markdown.test.ts'
  'packages/kernel/src/compress/compress.ts'
  'packages/kernel/src/scaffold/doc-scaffold.ts'
  'packages/kernel/src/scaffold/doc-scaffold.test.ts'
  'packages/cli/src/commands/migrateWorkflow.ts'
)
EXEMPT_COUNTS=(2 2 1 2 2 1)

# ② DEBT —— 债务基线（精确文件 → 当前条数）。**这是一份真实待清理清单，不是豁免。**
#    这些注释确实在说「以后要做」，扩词表后被如实抓出。它们全部落在生产代码/他人测试里，
#    超出本轮改动白名单，故先钉基线、另派单清理；钉住后**它们无法再增长**。
DEBT_FILES=(
  'packages/kernel/src/flow/manifest.ts'
  'packages/kernel/src/flow/manifest-derive.test.ts'
  'packages/kernel/src/mem/adapters/opencode.ts'
  'packages/kernel/src/workflow/engine.ts'
  'packages/kernel/src/channel/guard.test.ts'
  'packages/kernel/src/loops/enforce.test.ts'
  'packages/tap/src/index.ts'
  'packages/cli/src/channel.integration.test.ts'
  'packages/automation/src/runner/docker.integration.test.ts'
  'packages/dashboard-app/src/workbench/data.ts'
  'packages/dashboard-app/src/workbench/WorkbenchView.tsx'
  'packages/dashboard-app/src/workbench/mandatorySkills.tsx'
  'packages/dashboard-app/src/workbench/OrchestrationBoard.tsx'
)
DEBT_COUNTS=(9 1 1 1 1 1 1 1 1 1 2 1 2)

# ── 失败收集（bash 3.2 兼容：普通数组 + 下标循环，避免 set -u 下空数组展开）──
FAIL_WHAT=()
FAIL_WHERE=()
FAIL_FIX=()
add_fail() { # what where fix
  FAIL_WHAT[${#FAIL_WHAT[@]}]="$1"
  FAIL_WHERE[${#FAIL_WHERE[@]}]="$2"
  FAIL_FIX[${#FAIL_FIX[@]}]="$3"
}

# 表查询（bash 3.2 无关联数组 → 线性查找）。命中回显预期条数，未命中回显空串。
lookup() { # $1=table(EXEMPT|DEBT) $2=path
  local i n
  if [ "$1" = 'EXEMPT' ]; then
    n=${#EXEMPT_FILES[@]}; i=0
    while [ "$i" -lt "$n" ]; do
      [ "${EXEMPT_FILES[$i]}" = "$2" ] && { printf '%s' "${EXEMPT_COUNTS[$i]}"; return 0; }
      i=$((i + 1))
    done
  else
    n=${#DEBT_FILES[@]}; i=0
    while [ "$i" -lt "$n" ]; do
      [ "${DEBT_FILES[$i]}" = "$2" ] && { printf '%s' "${DEBT_COUNTS[$i]}"; return 0; }
      i=$((i + 1))
    done
  fi
  return 1
}

# ── 主扫描（含 *.test.*）────────────────────────────────────────────────────
scan "$WORK/raw" -rnIE --exclude-dir=dist --exclude-dir=node_modules "$PATTERN" $SCAN_ROOTS
# 逐文件计数（path:line:text → path）
cut -d: -f1 <"$WORK/raw" | sort | uniq -c | while read -r cnt path; do
  printf '%s %s\n' "$cnt" "$path"
done >"$WORK/counts"

FIX_NEW='事情已实现 → 改写成描述现状/原因的注释；确实是缺口 → 删注释，改写成「当前限制测试」（断言缺口存在，实现后测试变红）；属于计划 → 移到 issue/spec/BACKLOG'

while read -r cnt path; do
  [ -z "${path:-}" ] && continue
  [ "$path" = "$SELF_FILE" ] && continue

  if exp="$(lookup EXEMPT "$path")"; then
    if [ "$cnt" -ne "$exp" ]; then
      add_fail \
        "领域例外条数变化（预期 ${exp} 条，实测 ${cnt} 条）" \
        "$path" \
        "该文件的关键词本应只是「被处理/被生成的领域数据」。多出来的是真债务 → 清掉；确实是新增的领域数据 → 改本脚本 EXEMPT_COUNTS 并在此说明为什么它不是债务"
    fi
    continue
  fi

  if exp="$(lookup DEBT "$path")"; then
    if [ "$cnt" -gt "$exp" ]; then
      add_fail \
        "债务基线上升（基线 ${exp} 条，实测 ${cnt} 条）——只许降不许升" \
        "$path" \
        "$FIX_NEW"
    elif [ "$cnt" -lt "$exp" ]; then
      add_fail \
        "债务基线下降（基线 ${exp} 条，实测 ${cnt} 条）——清理了就把数字改小" \
        "$path" \
        "把本脚本 DEBT_COUNTS 里该文件的数字改成 ${cnt}；已清到 0 → 直接删掉 DEBT_FILES/DEBT_COUNTS 里对应那行"
    fi
    continue
  fi

  # 既不在例外表也不在基线表 → 新增债务（含「往 compress/ 新增文件」这种旧版能藏债的路径）
  scan "$WORK/lines" -nIE "$PATTERN" "$path"
  while IFS= read -r l; do
    [ -z "$l" ] && continue
    add_fail "未来式注释（注释描述了「以后要做什么」）" "${path}:${l}" "$FIX_NEW"
  done <"$WORK/lines"
done <"$WORK/counts"

# 基线/例外表里列了、但实测零命中的文件 → 表已过期（文件被删/改名，或债务已清完）
check_stale() { # $1=table $2=path $3=expected
  [ "$3" -eq 0 ] && return 0
  local actual
  actual="$(awk -v p="$2" '$2 == p { print $1 }' "$WORK/counts")"
  [ -n "$actual" ] && return 0
  add_fail \
    "$([ "$1" = 'EXEMPT' ] && echo '领域例外表过期（零命中）' || echo '债务已清空（零命中）')" \
    "$2（表里写着 $3 条，实测 0 条）" \
    "文件被删/改名 → 更新本脚本对应表；债务已清完 → 删掉该行（别留着当摆设）"
}
i=0; while [ "$i" -lt "${#EXEMPT_FILES[@]}" ]; do
  check_stale EXEMPT "${EXEMPT_FILES[$i]}" "${EXEMPT_COUNTS[$i]}"; i=$((i + 1))
done
i=0; while [ "$i" -lt "${#DEBT_FILES[@]}" ]; do
  check_stale DEBT "${DEBT_FILES[$i]}" "${DEBT_COUNTS[$i]}"; i=$((i + 1))
done

# ═══ section 2：结构反漂移（gap #3 绊线）════════════════════════════════════
# gap #3「transition 不触发 handoff」是**「模块不引用某函数」**型缺口，用单测表达是假证据：
# transition.test.ts 全程注入 mock deps（无真 fs），断言「没产出 handoff 产物」在 mock 下恒真，
# 即便真接了线也未必变红——那是自欺。故此处用 grep 断言**源码事实**：
#   packages/cli/src/commands/transition.ts 里零 handoff 引用；
#   buildHandoff 只在用户显式敲 `pipeline handoff` 时跑（handoff.ts）。
# 这条**同时是 handoff.ts:10 那句注释的绊线**——那句注释声称「transition 里没有 buildHandoff
# 调用」。哪天真接了线，本检查变红，逼实现者回来改掉那句注释，而不是留一句假描述。
TRANSITION_TS='packages/cli/src/commands/transition.ts'
if [ -f "$TRANSITION_TS" ]; then
  scan "$WORK/handoff" -nE 'buildHandoff|cmdHandoff' "$TRANSITION_TS"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    add_fail \
      "transition 引用了 handoff（gap #3 已被实现？）" \
      "$line" \
      "若真接了线：本检查已过期，删掉本 section，并同步改掉 handoff.ts 顶注「transition.ts 的进相位副作用里没有 buildHandoff 调用」那句——别让它变成第 18 条假注释"
  done <"$WORK/handoff"
else
  add_fail "被检查文件缺失" "$TRANSITION_TS" "文件被移动/删除 → 更新本脚本 section 2 的路径"
fi

# ═══ 报告 ═══════════════════════════════════════════════════════════════════
N_FAIL=${#FAIL_WHAT[@]}
if [ "$N_FAIL" -eq 0 ]; then
  [ "$QUIET" -eq 1 ] || printf '注释可信度门禁：通过（无新增未来式注释；债务基线未升；transition↔handoff 未接线）\n'
  exit 0
fi

{
  printf '注释可信度门禁：失败（%d 条）\n\n' "$N_FAIL"
  i=0
  while [ "$i" -lt "$N_FAIL" ]; do
    printf '%d) %s\n   位置: %s\n   怎么修: %s\n\n' \
      "$((i + 1))" "${FAIL_WHAT[$i]}" "${FAIL_WHERE[$i]}" "${FAIL_FIX[$i]}"
    i=$((i + 1))
  done
  printf '纪律：注释只描述「现在是什么、为什么这样」，不描述「以后要做什么」。\n'
  printf '背景：W0 清账实测 21 条待做注释里 17 条是假的（事情早实现了），已导致架构规划全盘误判。\n'
} >&2
exit 1
