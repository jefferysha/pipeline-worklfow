# 提案

## Why

Issue #44 的第二次也是最后一次 Review 已确认：多个 provenance Bash 委托路径只传递冻结的 Node pathname，未在紧邻 spawn 前重放其物理绑定。该 Review 预算已永久耗尽，因此必须用独立且有界的 #63 remediation Change 关闭这一唯一阻断，同时完整保留 #44 的失败审计。

## What Changes

- 在 package、update、release-store、setup 与 doctor 的 provenance verifier spawn 边界，紧邻 spawn 复验 Bash 与 Node 两份冻结物理绑定。
- Node 或 Bash 发生漂移时，在任何 child process、host mutation、activation、Dashboard 启动或 ready evidence 前失败关闭。
- 增加 proof-before-spawn 顺序与 Node drift 负向测试，并重建受控 CLI dist。
- 非目标：不处理 #44 报告中的其他四个 finding，不重置或覆盖 #44 Review 2/2，不改变现有 provenance registry 公共契约，不合并或发布产物。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-distribution`：强化既有“可执行工具冻结 SHALL 绑定文件身份与可信路径链”要求，明确 provenance Bash 委托 Node 时的复合 immediate pre-spawn replay、失败顺序与兼容边界。

## Impact

影响限于 `packages/cli` 的原生 host command binding、packaged assets、update candidate、release store、setup/doctor 装配、相邻测试与 tracked `dist/tenon.mjs`。保持 v1.0.1/v1.0.2 与 provenance registry 兼容，不引入新依赖或新的公共 registry/schema；共享 binding、Doctor 提取边界和定向验收矩阵已由 Explore 冻结。
