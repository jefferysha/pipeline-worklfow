# ADR: PR #6 最新 main 合并策略

- Status: Accepted
- Date: 2026-07-28
- Change: `pr-6-merge-audit`

## Context

PR #6 的功能 Change 已归档且旧 head CI 成功，但 PR #5 合并后，PR #6 与最新 `main`
在 Dashboard 生成 HTML 和共享 `Dialog` 上冲突。审计确认 formatter、受保护 API 和
Verify-only UI 的产品边界仍然有效；冲突来自并发共享 UI 演进，而不是需求变化。

## Decision

- 在 Build 以普通 merge commit 纳入最新 `origin/main`，不 rebase、不强推、不重放到新 PR。
- `Dialog` 冲突采用语义并集：保留 PR #6 的本地化 `closeLabel` 和 topmost Escape
  事件消费，同时采用最新 main 的 Lucide `X` 图标与样式。
- 自动合并的 progress drawer 同时保留嵌套 modal 键盘让渡与最新 main 的 ease-out
  关闭缓动，并用组件测试及真实浏览器复核。
- `dist/index.html`、Dashboard assets、server/CLI bundle 只通过正式构建刷新，不手工合并。
- 原 Change 验证只作回归输入；最新 main 上重新冻结并执行 reviewer、Codex、E2E、
  视觉、OpenSpec 与 GitHub CI 门禁后才允许合并。

## Consequences

- PR 历史与已归档 Change 身份保持可追溯，避免 force push。
- merge commit 会增加一条明确的集成提交，但冲突决策可独立审阅并安全 revert。
- 构建生成物会出现机械变更；新鲜度检查和真实页面身份验证负责证明它们来自正确源码。
- 若 Build 发现产品语义必须变化，当前决策失效，Change 必须通过
  `requirements-changed` 返回 Spec。
