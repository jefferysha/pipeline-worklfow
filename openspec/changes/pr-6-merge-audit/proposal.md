# 提案

## Why

PR #6 已交付验证证据编排器，但它基于较早的 `main`，在 PR #5 合并后已产生冲突。合并前需要
以最新 `origin/main` 与 PR head 的三点 diff 为固定边界，独立复核前后端契约、架构、错误路径、
真实测试和浏览器行为，并修复所有阻断问题。

## What Changes

- 对 PR #6 的 kernel formatter、无状态 compose API、Dashboard Verify-only 编排器和治理文档
  做全量合并审计。
- 在 Build 阶段纳入最新 `main`，用非强制 push 解决冲突，并仅做审计发现要求的最小修复。
- 重新运行匹配风险的全仓、前后端、真实 HTTP、浏览器和 GitHub CI 门禁。
- 非目标：扩大编排器为命令执行器、持久化 verification report、放宽既有 Verify 信任门或发布 npm。

## Capabilities

### New Capabilities

- 无。PR #6 的 `verification-evidence-composer` 已由原 Change 定义，本审计不创造第二套能力。

### Modified Capabilities

- `verification-evidence-composer`：保持既有五项产品需求，补充与最新 main 的共享 Dialog、
  motion、生成物和重新冻结验证兼容要求。

## Impact

影响 `packages/kernel`、`packages/server`、`packages/dashboard-app`、CLI/server/dashboard
生成物、OpenSpec 与治理文档。审计必须同时遵守前端与后端规则，保持 API 兼容、root/Host/token/
content-type 守卫、无状态边界、i18n、键盘/ARIA/响应式/reduced-motion 和生成物新鲜度。

Explore 已确认两个文本冲突：共享 `Dialog.tsx` 必须语义合并本地化标签、topmost Escape
隔离与 Lucide `X`；`dist/index.html` 必须在源代码合并后重建。GitHub 当前无 review
或 thread，旧 head CI 成功但 PR 因最新 main 标记为 conflicting。
