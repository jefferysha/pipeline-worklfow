#!/usr/bin/env bash
# fixture: backend-full — backend track 全生命周期（init → … → archived）
#
# 用法: backend-full.sh <target-dir>
# 产物:
#   <target>/openspec/changes/t6-be/{proposal.md,design.md,tasks.md}  # check 前置产物
#   <target>/docs/{design.md,plan.md,verify.md}                       # 字段指向的文件
#   <target>/.oracle-plan                                             # 命令计划（TSV）
#
# 计划行格式: <expected_new_exit>\t<cmd>\t<args...>
#   expected_new_exit 仅降级（契约测试）模式使用；双跑模式逐面比老脚本、忽略该列。
set -euo pipefail

target="${1:?usage: backend-full.sh <target-dir>}"
mkdir -p "$target/openspec/changes/t6-be" "$target/docs"

# 独立 git 仓（无 commit）：老 init 的 base_branch 探测走 `git branch --show-current` → main，
# 且 build-complete 的 `git rev-parse HEAD` 失败 → build_sha 保持 null。双侧确定性。
(cd "$target" && git init -q -b main 2>/dev/null || git init -q 2>/dev/null || true)

printf '# proposal\n\nT6 oracle fixture: backend 全生命周期。\n' > "$target/openspec/changes/t6-be/proposal.md"
printf '# design\n\nfixture design doc.\n' > "$target/openspec/changes/t6-be/design.md"
# check explore 要求存在未勾任务；check build 要求任务数 >= 3
printf -- '- [ ] t1\n- [x] t2\n- [x] t3\n' > "$target/openspec/changes/t6-be/tasks.md"
# docs/design.md 携带 coverage 块（backend full 的 required 层全 filled）：
# 新 CLI check = guard 出口全语义（BACKLOG #12），spec 出口有 M1 覆盖 gate；
# 老 cmd_check 是入相位前置面、不读该块——两侧文件一致，exit 面保持可比。
cat > "$target/docs/design.md" <<'DESIGN'
# design

```coverage
touches:
L1_api: filled
L2_data: filled
L3_rules: filled
L4_state: filled
L5_errors: filled
L6_security: filled
L7_perf: filled
L8_deps: filled
L10_terms: filled
```
DESIGN
printf '# plan\n' > "$target/docs/plan.md"
printf '# verification report\n' > "$target/docs/verify.md"

# P6 起 set/cas 对「当前有效 artifact 相位」的 artifact 字段拒写（改走 pipeline artifact register）：
# plan（spec 相位）、verification_report（verify 相位）改用 seed 在双侧直接注同值，隔离 legacy
# transition 等价面的数据准备（design_doc 在 open 相位 set 时非有效 artifact、照常双跑）。
# 竖线转 TAB（计划值不含竖线）
tr '|' '\t' > "$target/.oracle-plan" <<'PLAN'
0|init|t6-be|backend|full
0|get|t6-be|phase
0|get|t6-be|track
0|set|t6-be|design_doc|docs/design.md
0|get|t6-be|design_doc
0|check|t6-be|explore
0|transition|t6-be|open-complete
0|get|t6-be|phase
0|transition|t6-be|explore-complete
0|seed|t6-be|plan|docs/plan.md
0|check|t6-be|build
0|transition|t6-be|spec-complete
0|set|t6-be|build_mode|direct
0|set|t6-be|isolation|worktree
0|set|t6-be|direct_override|true
0|transition|t6-be|build-complete
0|seed|t6-be|verification_report|docs/verify.md
0|set|t6-be|branch_status|handled
0|set|t6-be|agent_review_result|pass
0|set|t6-be|codex_review_result|pass
0|transition|t6-be|verify-pass
0|get|t6-be|verify_result
0|get|t6-be|verified_at
0|transition|t6-be|ship-complete
0|transition|t6-be|archived
0|get|t6-be|archived
PLAN
