#!/usr/bin/env bash
# fixture: default-guard-errors — default 轨**每种前置 guard 失败分支**的 old/new stderr 逐字双跑（G2 P3 阻断 2）。
#
# 背景：default-effects 的 stderr 逐字面只覆盖了 barrier 一条拒绝路径（build-head-unchanged 双行文案）。
# 其余迁移 guard 的失败分支（explore 缺 design_doc / spec 缺 plan / build 缺 build_mode·isolation /
# isolation 非法枚举 / full+direct 缺 override / verify report·branch_status·agent·codex 各失败）此前只有
# 新侧单测自证、不是老/新双跑——renderer 某普通 guard 文案改一字符现有 DUAL 仍 0 diff。本 fixture 把一个
# change 走过各 phase，在每个 phase 的**正确 from 相位**下把 change 摆到「恰好触发某一 guard 失败」的状态跑
# transition（双侧都非零退出），经 .oracle-stderr-check sidecar 开 run.sh 的 STDERR 面逐字比老/新（剥 ANSI
# 后 cmp），覆盖 renderPreconditionViolation 的**每一种文案**。
#
# 首错优先（stopOnFirstFailure）验证：多 guard 同时失败时只报第一条——
#   · build-complete 首探：build_mode 与 isolation 皆未设，双侧都必须只报 build_mode（不是 isolation）。
#   · verify-pass 首探：verification_report 与 branch_status/agent/codex 皆未就绪，双侧都必须只报 report。
# stderr 逐字相等 = 老/新选中的「第一条」是同一条（顺序一致）。
#
# isolation 非法枚举分支（field-in）是**绕过 set 闸的纵深防线**：`set isolation bogus` 被两侧 set-gate 同样
# 拒（validate_enum，state-fields.sh），正常 set/transition 面到不了该 guard。用 harness 的 `seed` 伪命令
# （run.sh run_step_seed）在双侧各自 init 产出的状态文件上**行定位替换**该字段值注脏，再跑 transition 触发。
#
# 用法: default-guard-errors.sh <target-dir>
# 计划行格式: <expected_new_exit>\t<cmd>\t<args...>（双跑忽略首列；拒绝步 expected=1 供降级契约测试用）
#   seed 伪命令 `0|seed|<change>|<field>|<value>` = harness 在双侧状态文件行定位改写 <field> 为 <value>
#     （注入绕过 set 闸的脏值；见 run.sh run_step_seed）。
set -euo pipefail

target="${1:?usage: default-guard-errors.sh <target-dir>}"
mkdir -p "$target/openspec/changes/t6-ge" "$target/docs"

printf '# proposal\n\nT6 oracle fixture: default 轨 guard 失败分支 stderr 双跑。\n' > "$target/openspec/changes/t6-ge/proposal.md"
printf '# design\n\nfixture design doc.\n' > "$target/openspec/changes/t6-ge/design.md"
printf -- '- [ ] t1\n- [x] t2\n- [x] t3\n' > "$target/openspec/changes/t6-ge/tasks.md"
# 字段指向的「存在」目标（fix 步用）；docs/missing.md 刻意不建（file-exists 失败分支用）。
printf '# design\n' > "$target/docs/design.md"
printf '# plan\n' > "$target/docs/plan.md"
printf '# verification report\n' > "$target/docs/verify.md"

# 独立 git 仓（无 commit）：base_branch 探测 → main（双侧确定性）；build-complete 的 git HEAD 取不到 →
# build_sha 留 null（barrier 退化跳过，不干扰 verify-pass 各前置 guard 的失败探测）。同 backend-full。
(cd "$target" && git init -q -b main 2>/dev/null || git init -q 2>/dev/null || true)

# 声明本 fixture 走 stderr 逐字口径（run.sh 据此在 transition 拒绝路径逐字比 stderr）。
: > "$target/.oracle-stderr-check"

# 竖线转 TAB（计划值不含竖线）
tr '|' '\t' > "$target/.oracle-plan" <<'PLAN'
0|init|t6-ge|backend|full
0|transition|t6-ge|open-complete
1|transition|t6-ge|explore-complete
0|seed|t6-ge|design_doc|docs/missing.md
1|transition|t6-ge|explore-complete
0|seed|t6-ge|design_doc|docs/design.md
0|transition|t6-ge|explore-complete
1|transition|t6-ge|spec-complete
0|seed|t6-ge|plan|docs/missing.md
1|transition|t6-ge|spec-complete
0|seed|t6-ge|plan|docs/plan.md
0|transition|t6-ge|spec-complete
1|transition|t6-ge|build-complete
0|set|t6-ge|build_mode|direct
1|transition|t6-ge|build-complete
0|seed|t6-ge|isolation|bogus
1|transition|t6-ge|build-complete
0|set|t6-ge|isolation|worktree
1|transition|t6-ge|build-complete
0|set|t6-ge|direct_override|true
0|transition|t6-ge|build-complete
1|transition|t6-ge|verify-pass
0|seed|t6-ge|verification_report|docs/missing.md
1|transition|t6-ge|verify-pass
0|seed|t6-ge|verification_report|docs/verify.md
1|transition|t6-ge|verify-pass
0|set|t6-ge|branch_status|handled
1|transition|t6-ge|verify-pass
0|set|t6-ge|agent_review_result|pass
1|transition|t6-ge|verify-pass
0|set|t6-ge|codex_review_result|pass
0|transition|t6-ge|verify-pass
0|get|t6-ge|phase
PLAN
