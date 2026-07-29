# 提案

## Why

Dashboard 当前只显示文档证据的汇总状态，开发者无法看出某份产物由哪个技能登记、何时登记或何时被当前阶段读取；当推进被文档契约阻断时，排障需要回到本地 ledger 或命令行。

## What Changes

为受治理 Change 的 snapshot 增加可审计的文档回执时间线投影，并在 Dashboard 详情展示登记者、登记时间和当前阶段的最近阅读时间。保持只读，不新增写端点，也不改变 ledger 或 transition 语义。

## Capabilities

### New Capabilities

`document-evidence-timeline`：让 Dashboard 以稳定、可验证的时间线解释文档登记和读取回执。

### Modified Capabilities

无。

## Impact

影响 `@tenon/server` snapshot DTO 与 `@tenon/dashboard-app` 的只读契约镜像和 Change 详情。旧 server 响应仍可被前端安全降级；不引入依赖、不改持久化格式。
