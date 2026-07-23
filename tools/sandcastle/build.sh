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
    # 生产默认镜像：双 agent 层齐备，测试 fallback 显式关闭。
    TAG="sandcastle:local"
    BUILD_ARGS=(
      --build-arg "WITH_CLAUDE_CODE=true"
      --build-arg "PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=0"
    )
    ;;
  test)
    # 仅测试镜像：显式关闭 agent 层并显式开启带 execution_mode 的 deterministic fallback。
    TAG="sandcastle:test"
    BUILD_ARGS=(
      --build-arg "WITH_CLAUDE_CODE=false"
      --build-arg "PIPELINE_TEST_ALLOW_DETERMINISTIC_FALLBACK=1"
    )
    ;;
  *)
    echo "用法: $0 [local|test]（默认 local）" >&2
    exit 1
    ;;
esac

echo "构建 ${TAG}（${BUILD_ARGS[*]}）..."
docker build -f tools/sandcastle/Dockerfile -t "${TAG}" "${BUILD_ARGS[@]}" "$REPO_ROOT"

# 镜像 ↔ 仓库脚本版本对账（真机验收 P1，2026-07-11）：host 侧 runner
# （packages/automation/src/runner/runner.ts 的 AFK_RUN_SCRIPT_SHA256 + buildAfkRunCommand 前置守卫）
# 在每次 run 前核对镜像内 /usr/local/bin/pipeline-afk-run 的 sha256，不符则 exit 95 硬错误。
# 这里构建完当场自验一次，陈旧层缓存/错构建当场可见，而不是留到 run 时才炸。
REPO_AFK_SHA="$( (sha256sum tools/sandcastle/pipeline-afk-run.sh 2>/dev/null || shasum -a 256 tools/sandcastle/pipeline-afk-run.sh) | awk '{print $1}')"
REPO_CLI_SHA="$( (sha256sum "$BUNDLE" 2>/dev/null || shasum -a 256 "$BUNDLE") | awk '{print $1}')"
IMAGE_AFK_SHA="$(docker run --rm --entrypoint sha256sum "${TAG}" /usr/local/bin/pipeline-afk-run | awk '{print $1}')"
IMAGE_CLI_SHA="$(docker run --rm --entrypoint sha256sum "${TAG}" /opt/pipeline/packages/cli/dist/pipeline.mjs | awk '{print $1}')"
IMAGE_ATTESTATION="$(docker run --rm --entrypoint cat "${TAG}" /opt/pipeline/image-attestation.env)"

if [ "${REPO_AFK_SHA}" != "${IMAGE_AFK_SHA}" ] || [ "${REPO_CLI_SHA}" != "${IMAGE_CLI_SHA}" ]; then
  echo "对账失败：仓库/镜像实际 sha 不一致（afk ${REPO_AFK_SHA}/${IMAGE_AFK_SHA}；cli ${REPO_CLI_SHA}/${IMAGE_CLI_SHA}）" >&2
  exit 1
fi
if ! grep -qx "pipeline_afk_run_sha256=${IMAGE_AFK_SHA}" <<<"${IMAGE_ATTESTATION}" \
  || ! grep -qx "pipeline_cli_dist_sha256=${IMAGE_CLI_SHA}" <<<"${IMAGE_ATTESTATION}"; then
  echo "对账失败：镜像 /opt/pipeline/image-attestation.env 与镜像实际字节不一致" >&2
  exit 1
fi
echo "完成：${TAG}（afk sha256=${IMAGE_AFK_SHA}；cli sha256=${IMAGE_CLI_SHA}；attestation 已复核）"
echo "提醒：host 侧须把当前 CLI digest 传给 runner.ts 的 ImageRunExpectation，运行守卫才会执行 host↔image CLI 对账。"
