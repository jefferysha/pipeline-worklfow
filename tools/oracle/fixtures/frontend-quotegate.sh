#!/usr/bin/env bash
# fixture: frontend-quotegate — frontend track 契约探针：
#   · 四闸拒写（「: 」/「 #」/首引号；换行无法进 TSV 计划行，由 kernel 单测覆盖）
#   · 白名单外字段拒写、枚举拒写
#   · 缺失字段 get（老内核实测 exit 0 + 空行；契约表 exit 1——双跑面差异属 T6 实测发现）
#   · 非法 transition / 未知事件（老内核实测 exit 1；契约表 exit 2）
#   · 引号标量单层去引号 parity（automation_sandbox: "" → 空）
#
# 用法: frontend-quotegate.sh <target-dir>
# 计划行格式: <expected_new_exit>\t<cmd>\t<args...>（expected 列仅降级模式使用）
set -euo pipefail

target="${1:?usage: frontend-quotegate.sh <target-dir>}"
mkdir -p "$target/openspec/changes"
(cd "$target" && git init -q -b main 2>/dev/null || git init -q 2>/dev/null || true)

# open 出口产物预置（与 backend-full 同款先建目录再 init 的模式；双侧 init 均不覆盖已有文件）：
# 新 CLI check = guard 出口全语义（BACKLOG #12），open 出口要 proposal/tasks/design.md（frontend）；
# 老 cmd_check open 只看 openspec/ 目录——两侧文件一致，exit 面保持可比。
mkdir -p "$target/openspec/changes/t6-fe"
printf '# proposal\n\nT6 oracle fixture: frontend quote-gate 探针。\n' > "$target/openspec/changes/t6-fe/proposal.md"
printf -- '- [ ] q1\n' > "$target/openspec/changes/t6-fe/tasks.md"
printf '# design\n\nfixture design doc.\n' > "$target/openspec/changes/t6-fe/design.md"

tr '|' '\t' > "$target/.oracle-plan" <<'PLAN'
0|init|t6-fe|frontend|hotfix
0|get|t6-fe|preset
0|get|t6-fe|automation_sandbox
1|get|t6-fe|nosuchfield
1|set|t6-fe|nosuchfield|whatever
1|set|t6-fe|isolation|bogus
1|set|t6-fe|automation_last_error|boom: gate
1|set|t6-fe|automation_last_error|boom #gate
1|set|t6-fe|automation_last_error|"quoted
0|set|t6-fe|automation_last_error|clean-error
0|get|t6-fe|automation_last_error
0|check|t6-fe|open
0|transition|t6-fe|open-complete
0|get|t6-fe|phase
2|transition|t6-fe|open-complete
2|transition|t6-fe|bogus-event
PLAN
