# sandcastle 沙箱镜像（BACKLOG #29-wire）—— AFK 无人监管自动化的容器执行基座。
#
# 内含：node（bundle 运行时）+ git（沙箱内 worktree/commit）+ pipeline 插件（自足 bundle +
#   templates 运行时资产）+ pipeline-afk-run（沙箱内 build→verify→ship 驱动 + <output> 握手，纯
#   #!/bin/sh POSIX 语法，alpine busybox ash 直接跑，无需装 bash/jq/python3——按脚本实际需要精简，
#   不比照老仓 bash+python 沙箱的工具链照单全收）。
# agent 层（Claude Code CLI + codex CLI，v5 T20/T22 runner 双支持）由 WITH_CLAUDE_CODE 控制
#   （WITH_CODEX 缺省随它，可单独覆盖）：真部署默认装；确定性测试
#   --build-arg WITH_CLAUDE_CODE=false 跳过（沙箱执行接线全链仍真跑，见 dockerRunChange.integration.test）。
#
# 构建上下文 = 仓库根（COPY 需 packages/cli/dist/pipeline.mjs 与 templates/，故先 npm run build）。
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}

ARG WITH_CLAUDE_CODE=true
ARG PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=0
ENV PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=${PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK}

RUN apk add --no-cache git

# 支持任意运行时 uid（container.ts --user host-uid:host-gid，对齐 host worktree 属主，DESIGN
# §7-item5）：alpine /etc/passwd 只登记内置系统用户，任意 host uid 大概率查不到条目——Claude
# Code Bash 工具/login shell 初始化按 uid 查 passwd 取 HOME，查不到会解析出异常 HOME（G6 真跑，
# iteration-32，抓出 "EACCES mkdir '/.claude'"，HOME 被解析成了根目录）。放宽权限供
# pipeline-afk-run 运行时自助注册当前 uid 的 passwd 条目（幂等，已有条目如 root 则跳过）。
RUN chmod o+w /etc/passwd /etc/group

# agent 层：真部署装 Claude Code CLI（沙箱内真编码）；确定性测试用 false 跳过（无 token 也无从验证）。
# 层顺序刻意把这步排在 pipeline.mjs/afk-run 脚本的 COPY **之前**——npm install -g 在本环境实测
# 要 8 分钟，而 pipeline.mjs/脚本在开发迭代中几乎每次都变，若排在后面每次改都得重装一遍 npm 包，
# Docker 层缓存就形同虚设。
RUN if [ "$WITH_CLAUDE_CODE" = "true" ]; then npm install -g @anthropic-ai/claude-code; fi

# Claude Code 的 Bash 工具要求 SHELL 指向真实 shell 二进制，alpine 默认两者皆无（SHELL 未设、
# 也无 bash，仅 busybox ash）——G6 真跑（iteration-32，首次用有效 token 真跑到 agent 调用这一步）
# 当场抓出 "No suitable shell found"，agent 因此完全无法执行任何命令，只能诚实报告卡住。
# 放在 npm install 层之后（新增层不影响其缓存）、仅随 WITH_CLAUDE_CODE 分流（确定性镜像不受影响）。
RUN if [ "$WITH_CLAUDE_CODE" = "true" ]; then apk add --no-cache bash; fi
ENV SHELL=/bin/bash

# codex CLI（v5 T22，runner 双支持的另一半）：loops.yaml 里 runner: codex 的 loop 由
# pipeline-afk-run 起 `codex exec` 无头会话——镜像里没装它就只能走 exit 96 硬错误。
# 版本**固定**（@0.144.1，2026-07-11 npm latest）：镜像 ↔ host 侧行为对账要求可复现构建，
# 浮动 latest 会让同一 Dockerfile 在不同时间构建出行为漂移的镜像且不可见；升级须显式改这里。
# 缺省随 WITH_CLAUDE_CODE 同开同关（同属 agent 层：确定性测试镜像两者都不装，构建快、无凭证
# 也能验证沙箱链路），需要单独控制时 --build-arg WITH_CODEX=true|false 显式覆盖。
# 装完 `codex --version` 当场自验（装坏/PATH 断链在构建期就炸，不留到 run 时）。
# 层顺序同 claude-code：排在 pipeline.mjs/afk-run 脚本 COPY 之前，享受 Docker 层缓存。
ARG WITH_CODEX=${WITH_CLAUDE_CODE}
RUN if [ "$WITH_CODEX" = "true" ]; then npm install -g @openai/codex@0.144.1 && codex --version; fi

# pipeline 插件：目录布局复刻 host（bundle 的 pluginRoot=dist/../../.. 需 templates/ 在同源相对位置）
WORKDIR /opt/pipeline
COPY packages/cli/dist/pipeline.mjs /opt/pipeline/packages/cli/dist/pipeline.mjs
COPY templates /opt/pipeline/templates
RUN printf '#!/bin/sh\nexec node /opt/pipeline/packages/cli/dist/pipeline.mjs "$@"\n' > /usr/local/bin/pipeline \
 && chmod +x /usr/local/bin/pipeline

# 沙箱内 afk 驱动（build→verify→ship + 末行 <output> 结构化握手）
COPY tools/sandcastle/pipeline-afk-run.sh /usr/local/bin/pipeline-afk-run
RUN chmod +x /usr/local/bin/pipeline-afk-run

# H10 r6：镜像内实际字节 attestation。两份 COPY 都完成后现场计算，不把 CLI 自身摘要嵌回
# pipeline.mjs，因而没有自引用 hash。host 运行守卫可把当前 CLI 摘要传给 runner.ts 逐项对账。
RUN set -eu; \
  afk_sha="$(sha256sum /usr/local/bin/pipeline-afk-run | awk '{print $1}')"; \
  cli_sha="$(sha256sum /opt/pipeline/packages/cli/dist/pipeline.mjs | awk '{print $1}')"; \
  printf 'pipeline_afk_run_sha256=%s\npipeline_cli_dist_sha256=%s\n' "$afk_sha" "$cli_sha" \
    > /opt/pipeline/image-attestation.env; \
  chmod 0444 /opt/pipeline/image-attestation.env

# 默认 workdir 由容器启动时 -w <worktreePath> 覆盖（createDockerSandbox）
