# sandcastle 沙箱镜像（BACKLOG #29-wire）—— AFK 无人监管自动化的容器执行基座。
#
# 内含：node（bundle 运行时）+ git（沙箱内 worktree/commit）+ pipeline 插件（自足 bundle +
#   templates 运行时资产）+ pipeline-afk-run（沙箱内 build→verify→ship 驱动 + <output> 握手，纯
#   #!/bin/sh POSIX 语法，alpine busybox ash 直接跑，无需装 bash/jq/python3——按脚本实际需要精简，
#   不比照老仓 bash+python 沙箱的工具链照单全收）。
# agent 层（Claude Code CLI）由 WITH_CLAUDE_CODE 控制：真部署默认装；确定性测试
#   --build-arg WITH_CLAUDE_CODE=false 跳过（沙箱执行接线全链仍真跑，见 dockerRunChange.integration.test）。
#
# 构建上下文 = 仓库根（COPY 需 packages/cli/dist/pipeline.mjs 与 templates/，故先 npm run build）。
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}

ARG WITH_CLAUDE_CODE=true

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

# pipeline 插件：目录布局复刻 host（bundle 的 pluginRoot=dist/../../.. 需 templates/ 在同源相对位置）
WORKDIR /opt/pipeline
COPY packages/cli/dist/pipeline.mjs /opt/pipeline/packages/cli/dist/pipeline.mjs
COPY templates /opt/pipeline/templates
RUN printf '#!/bin/sh\nexec node /opt/pipeline/packages/cli/dist/pipeline.mjs "$@"\n' > /usr/local/bin/pipeline \
 && chmod +x /usr/local/bin/pipeline

# 沙箱内 afk 驱动（build→verify→ship + 末行 <output> 结构化握手）
COPY tools/sandcastle/pipeline-afk-run.sh /usr/local/bin/pipeline-afk-run
RUN chmod +x /usr/local/bin/pipeline-afk-run

# 默认 workdir 由容器启动时 -w <worktreePath> 覆盖（createDockerSandbox）
