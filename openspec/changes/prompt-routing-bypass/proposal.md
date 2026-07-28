# 提案

## Why

Tenon 的 UserPromptSubmit 路由会在开发提示中自动注入治理上下文，但用户缺少一个可审计的单轮旁路入口；在临时讨论、粘贴外部指令或排查路由本身时，只能关闭整个 Hook，影响范围过大。固定版本的上游参考 A 已验证“独立 keyword 只抑制当前 turn”的用户价值，Tenon 仍缺少 API 与 Dashboard 闭环。

## What Changes

- 新增项目级、可配置的单轮路由旁路词：默认 `no-tenon`，ASCII 独立边界、大小写不敏感，空字符串禁用。
- Dashboard 提供读取、编辑、禁用与错误恢复入口；Hook 仅在独立词边界命中时跳过本轮路由/面包屑注入。
- 不关闭安全门、不改变 Change 状态、不绕过 review/confirm，也不把旁路扩展到其他 Hook。

## Capabilities

### New Capabilities

- `prompt-routing-bypass`：项目级单轮提示路由旁路。

### Modified Capabilities

无。

## Impact

影响 `hooks/prompt-intent.sh`、`router.sh`、`breadcrumb.sh`、server Hook 配置/API、Dashboard Hook 数据流与中英文文案。旧 `.pipeline/hooks.json` 无需迁移；缺字段回退默认值，不引入依赖。
