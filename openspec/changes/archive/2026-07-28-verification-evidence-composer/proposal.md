# 提案

## Why

Tenon 的 Verify 报告要求记录真实命令、结果、失败与风险，但 Dashboard 目前只能展示文档，用户需要手工组织验证证据，容易遗漏状态、空态或跳过原因。本 Change 为执行验证的开发者和 reviewer 提供一个结构化证据编排入口。

## What Changes

- 新增一个由服务端统一校验和格式化的验证证据契约，并在 Dashboard 的 Change 详情中提供可操作入口。
- 覆盖加载、成功、失败、空态、复制与键盘路径，并提供中英文界面。
- 本轮不自动执行命令、不修改 canonical verification report，也不改变 Verify gate；详细字段和交互在 Explore 验证后确定。

## Capabilities

### New Capabilities

- `verification-evidence-composer`：把结构化验证记录转换为稳定、可复制的 Markdown 证据片段。

### Modified Capabilities

无。

## Impact

影响 kernel 中与可信 `VerificationResult` 分离的无状态草稿格式化器、受既有 POST 守卫与 registered-root 校验保护的 Dashboard API、Verify 阶段 Change 详情交互、i18n 与对应测试。现有状态、文档 ledger、持久化格式、可信验证契约与 Verify gate 保持向后兼容。

## Explore Evidence

- 上游 A `main` 与最新语义版本 tag `v0.6.9` 固定到 `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`；GitHub 无 Release，已明确回退到 tag。其结构化 session 段落提供“显式字段、空段省略”的输入依据。
- 上游 B `master` 固定到 `2945693e4061c369be0d400ed2999a66fa87c680`，最新 release `0.4.0-beta.9` 固定到 `84038b0d6b7c185b233f0f36b294ae74dd9121d0`；其 acceptance evidence 提供闭集字段、skip/result 互斥、预算与 canonical serialization 依据。
- 选择“共享 kernel 格式化器 + 受保护无状态路由 + Verify-only Dashboard Dialog”，拒绝浏览器内重复协议和自动写 report 两种方案。
