# 提案

## Why

PR #8 提供 Host Target Plan Center，但它基于 `main@15fe619b`，当前 `main@4c242b92` 已前进 55 个提交，且该 PR 同时改变 CLI、server API 与 Dashboard。预合并已确认 4 个内容冲突；合并前必须在当前主线重新证明契约兼容、安全边界、前后端架构和真实 UI 质量，修复所有发现后才能进入 `main`。

## What Changes

- 为 PR #8 建立独立合并审计 Change，固定 PR head `942520bb`、当前 `main`、规则和持续授权边界。
- 普通合并当前主线后审查并修复 Host Target Plan 的 CLI、只读 server API、Dashboard 交互、文档与生成物。
- Dashboard 强制执行 `design-taste-frontend`、真实浏览器、响应式、主题、语言、键盘与可访问性验收。
- 只有精确 head CI、独立验证、GitHub 评论审计和合并后 `main` CI 全部通过才合并。
- 本 Change 不复用原 Change 的 verification pass；原证据只作为风险输入。

## Capabilities

### New Capabilities

- `host-target-plan`：为已注册宿主提供零副作用 catalog/计划契约，并通过严格只读 API 和 Dashboard copy-only 预览呈现。

### Modified Capabilities

无。现有 `plugin-distribution`、`plugin-runtime` 与 Dashboard requirements 是约束来源；若 Build 证明它们的 requirement 必须变化，将通过 `requirements-changed` 回 Spec。

## Impact

影响 `packages/cli`、`packages/server`、`packages/dashboard-app`、生成分发资产、OpenSpec 与用户文档。主要风险是只读计划与当前事务化 setup/update/runtime 语义漂移、本机 HTTP 输入面扩大、三层 DTO 真相重复、全局 child 串行队列、旧主线集成冲突和 Dashboard IA/视觉/交互退化。PR 未改依赖 manifest/lock，不引入运行时依赖。
