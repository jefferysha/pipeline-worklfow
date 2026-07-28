# 提案

## Why

Tenon 已经提供面向单一宿主的 setup/update 参数，但用户缺少一个在执行前选择目标、理解影响并预览准确命令的统一入口。本 Change 先建立只读计划能力，降低误选宿主或误触写操作的风险。

Explore 已确认：当前 `TENON_HOSTS` 是 setup/update 共用白名单，native/adapter 与 native command plan 已有明确 owner；Dashboard server 也已有通过 argv 数组调用 CLI bundle 的窄端口。因此本 Change 应补结构化只读计划，而不是新建第二套宿主注册表。

## What Changes

- 新增“宿主目标计划中心”，把现有宿主 setup/update 选项投影为稳定、可校验的只读计划。
- 新增 `host-target-plan/v1` CLI JSON 契约及严格只读 Dashboard API。
- Codex 的 setup/update 计划包含真实流程中的只读登录状态检查与认证引导；Claude 和 adapter 保持各自现有编排。
- Dashboard 支持选择宿主与操作，并展示加载、空态、错误态、命令和步骤预览。
- 用户可见文本提供中英文。
- P1 只接受已注册 `TENON_HOSTS`，不接受 custom target、任意路径或 `.foo`。
- 本 Change 不执行真实 setup/update；Trellis 仅 clean-room 借鉴公开思想，不复制 AGPL-3.0 或未发布实现。

## Capabilities

### New Capabilities

- `host-target-plan`：为受支持宿主和操作生成零副作用的计划预览，并通过 Dashboard 展示。

### Modified Capabilities

无。

## Impact

影响 CLI 相邻宿主计划模块、Commander 装配与 bundle，Dashboard server 的 GET 路由/CLI adapter，Dashboard API client/decoder、独立 hostPlan 功能域、外壳导航、i18n 与相邻测试。现有 setup/update 路径、flags、Host/token/root 安全模型和 adapter registry 保持兼容。
