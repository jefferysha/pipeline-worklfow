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
docker build -f tools/sandcastle/Dockerfile -t "${TAG}" --build-arg "${BUILD_ARG}" "$REPO_ROOT"

# 镜像 ↔ 仓库脚本版本对账（真机验收 P1，2026-07-11）：host 侧 runner
# （packages/automation/src/runner/runner.ts 的 AFK_RUN_SCRIPT_SHA256 + buildAfkRunCommand 前置守卫）
# 在每次 run 前核对镜像内 /usr/local/bin/pipeline-afk-run 的 sha256，不符则 exit 95 硬错误。
# 这里构建完当场自验一次，陈旧层缓存/错构建当场可见，而不是留到 run 时才炸。
REPO_SHA="$( (sha256sum tools/sandcastle/pipeline-afk-run.sh 2>/dev/null || shasum -a 256 tools/sandcastle/pipeline-afk-run.sh) | awk '{print $1}')"
IMAGE_SHA="$(docker run --rm --entrypoint sha256sum "${TAG}" /usr/local/bin/pipeline-afk-run | awk '{print $1}')"
if [ "${REPO_SHA}" != "${IMAGE_SHA}" ]; then
  echo "对账失败：镜像内 pipeline-afk-run（${IMAGE_SHA}）不等于仓库脚本（${REPO_SHA}）——构建缓存异常？" >&2
  exit 1
fi
echo "完成：${TAG}（pipeline-afk-run sha256=${IMAGE_SHA}，已与仓库脚本对账一致）"
echo "提醒：host 侧 runner.ts 的 AFK_RUN_SCRIPT_SHA256 须与该 sha 一致（由 runner.test.ts 同步测试钉住）"
