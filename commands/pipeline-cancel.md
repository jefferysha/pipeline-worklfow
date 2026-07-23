---
name: "Pipeline: Cancel"
description: 终止运行中的 AFK 任务——落取消标记 + docker kill 沙箱容器（pipeline afk cancel <change>）
category: Workflow
tags: [workflow, pipeline, afk, automation, cancel, hitl]
---

# /pipeline-cancel — 终止

人的四个动作之一（继续/打回/重试/终止）里的**终止**。取消一个**正在 AFK 沙箱里跑**的 change，
等价于底层 `pipeline afk cancel <change>`（= dashboard 的 POST /api/afk/:name/cancel 终端等价）。

实现真相源：`packages/cli/src/commands/afk.ts` 的 `cancel` 分支，语义对齐 server
`packages/server/src/afk.ts::cancelAfkRun`——**先落取消标记文件**（worktree 根的 `.cancel-requested`，
复用 automation 单一常量 `CANCEL_MARKER_FILE`）**再 docker kill 沙箱容器**。标记先于 kill 到场，
`runChangeInSandbox` 结算时探到标记就抛 `CancelledRunError`，不会被误判成瞬态失败自动重排。

**输入**：`/pipeline-cancel` 后跟 change 名（如 `/pipeline-cancel add-auth`）。省略则先定位。

## 执行步骤（在仓库根跑 CLI）

1. **定位 change**：给了名字直接用；否则 `pipeline afk status` 看 `running` 泳道里的 change，不确定让用户拍板。
2. **执行终止**：`pipeline afk cancel <change>`（可加 `--json`）。

## 退出码语义 / 诚实门

- **exit 0 + `[AFK] <change> 已取消：取消标记已落 + docker kill <容器>`**：取消标记已落、容器已 kill。
- **exit 3 + `不是 running`**：该 change 的 `automation` 不是 `running`（没有运行中的 job 可取消）——
  非错误，只是无事可做。要重排跑请用 `/pipeline-retry`。
- **exit 1**：change 不存在 / 缺 `automation_worktree`·`automation_sandbox` 字段（无法定位容器）/
  worktree 目录已被清理落不下标记。stderr 逐条说明。
- **docker 不可用（诚实门，仍 exit 0）**：取消标记**照落**（取消意图已记录），但 `docker kill` 跳过，
  stderr 明示「未检测到 docker daemon，不伪装已 kill」。容器若仍在别处跑，会在其结算时读到标记转
  `CancelledRunError`。`--json` 下 `killed:false, reason:docker-unavailable`。

## 边界

- 本命令**只**动 AFK 沙箱运行态（`.cancel-requested` 标记 + docker kill），**不触** barrier / 三门 /
  build_sha / git commit。取消不改 change 的相位——沙箱结算后 automation 状态由 automation 侧收敛。
