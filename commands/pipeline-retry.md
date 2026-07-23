---
name: "Pipeline: Retry"
description: 重试/重新入队 AFK 任务——pipeline afk enqueue <change>（不是 run，run 忽略 name 跑整轮）
category: Workflow
tags: [workflow, pipeline, afk, automation, retry, hitl]
---

# /pipeline-retry — 重试

人的四个动作之一（继续/打回/终止/重试）里的**重试**。把一个 change 重新挂进 AFK 就绪队列，
等价于底层 `pipeline afk enqueue <change>`。

实现真相源：`packages/cli/src/commands/afk.ts` 的 `enqueue` 分支（`auto.enqueue(name)`）。
对标 dashboard 的 POST /api/afk/:name/retry（server 端 `retryAfkRun` 是 CAS `automation→queued` +
清零 `automation_attempts`）。CLI 侧的重新入队走 `enqueue`——把 change 挂回 `queued`，等下一轮 run 认领。

**输入**：`/pipeline-retry` 后跟 change 名（如 `/pipeline-retry add-auth`）。省略则先定位。

## 执行步骤（在仓库根跑 CLI）

1. **定位 change**：给了名字直接用；否则 `pipeline afk status` 看 `failed`/`conflict`/`paused` 泳道里
   要重试的 change，不确定让用户拍板。
2. **重新入队**：`pipeline afk enqueue <change>`（可加 `--json`）。**务必用 `enqueue`，不是 `run`**——
   `run` 忽略 name 参数、跑的是整轮就绪队列（对齐 `packages/cli/src/commands/afk.ts` 的 run 分支：
   扫全队列而非单 change）。

## 退出码语义 / 诚实约束

- **exit 0 + `已挂队（automation=queued，默认 L1 report-only）`**：已挂回就绪队列。
- **exit 3 + `未挂队`**：非 spec-complete / PM 轨 / 已在队 / 未 opt-in（`auto.enqueue` 判据）——非错误，
  只是不满足入队条件。
- **exit 1**：change 名非法或其它错误（stderr 说明）。

- **入队 ≠ 真跑**：`enqueue` 只把 change 挂回 `queued`。真正在沙箱里重跑要有 **docker daemon** 且再跑一轮
  `pipeline afk run`（run 需 docker + 在 git 仓非 detached HEAD；无 docker → 诚实报告就绪队列、不伪装已执行，
  见 afk.ts run 分支的诚实门）。默认 **L1 report-only**（成功也只停 paused、不自动 merge），升档走 loops graduation。
- **运行中的任务先终止再重试**：若 change 正 `running`，应先 `/pipeline-cancel` 再 `/pipeline-retry`
  （server `retryAfkRun` 对 running 直接拒：「running 请先 cancel」）。
