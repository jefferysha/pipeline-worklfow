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

# pipeline 插件：目录布局复刻 host（bundle 的 pluginRoot=dist/../../.. 需 templates/ 在同源相对位置）
WORKDIR /opt/pipeline
COPY packages/cli/dist/pipeline.mjs /opt/pipeline/packages/cli/dist/pipeline.mjs
COPY templates /opt/pipeline/templates
RUN printf '#!/bin/sh\nexec node /opt/pipeline/packages/cli/dist/pipeline.mjs "$@"\n' > /usr/local/bin/pipeline \
 && chmod +x /usr/local/bin/pipeline

# 沙箱内 afk 驱动（build→verify→ship + 末行 <output> 结构化握手）
COPY tools/sandcastle/pipeline-afk-run.sh /usr/local/bin/pipeline-afk-run
RUN chmod +x /usr/local/bin/pipeline-afk-run

# agent 层：真部署装 Claude Code CLI（沙箱内真编码）；确定性测试用 false 跳过（无 token 也无从验证）
RUN if [ "$WITH_CLAUDE_CODE" = "true" ]; then npm install -g @anthropic-ai/claude-code; fi

# 默认 workdir 由容器启动时 -w <worktreePath> 覆盖（createDockerSandbox）
