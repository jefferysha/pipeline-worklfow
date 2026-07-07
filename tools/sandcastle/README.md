# sandcastle 沙箱镜像

`pipeline afk run` 真跑一个 change 时的容器执行基座（BACKLOG #29-wire）。详见 `Dockerfile` 顶部注释。

## 本机构建

```sh
npm run build          # 先产出 packages/cli/dist/pipeline.mjs（镜像 COPY 依赖它）
tools/sandcastle/build.sh          # 构建 sandcastle:local（生产默认，装真 Claude Code CLI）
tools/sandcastle/build.sh test     # 构建 sandcastle:test（确定性测试镜像，不装 agent 层，构建快）
```

`pipeline afk run`（不传 `--image`）默认用 `sandcastle:local`；真 agent 编码需要在环境里另外提供
`CLAUDE_CODE_OAUTH_TOKEN`（一次性环境变量传给容器，不落盘），见 `docs/TEST-REALITY.md` G6 条目。

## 发布现状（诚实登记）

**这两个镜像目前只在本机 docker 缓存里，没有发布到任何镜像仓库（Docker Hub / GHCR / 其它
registry）。** 换机器、接 CI（docker-enabled runner）、或团队其他成员想用，都需要用上面的命令
自己重新 `docker build`——层缓存下（`npm install -g @anthropic-ai/claude-code` 那层最慢，实测约
8 分钟）只有脚本/pipeline.mjs 变了才需要重装。

选择发布到哪个 registry（GHCR 与 GitHub 仓库同源、免额外账号；Docker Hub 更通用但免费额度更小；
或本地私有 registry）是仓库所有者的决定，本仓不代为选择或推送。若决定发布，大致步骤：

```sh
# 以 GHCR 为例（需先 docker login ghcr.io，用有 write:packages 权限的 token）
docker tag sandcastle:local ghcr.io/<owner>/sandcastle:local
docker push ghcr.io/<owner>/sandcastle:local
```

发布后，`pipeline afk run --image ghcr.io/<owner>/sandcastle:local` 即可跨机使用，无需本机重新构建。
