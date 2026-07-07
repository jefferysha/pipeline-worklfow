#!/usr/bin/env bash
# 手动构建 sandcastle 沙箱镜像（BACKLOG #29-wire 运维空白：镜像未发布到任何 registry，
# 见 docs/TEST-REALITY.md「本轮新发现的运维空白」）。本脚本只在本机 docker 构建 + 打 tag，
# 不推送到任何远程 registry——选哪个 registry、要不要公开发布是仓库所有者的决定，不在此脚本内。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BUNDLE="packages/cli/dist/pipeline.mjs"
if [ ! -f "$BUNDLE" ]; then
  echo "缺 $BUNDLE —— 先跑 npm run build" >&2
  exit 1
fi

VARIANT="${1:-local}"
case "$VARIANT" in
  local)
    # 生产默认镜像（pipeline afk run 不传 --image 时用它）：装真 Claude Code CLI，供真 agent 编码。
    TAG="sandcastle:local"
    BUILD_ARG="WITH_CLAUDE_CODE=true"
    ;;
  test)
    # 确定性测试镜像（committed integration tests 用它）：不装 agent 层，构建快、无需 token 也能验证沙箱执行链路。
    TAG="sandcastle:test"
    BUILD_ARG="WITH_CLAUDE_CODE=false"
    ;;
  *)
    echo "用法: $0 [local|test]（默认 local）" >&2
    exit 1
    ;;
esac

echo "构建 ${TAG}（--build-arg ${BUILD_ARG}）..."
docker build -f tools/sandcastle/Dockerfile -t "$TAG" --build-arg "$BUILD_ARG" "$REPO_ROOT"
echo "完成：$TAG"
