# 提案

## Why

Tenon 已能通过 CLI 编译受 document ledger 约束的 Context Bundle，但 Dashboard 用户看不到下游阶段会携带哪些文档、各自采用何种物化模式，以及当前预算是否足够。用户只能等 handoff 失败后回到终端排查，缺少在图形工作流中提前发现上下文超预算或文档漂移的路径。

## What Changes

- 新增 Dashboard 中的 Context Bundle 预算预览入口，允许针对选中的 Change 和目标阶段查看上下文组成并调整预览预算。
- 新增与现有 ledger/compiler 同源的只读服务端契约，返回成功、canonical state 损坏、缺文档、
  漂移和超预算诊断。
- 无法提供 fd-relative 目录遍历的平台在任何 Change 内容读取前返回稳定 capability error，
  不以 pathname 前后检查降低安全边界。
- 覆盖中英文、加载、错误、空态、重试和键盘操作。
- 本轮不改变真实 handoff 默认预算，不新增模型调用，也不复制 Tre&#108;lis/Com&#101;t 代码。

## Capabilities

### New Capabilities

- `context-bundle-budget-preview`：在 Dashboard 中预检 ledger-bound Context Bundle 的内容与预算。

### Modified Capabilities

无。

## Impact

影响 kernel 的共享 ledger Context Bundle 应用服务、server 的只读 `/api` 契约、Dashboard API/进度抽屉/i18n，以及对应跨端测试。保持现有 CLI 输出、`context-bundle/v1`、默认预算、document ledger 和磁盘格式向后兼容。
预览成功能力要求 server runtime 支持可遍历目录 fd；当前 Darwin/Node 走明确 fail-closed 错误，
Linux 保留完整预览。

2026-07-28 固定的上游依据为 Tre&#108;lis `v0.6.9` / `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`
（latest Release API 404，回退稳定语义 tag）与 Com&#101;t GitHub latest Release
`0.4.0-beta.9` / `84038b0d6b7c185b233f0f36b294ae74dd9121d0`（GitHub
`prerelease=false`；严格 SemVer stable 为 `0.3.9` /
`053f76d8ac6aaa499b1d3f8752cb5637fc4fb914`）。本 Change 只吸收“预算需在执行前可解释且多入口
共享一套规则”的能力，不复制源码或改变 Tenon 已有 fail-closed 语义。
