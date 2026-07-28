# 任务

## 立项

- [x] 从最新 `origin/main` 建立 automation 专用分支与独立 Change。
- [x] 记录目标、非目标、初始假设、并行冲突边界与七阶段任务。
- [x] 登记 Open 文档证据并通过 `tenon check`。

## 调研

- [x] 审计页面、功能域、共享组件、主题 token、图标、状态和动效实现。
- [x] 采集目标 Dashboard 的桌面/移动、明暗主题、键盘与 reduced-motion 浏览器基线。
- [x] 对照并行 worktree 的改动清单，选择无冲突首个切片。
- [x] 形成设计方向、ADR 与可访问性/动效决策。

## 规格

- [x] 记录 AppHeader 无生产消费者的需求变化，并以 `requirements-changed` 回退 Spec。
- [x] 复核 PR #5–#8 的 Dashboard 文件集合，选择生产可达且无重叠的 SolutionView。
- [x] 修订 `dashboard-ui-ux-system` delta spec、验收场景与可执行计划。

## 实现

- [x] SolutionView：先补失败测试，约束七章节页内导航、锚点目标与语义。
- [x] SolutionView：实现域内章节导航、44px 移动目标、可见焦点、横向滚动与 reduced-motion 兼容。
- [x] SolutionView：完成桌面/移动、明暗主题、键盘与 reduced-motion 浏览器验收。
- [x] 复核 PR #5–#8 overlap，并为多消费者 Button 原语补齐移动触控、disabled 与 reduced-motion 状态。
- [x] 为 SolutionView 页内导航增加 URL hash 驱动的当前章节反馈与 `aria-current`。

## 验证

- [ ] 运行定向 Vitest、`npm run typecheck:web`、`npm run test:web` 与 `npm run build:web`。
- [ ] 在真实 Dashboard 完成桌面/移动、明暗主题、键盘、状态与 reduced-motion 验收。
- [ ] 生成验证报告并处理所有可修复偏差。

## 交付

- [ ] 提交范围内文件并非强制推送 automation 分支。
- [ ] 创建或更新同一个非草稿 PR，附设计、Tenon、测试与浏览器证据。
- [ ] 检查 PR/CI，修复范围内失败并记录外部阻塞。

## 归档

- [ ] 应用 OpenSpec、完成归档并更新 automation memory。
- [ ] 归档后仅跟踪同一 PR 的 review/CI；合并后停止代码改动。
