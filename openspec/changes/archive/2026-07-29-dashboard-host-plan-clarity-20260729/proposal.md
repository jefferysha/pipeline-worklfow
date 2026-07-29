# 提案：Host Plan 桌面信息清晰度

## Why

Host Plan 是开发者在执行宿主安装或更新前确认目标、范围、命令和副作用的桌面决策面。当前批次需要在不改变后端契约的前提下，验证并改善 1024–1920px 桌面视口中的信息层级、扫描效率和操作反馈，降低用户选错宿主或误读计划的风险。

## What Changes

- 在 Explore 阶段以真实桌面浏览器审计 Host Plan 的成功、加载、错误、空态、键盘和明暗主题体验。
- 在 Spec 阶段把审计结论收敛为一组连贯、可验证、与开放 PR 尽量无重叠的 UI/UX 改动。
- 实现只限 `packages/dashboard-app/src/hostPlan/*` 及其必要测试与中英文文案；是否确需触碰其他文件须由 Explore 证据决定。
- 非目标：手机端设计、手机端截图、触控目标优化、后端/API/数据模型变化、执行真实安装或更新命令。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `host-target-plan`：补充 Dashboard 电脑端宿主目录扫描密度、已选宿主详情层级和四视口验收要求。

## Impact

预期影响 Dashboard Host Plan 前端组件、相邻 Vitest 与中英文文案。保持现有 `host-target-plan/v1` API、只读计划语义、依赖版本和应用分层不变；开放 PR #9/#11/#12/#13/#14 均未修改 `hostPlan/*`，本批次避免其 App、全局 token、Nav、Solution、Loop、Memory 与 Trace 文件。
