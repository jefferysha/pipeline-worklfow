# 提案

## Why

PR #5（`Overhaul Dashboard UI/UX system`）包含大范围前端设计系统与交互变更。原功能 Change 已归档，不能直接充当本轮合并门禁证据；在将其并入最新 `main` 前，需要一个独立、可追溯的合并审计 Change，证明三点 diff、规则/架构、真实验证、GitHub CI 与回滚边界均满足仓库要求。

## What Changes

- 以 `origin/main`、PR #5 base 与最新 head 的三点 diff 为唯一审计范围。
- 复核前端分层、类型安全、状态归属、i18n、可访问性、响应式、主题与 reduced-motion，并检查跨端契约和生成产物同步。
- 对已发现且可在 PR 范围内安全修复的问题补最小代码与测试；没有问题时不制造无关改动。
- 运行与风险匹配的本地验证、真实 Tenon Dashboard 浏览器验收和 GitHub 合并门禁。
- 在证据完整后更新 PR、合并并记录 merge SHA；若出现必需检查失败、未解决审阅或不可安全修复的问题，则保留 PR 并记录 blocker。
- 非目标：本 Change 不引入 PR #5 之外的新产品能力，不发布 npm 包，不部署生产环境，也不绕过任何 GitHub 或 Tenon 门禁。

## Capabilities

### New Capabilities

无。本 Change 只提供 PR #5 的独立合并审计与必要修复。

### Modified Capabilities

`dashboard-ui-ux-system` 的需求语义保持不变。Explore 发现的修复都用于让实现重新满足既有约束：

- 把 `max-[720px]` 的排他边界改成真正包含 720px 的 `mobile` 变体。
- 补齐捕获记录加载态的中英文文案。
- 把进度抽屉关闭动画改为既有 motion 规范要求的 ease-out。
- 刷新仍展示旧视觉语言的官方进度页截图。

## Impact

审计覆盖 PR #5 修改的 Dashboard 源码、样式、测试、i18n、构建产物、设计/验证文档与已归档 OpenSpec 证据。三点 diff 与架构检查确认没有公共 API、后端持久化或依赖变化；修复仅提交到 PR #5 head，不改变发布行为。
