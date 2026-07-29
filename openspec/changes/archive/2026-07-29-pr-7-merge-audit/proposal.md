# 提案

## Why

PR #7 在旧版 `main` 上实现了 Context Bundle 预算预览，但当前目标分支已经前进且 GitHub 报告冲突。合并前必须在独立 Change 中重新核对真实需求、架构、安全、Dashboard 体验和全部验证证据，避免把旧基线上的治理记录或生成物直接当作当前结论。

## What Changes

- 审计并在最新 `main` 上重放 PR #7，解决冲突但不削弱现有契约或门禁。
- 覆盖 Context Bundle 预算计算、可信读取、server/API、CLI/分发与 Dashboard 预览的前后端调用链。
- Dashboard 强制执行 `design-taste-frontend`、响应式、明暗主题、中英文、默认七阶段标签本地化、
  custom workflow 作者标签保留、键盘/焦点、ARIA、错误/空/加载状态和真实浏览器验收。
- 通过完整 Change、代码/架构/安全审查、全量测试、真实浏览器/E2E、精确 PR CI 和 main CI 后才允许合并。
- 非目标：新增未由 PR #7 或修复结论要求的产品能力；修改自动化周期配置；绕过 review、confirm、CI 或发布安全门禁。

## Capabilities

### New Capabilities

无。本产品能力相对 `origin/main` 仍是 PR #7 引入的新能力，但其 requirement 已随原 PR 的归档证据
落入 canonical spec；本审计 Change 不得把这些既有 requirement 重复声明为 `ADDED`。

### Modified Capabilities

- `context-bundle-budget-preview`：完整修改五条已落盘的 requirement，并新增一条 Context Bundle
  preview 与 Verify Evidence 共存 requirement；继续保持 `context-bundle/v1`、确定性 bundle/CLI
  与既有 `context-bundle-handoff` 行为兼容。

## Impact

影响 kernel 的 Context Bundle/ledger 应用服务与 canonical revision 读取、server 的 fd-relative
可信读取和 `GET /api/context-bundle/preview`、CLI handoff adapter/分发 bundle、Dashboard API
decoder/进度抽屉/国际化、测试与 OpenSpec/合同文档。不新增依赖、写端点、持久化字段或数据迁移；
必须保留最新 main 的 verification evidence composer 与全部 canonical 安全检查。
