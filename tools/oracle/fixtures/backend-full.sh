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
printf '# design\n' > "$target/docs/design.md"
printf '# plan\n' > "$target/docs/plan.md"
printf '# verification report\n' > "$target/docs/verify.md"

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
0|set|t6-be|plan|docs/plan.md
0|check|t6-be|build
0|transition|t6-be|spec-complete
0|set|t6-be|build_mode|direct
0|set|t6-be|isolation|worktree
0|set|t6-be|direct_override|true
0|transition|t6-be|build-complete
0|set|t6-be|verification_report|docs/verify.md
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
