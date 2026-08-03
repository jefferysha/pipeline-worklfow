# 提案

## Why

当 Dashboard 同时发现较多项目时，电脑端“项目”总览只能依赖长列表浏览，用户难以迅速定位目标项目或只查看需要处理的项目。当前批次要为本地开发者提供更快、更明确的项目聚焦入口。

## What Changes

在 1024–1920px 的 Dashboard 项目总览中补充确定性的 basename/root 检索、All/Needs you/Running/Unreachable
状态聚焦、键盘 roving `radiogroup`、包含当前状态的实时结果摘要和可恢复零结果；完整集合只预排序一次，
并保持项目身份、健康摘要和打开项目的既有语义。

非目标：不改项目发现/API/数据模型，不改手机端布局，不触碰 AFK、Trace 或生产部署。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

`dashboard-ui-ux-system`：项目总览的桌面检索、状态聚焦、键盘与空结果反馈。

## Impact

只影响 `packages/dashboard-app/src/shell/ProjectsView*`、域内聚焦模型/工具栏、相邻测试和 `projects.*` 中英文文案；复用现有 React、Tailwind、Lucide、GSAP 与主题 token，不增加依赖或公共 API。保留既有小屏契约仅用于防回归，不进行手机端设计或验收。
