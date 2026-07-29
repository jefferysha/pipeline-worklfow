# 提案

## Why

Tenon 已能把单个 Change 关联到最近一次终端会话，但用户在切换 Codex、Claude、OpenCode 或 Pi 后，
无法从 Dashboard 找回同一项目里与当前任务相关的历史讨论，只能离开页面运行 `tenon mem search`。
本 Change 让任务详情成为一个安全、只读的相关会话入口。Explore 已确认采用用户显式提交、
项目受限、资源有界且不写回的设计。

## What Changes

- 在 Dashboard 任务详情中提供显式触发的项目内相关会话检索。
- 增加受 Host/token/content-type 保护的只读 POST API，并复用现有 kernel mem 搜索能力。
- 覆盖中英文、加载、空结果、错误和键盘提交路径。
- 不写入或迁移宿主会话历史，不增加全局搜索，不自动发送查询。

## Capabilities

### New Capabilities

- `related-session-memory`：在当前项目范围内按关键词检索跨宿主会话，并在任务详情展示可审查结果。

### Modified Capabilities

无。

## Impact

影响 `packages/kernel/src/mem` 的有界读取用例、`packages/server` 的只读 POST 契约，以及
`packages/dashboard-app` 的 API、独立组件和 i18n。不新增依赖，不改变现有 session-link、
canonical Change 状态或宿主会话文件。
