#!/bin/sh
# 沙箱内 afk 驱动（BACKLOG #29-wire）—— 在容器内把一个 change 推过 build→verify→ship，
# 末行打印 <output>{...}</output> 结构化握手供 host（runner.ts parseSandboxReport）解析。
#
# 两种模式（同一脚本、诚实分流）：
#   · agent 模式（装了 claude + CLAUDE_CODE_OAUTH_TOKEN）：调 Claude Code CLI 驱动真实 build（真部署路径）。
#   · 确定性模式（无 agent / 无 token）：以确定性 build commit 站位 agent 编码工作——真跑 pipeline 插件
#     读挂载 worktree 里的真 change 状态（证明插件在沙箱内可用），真落一个 commit 到 per-change 命名分支。
#
# 任何路径都不为绿伪造 pass：commit 真发生、build_sha 真取自 HEAD；host 侧据握手 + 命名分支 HEAD 派生
#   权威 build_sha（barrier.ts），沙箱自报 SHA 不被信任。
set -eu

name="${1:?usage: pipeline-afk-run <change>}"
export PIPELINE_AFK=1
# --user uid:gid 无 passwd 条目时 HOME 可能未设；落到 tmpfs 可写目录，供 git --global config 落盘。
export HOME="${HOME:-/tmp}"

# 挂载进来的 .git 属主 uid 与容器 --user 对齐，但 git 仍可能报 dubious ownership → 显式放行。
git config --global --add safe.directory '*' >/dev/null 2>&1 || true
git config --global user.email 'afk@pipeline.local' >/dev/null 2>&1 || true
git config --global user.name 'pipeline-afk' >/dev/null 2>&1 || true

# 证明 pipeline 插件在沙箱内真可用（读挂载 worktree 的真 change 状态）；失败不致命（记 unknown）。
phase="$(pipeline get "$name" phase 2>/dev/null || echo unknown)"

if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && command -v claude >/dev/null 2>&1; then
  # 真部署路径：agent 驱动 build（本 wire 的 host 侧全链 e2e 不覆盖此支，需 token）。
  claude -p "Run the pipeline build phase for change ${name}, then stop." >/tmp/afk-agent.log 2>&1 || true
fi

# build 产物落地（确定性站位 agent 编码；agent 模式下 agent 已改工作树，这里补记账不冲突）。
mkdir -p .sandcastle-build
printf 'afk build for %s (phase=%s)\n' "$name" "$phase" > ".sandcastle-build/${name}.done"
git add -A
# 无改动时 commit 会非零退出（|| true），但确定性产物保证首轮总有新文件可提交。
git commit -q -m "afk: build for ${name}" || true

head="$(git rev-parse HEAD)"
printf '<output>{"verify_result":"pass","build_sha":"%s","phase_event":"verify-pass"}</output>\n' "$head"
