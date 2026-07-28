# Loop 路径策略预检提案

## Why

Tenon 已能在无人值守 Loop 结算时执行路径白名单与黑名单，但用户在运行前无法从 Dashboard 验证一组计划路径会被允许还是拒绝。错误策略通常要到保留冲突 worktree 时才暴露，反馈过晚且难以解释。Trellis 的路径作用域规则可见性与 Comet 的 include/exclude baseline 政策进一步证明，用户需要在具体路径进入执行链之前获得可行动、可解释的边界反馈。

## What Changes

- 新增一个只读、无缓存的 Loop 路径策略预检能力，并在 Workbench 的现有 Loop 卡片中提供入口。
- 对用户提交的有界 canonical 项目相对路径逐条返回允许或拒绝结果、稳定 reason 与命中的首个真实 pattern。
- 覆盖加载、空输入、成功、拒绝、服务端失败和重试路径，并提供中英文界面。
- 判定复用 kernel ConstraintPolicy 与 automation 生产 matcher；前端不复制 glob。
- 本 Change 不执行 Loop、不修改策略、不缓存或写 canonical state，也不改变现有 merge gate。

## Capabilities

### New Capabilities

- `loop-scope-preview`

### Modified Capabilities

无。

## Impact

影响 Loop 约束的共享解释投影、Dashboard server 的受保护无副作用 POST、Workbench API client/组件与 i18n。保持 Node 22/npm workspace、既有 Loop YAML、allowlist/denylist 语义和自动化执行路径兼容，不新增运行时依赖或持久化格式。Trellis 为 AGPL-3.0、Comet 为 MIT；本 Change 只提炼设计依据，不复制上游实现。
