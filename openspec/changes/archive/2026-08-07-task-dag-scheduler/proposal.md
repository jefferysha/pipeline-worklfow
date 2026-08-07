# 提案

## Why

现有执行队列不能基于 WorkItem 依赖和资源写冲突推导安全并行波次，也不能明确传播重试、失效和父任务集成状态。

## What Changes

新增纯领域 DAG 调度器、资源冲突序列化、状态传播、AFK admission、稳定只读状态投影与可解释阻断结果。AFK 只执行已冻结且证据/授权完整的计划；recommended-defaults 可处理例行决策，硬确认点仍失败关闭。范围不负责生成任务计划，但负责 `task-run/v1` API 与 Dashboard 消费闭环，使用户能够查看波次、并行度、attempt、validator、失效链和 blocker，并在服务端授权范围内执行 retry/cancel/resume。

## Capabilities

### New Capabilities

`task-dag-scheduler`

### Modified Capabilities

无。

## Impact

影响 kernel task graph、automation admission/scheduling、server `task-run/v1` API 与 Dashboard AFK 运行视图；默认不开启新调度路径，旧运行保持现有行为。写端点继续受注册 root、Host、token、content-type、权限与 expected identity/state 约束。
