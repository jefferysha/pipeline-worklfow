#!/usr/bin/env bash
# fixture: pm-history — pm track、预置 change 携带老内核 base64 历史区
# （结构复刻老仓真实 change openspec/changes/afk-autopilot-triggers/.pipeline.yaml，
#   base64 载荷已脱敏为无害示例文本）。
#
# 验证点：
#   · 对含历史区的既有 change 做 get/set/transition/check（不 init）
#   · 新内核写回时历史尾块必须逐字保留 —— 基线写入 <target>/.oracle-preserve
#     （首行 change 名，其余 = 历史区块），run.sh 全程跑完后在新侧做逐字子串校验
#
# 用法: pm-history.sh <target-dir>
# 计划行格式: <expected_new_exit>\t<cmd>\t<args...>（expected 列仅降级模式使用）
set -euo pipefail

target="${1:?usage: pm-history.sh <target-dir>}"
chdir="$target/openspec/changes/t6-pm"
mkdir -p "$chdir" "$target/docs"
(cd "$target" && git init -q -b main 2>/dev/null || git init -q 2>/dev/null || true)

printf '# proposal\n\nT6 oracle fixture: pm + history region.\n' > "$chdir/proposal.md"
# check build 要求 tasks.md 任务数 >= 3（pm 不要求 plan）
printf -- '- [ ] a\n- [x] b\n- [x] c\n' > "$chdir/tasks.md"
printf '# design\n' > "$target/docs/design.md"

# 历史区块（写入 yaml 尾部 + 同内容作 PRESERVE 基线）
history_block='prompts_history:
  - { at: 2026-07-01T08:00:00Z, phase: spec, track: pm, kind: decision, q_b64: "Y29uZmlybT8=", a_b64: "eWVz" }
  - { at: 2026-07-01T07:00:00Z, phase: open, track: pm, prompt_b64: "b3JhY2xlIGZpeHR1cmU=" }
tools_history:
  - { at: 2026-07-01T07:30:00Z, tool: Skill, detail: "superpowers:brainstorming" }
  - { at: 2026-07-01T07:10:00Z, tool: Skill, detail_b64: "cGlwZWxpbmUgZHVhbC1ydW4gaGFybmVzcw==" }
transitions_history:
  - { at: 2026-07-01T08:00:01Z, from: explore, to: spec, event: explore-complete }
  - { at: 2026-07-01T07:30:01Z, from: open, to: explore, event: open-complete }'

# 37 字段全量（老 init heredoc 字段序）+ 历史尾块；phase=spec（后续 spec-complete → build）
cat > "$chdir/.pipeline.yaml" <<YAML
track: pm
preset: full
created_by: oracle
assignee: null
phase: spec
phase_status: in_progress
design_doc: docs/design.md
plan: null
verification_report: null
build_mode: null
isolation: null
build_sha: null
agent_review_result: skipped
codex_review_result: skipped
verify_result: pending
branch_status: pending
direct_override: false
prd_path: null
pr_url: null
automation: off
automation_queued_at: ""
automation_sandbox: ""
automation_worktree: ""
automation_attempts: 0
automation_last_error: ""
automation_preserved_path: ""
branch: null
base_branch: main
scope: null
related_files: null
spec_scope: null
depends_on: null
created_at: 2026-07-01T07:00:00Z
updated_at: 2026-07-01T08:00:01Z
verified_at: null
archived_at: null
archived: false
$history_block
YAML

# PRESERVE 基线 sidecar：首行 change 名，其余为必须逐字保留的历史区块
{
  printf 't6-pm\n'
  printf '%s\n' "$history_block"
} > "$target/.oracle-preserve"

tr '|' '\t' > "$target/.oracle-plan" <<'PLAN'
0|get|t6-pm|phase
0|get|t6-pm|track
0|set|t6-pm|prd_path|docs/prd.md
0|get|t6-pm|prd_path
0|check|t6-pm|build
0|transition|t6-pm|spec-complete
0|get|t6-pm|phase
0|get|t6-pm|updated_at
PLAN
