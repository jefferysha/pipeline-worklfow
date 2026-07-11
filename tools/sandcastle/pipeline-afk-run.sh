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
# --user uid:gid 无 passwd 条目时容器默认把 HOME 解析成 `/`（非空、非未设——`${HOME:-x}` 式兜底
# 不会触发，真跑实测确认），且 `/` 对非 root uid 不可写。无条件强制指到 tmpfs 可写目录，供
# git --global config 落盘、也供 Claude Code 的 .claude 状态目录落盘（真跑抓出 EACCES mkdir
# '/.claude' 才发现默认 HOME 是 `/` 而非"未设"，iteration-32）。
export HOME=/tmp

# 任意 host uid 对齐（--user host-uid:host-gid）在 alpine 里大概率没有 /etc/passwd 条目——Claude
# Code Bash 工具/login shell 按 uid 查 passwd 找不到条目同样可能异常初始化。自助注册一条，幂等
# （已有条目——如 root——则跳过）。
current_uid="$(id -u)"
if ! grep -q "^[^:]*:[^:]*:${current_uid}:" /etc/passwd 2>/dev/null; then
  echo "sandbox:x:${current_uid}:$(id -g)::${HOME}:/bin/sh" >> /etc/passwd 2>/dev/null || true
fi

# 挂载进来的 .git 属主 uid 与容器 --user 对齐，但 git 仍可能报 dubious ownership → 显式放行。
git config --global --add safe.directory '*' >/dev/null 2>&1 || true
git config --global user.email 'afk@pipeline.local' >/dev/null 2>&1 || true
git config --global user.name 'pipeline-afk' >/dev/null 2>&1 || true

# 证明 pipeline 插件在沙箱内真可用（读挂载 worktree 的真 change 状态）；失败不致命（记 unknown）。
phase="$(pipeline get "$name" phase 2>/dev/null || echo unknown)"

if [ "${PIPELINE_RUNNER:-}" = "codex" ]; then
  # runner 双支持（v5 T20）：runner=codex 由 host 侧命令构造点（runner.ts::buildAfkRunCommand）
  # 显式注入——用户在 loops.yaml 点名要 codex，CLI 缺失就是硬错误：打清晰 stderr 并非零退出
  # （错误经 ports.ts runWork 的 throw 流进 scheduler，automation_last_error 落「codex CLI 不可用」），
  # 绝不静默回落确定性路径伪装 agent 跑过。
  if ! command -v codex >/dev/null 2>&1; then
    printf 'codex CLI 不可用（runner=codex 已显式指定，但沙箱镜像内无 codex 命令）：请在 sandcastle 镜像安装 codex CLI，或把该 loop 的 runner 改回 claude-code\n' >&2
    exit 96
  fi
  # 凭证提示（v5 T22）：host 侧（dockerRunChange::codexCredentialEnv）只在 runner=codex 且宿主机
  # 真有凭证时注入 OPENAI_API_KEY / CODEX_HOME。两者皆缺 → 打一条可操作的 stderr 提示（仅提示，
  # **不改变退出路径**——codex 自身会报认证错误并非零退出，经既有 stderr 通道流进
  # automation_last_error，诚实分流不在这里预判/短路）。
  if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${CODEX_HOME:-}" ]; then
    printf '未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY 或挂载 CODEX_HOME（codex 将自行报认证错误）\n' >&2
  fi
  # codex 无头会话（CLI 惯例：codex exec = 非交互一次性执行）。--dangerously-bypass-approvals-and-sandbox
  # 对位 claude 的 --dangerously-skip-permissions：headless 容器无 TTY 应答审批，且一次性容器 +
  # 独立 worktree 本身就是隔离边界（codex 官方口径也只建议在容器内用该开关）。认证走 extraEnv
  # 注入的 key（如 OPENAI_API_KEY/CODEX_API_KEY）；认证失败由 codex 自身报错落日志，与 claude
  # 路径同款诚实分流（agent 失败不掩盖，确定性产物兜底记账）。timeout 300 同 claude 路径。
  agent_exit=0
  timeout 300 codex exec --dangerously-bypass-approvals-and-sandbox \
    "Run the pipeline build phase for change ${name}, then stop." \
    >".sandcastle-build.agent.log" 2>&1 || agent_exit=$?
  printf 'agent exit=%s\n' "$agent_exit" >>".sandcastle-build.agent.log"
  # [TRANSITION] 行回放（同 claude 路径的 T4 修复）：host 侧 phaseWatch 只看得到流面。
  grep -a '^\[TRANSITION\] ' ".sandcastle-build.agent.log" || true
  # agent 非零退出可见度（观察项③/决议 #14②）：codex 认证失效等失败此前只落在上面那份 worktree
  # 内日志里——脚本继续确定性兜底 commit 且 0 退出，host 侧流面完全看不见，automation_last_error
  # 永远不落（「agent 跑过了」的假象）。把非零 exit 以可解析标记行回放到 stdout（同 [TRANSITION]
  # 回放口径；host 侧 lifecycle exec tee 处检出并同步落 automation_last_error；parseSandboxReport
  # 容忍多余行，不干扰末行 <output> 握手）。exit=0 不输出（零噪音）。**不改变退出路径**：确定性
  # 兜底与成败判定原样，run 仍成功——这是可见度，不是改判。
  if [ "$agent_exit" -ne 0 ]; then
    printf '[AGENT_EXIT] codex %s\n' "$agent_exit"
  fi
elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && command -v claude >/dev/null 2>&1; then
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

  # T4 评审修复（[TRANSITION] 流面）：上面把 agent 全部输出（含沙箱内 pipeline transition 打到
  # stderr 的 [TRANSITION] 行）重定向进了日志文件，docker exec 的流面上只剩末行握手——host 侧
  # phaseWatch（exec.ts onLine → transitionWatch）在生产 AFK 路径永远收不到行。把日志里的
  # [TRANSITION] 行按原样回放到自身 stdout（-a 防日志混入二进制字节时 grep 拒判；无命中不致命）。
  grep -a '^\[TRANSITION\] ' ".sandcastle-build.agent.log" || true

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
