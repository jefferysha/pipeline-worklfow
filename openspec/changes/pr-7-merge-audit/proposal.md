# 提案

## Why

PR #7 在旧版 `main` 上实现了 Context Bundle 预算预览，但当前目标分支已经前进且 GitHub 报告冲突。合并前必须在独立 Change 中重新核对真实需求、架构、安全、Dashboard 体验和全部验证证据，避免把旧基线上的治理记录或生成物直接当作当前结论。

## What Changes

- 审计并在最新 `main` 上重放 PR #7，解决冲突但不削弱现有契约或门禁。
- 覆盖 Context Bundle 预算计算、可信读取、server/API、CLI/分发与 Dashboard 预览的前后端调用链。
- Dashboard 强制执行 `design-taste-frontend`、响应式、明暗主题、中英文、键盘/焦点、ARIA、错误/空/加载状态和真实浏览器验收。
- 通过完整 Change、代码/架构/安全审查、全量测试、真实浏览器/E2E、精确 PR CI 和 main CI 后才允许合并。
- 非目标：新增未由 PR #7 或修复结论要求的产品能力；修改自动化周期配置；绕过 review、confirm、CI 或发布安全门禁。

## Capabilities

### New Capabilities

- `context-bundle-budget-preview`：在不改变 `context-bundle/v1` 的前提下，提供共享 ledger compiler、
  只读可信 API 和 Dashboard 预算预览。

### Modified Capabilities

无。现有 `context-bundle-handoff` 继续作为确定性 bundle/CLI 兼容能力；本 Change 对其实现做共享服务
抽取，但不得改变既有 requirement 语义。

## Impact

影响 kernel 的 Context Bundle/ledger 应用服务与 canonical revision 读取、server 的 fd-relative
可信读取和 `GET /api/context-bundle/preview`、CLI handoff adapter/分发 bundle、Dashboard API
decoder/进度抽屉/国际化、测试与 OpenSpec/合同文档。不新增依赖、写端点、持久化字段或数据迁移；
必须保留最新 main 的 verification evidence composer 与全部 canonical 安全检查。
