# 提案

## Why

Skill 是否自主拆分、何时询问用户、是否进入 AFK/全默认推荐模式，以及可以拆到 WorkItem 还是 Child Pipeline，目前不能在 Workflow 定义中明确配置和冻结。

## What Changes

为 Workflow 增加版本化 decomposition policy、interaction policy、权限交集、安全 API 与 Dashboard 配置闭环。拆分支持 off、suggest、auto-safe、require-review；互动支持 interactive、recommended-defaults、afk。默认推荐模式不询问例行选择，但不能越过安全、费用、生产、外部副作用或缺少授权的硬边界。Dashboard 通过现有完整 Workflow definition compiler/lock/atomic publication 路径编辑策略，并提供中英文与 loading/empty/error 状态。本 Change 同时修复 stable bootstrap/runtime 未把已验证 Codex plugin cache 身份传递给当前 turn receipt bridge 的产品缺陷，并增加正式 stable 路径回归；不在本 Change 中实现调度执行。

## Capabilities

### New Capabilities

`workflow-decomposition-policy`

### Modified Capabilities

`workflow-definition`

`codex-skill-receipt-current-turn`

## Impact

影响 Workflow YAML/codec、冻结 plan fingerprint、server DTO、Dashboard 配置面、stable Codex receipt bridge 与默认兼容语义；旧 Workflow 缺省为关闭自动拆分。
