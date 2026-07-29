# Dashboard UI/UX 主线整合提案

## Why

已归档的 `dashboard-ui-ux-overhaul-automation` 已完成系统级桌面 Dashboard UI/UX 优化并由 PR #10 交付，但该 PR 基于旧 main，现与最新 main 存在不可自动合并的冲突。旧 Verify 证据不能覆盖冲突解决后的代码，因此需要基于最新 main 建立新的受治理整合 Change，保留有效设计成果并重新验证。

## What Changes

- 对照 PR #10 与最新 main，逐项移植仍有用户价值且未被主线等价实现覆盖的 Dashboard UI/UX 改动。
- 解决 App shell、导航、设计 token、i18n、状态反馈与生成前端资产等重叠区域的冲突。
- 重新执行定向测试、全量前端测试、类型检查、构建与真实浏览器验收后创建替代 PR。
- 替代 PR 可审查后关闭冲突的 PR #10，不自动合并任何 PR。
- 硬边界：产品只面向 1024–1920px 电脑端 Dashboard；不设计或验收手机端。

## Capabilities

### New Capabilities

无。此 Change 不新增产品能力，只整合已验证的桌面 Dashboard UI/UX 能力。

### Modified Capabilities

`dashboard-ui-ux-system`：使已归档能力在最新 main 上保持可合并、可验证。

## Impact

影响 `packages/dashboard-app` 的应用外壳、导航、共享样式与组件、Projects/Onboarding/Solution 状态展示、i18n、相邻测试，以及前端生成资产和本 Change 的治理文档。不改变 Dashboard API、服务端数据模型或依赖主版本。

Explore 已确认冲突集中在 App、Nav、Onboarding、SolutionView、i18n、全局 CSS、主规格与生成入口。真实浏览器同时复现重复 basename 无法辨认、设置 Escape/焦点生命周期和长 Overview 缺少章节导航三个缺口，因此采用最新 main 为底的逐提交增量整合，而非整文件覆盖。
