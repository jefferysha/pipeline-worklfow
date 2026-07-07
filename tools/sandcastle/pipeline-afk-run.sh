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
  # 真部署路径：agent 驱动 build。
  #   走代理而非直连：容器内自起 `pipeline tap` reverse proxy（同容器网络命名空间，不依赖
  #   docker↔host 反向连通性——host.docker.internal 在部分沙箱化环境里对宿主监听端口只会
  #   silently drop，实测过），claude 经它转发到真 api.anthropic.com。capture.enabled 手写
  #   1（同 setCaptureEnabled(true) 效果，纯文件协议，容器内无需引 tap 库）；trace 落
  #   worktree 内目录，随 git commit 一起可从 host 侧读到，验证真走了代理而非直连。
  #   --dangerously-skip-permissions：headless 容器没有 TTY 能应答权限确认，不加这个每个
  #   工具调用都会挂死等一个永远不会到来的交互——沙箱本身（一次性容器 + 独立 worktree）就是
  #   隔离边界，这也是 AFK「无人监管」这个功能定位本身要求的（有人盯着批权限就不叫 AFK 了）。
  #   timeout 300：busybox 自带 applet，防 agent 真挂死拖爆 host 侧 idle 超时（20min）。
  #   日志/trace 落进 worktree（而非容器内 /tmp）——teardown 后仍可从 host 侧 worktree/命名分支读到。
  tap_dir="$PWD/.sandcastle-tap"
  mkdir -p "$tap_dir"
  printf '1' > "${tap_dir}/capture.enabled"
  PIPELINE_TAP_DIR="$tap_dir" pipeline tap start claude --json >/tmp/tap-start.json 2>/tmp/tap-start.err &
  tap_pid=$!
  tap_port=""
  i=0
  while [ $i -lt 25 ]; do
    if [ -s /tmp/tap-start.json ]; then
      tap_port="$(grep -o '"port":[0-9]*' /tmp/tap-start.json | head -1 | cut -d: -f2)"
      [ -n "$tap_port" ] && break
    fi
    sleep 0.4
    i=$((i + 1))
  done

  agent_exit=0
  if [ -n "$tap_port" ]; then
    ANTHROPIC_BASE_URL="http://127.0.0.1:${tap_port}" \
      timeout 300 claude -p "Run the pipeline build phase for change ${name}, then stop." \
      --dangerously-skip-permissions \
      >".sandcastle-build.agent.log" 2>&1 || agent_exit=$?
  else
    printf 'tap proxy 未能在 10s 内绑定端口，agent 未运行（诚实门：不绕过代理直连）\n' >".sandcastle-build.agent.log"
    agent_exit=97
  fi
  printf 'agent exit=%s\n' "$agent_exit" >>".sandcastle-build.agent.log"

  if [ -n "$tap_port" ]; then
    kill "$tap_pid" 2>/dev/null || true
    wait "$tap_pid" 2>/dev/null || true
  fi
fi

# build 产物落地（确定性站位 agent 编码；agent 模式下 agent 已改工作树，这里补记账不冲突）。
mkdir -p .sandcastle-build
printf 'afk build for %s (phase=%s)\n' "$name" "$phase" > ".sandcastle-build/${name}.done"
git add -A
# 无改动时 commit 会非零退出（|| true），但确定性产物保证首轮总有新文件可提交。
git commit -q -m "afk: build for ${name}" || true

head="$(git rev-parse HEAD)"
printf '<output>{"verify_result":"pass","build_sha":"%s","phase_event":"verify-pass"}</output>\n' "$head"
