# 任务

## 立项

- [x] 登记目标、初始设计假设和七阶段任务，并通过 Open 文档与 guard 检查。

## 调研

- [x] 审计全部 Dashboard 页面、功能域、共享组件、主题 token、图标与状态覆盖面。 (explore)
- [x] 采集桌面、移动、明暗主题、键盘与 reduced-motion 的真实浏览器基线。 (explore)
- [x] 形成有证据支持的视觉方向、设计系统边界、UX 优先级和 ADR。 (explore)

## 规格

- [x] 定义配色、排版、间距、层级、图标、响应式、可访问性和动效的可验收需求。 (spec)
- [x] 将设计决策拆成按功能域与共享层组织的实现及验证计划。 (spec)

## 实现

- [x] 子阶段 1：用测试固定语义 token、桌面 rail、移动底栏及 App safe-area 契约。 (build)
- [x] 子阶段 2：将共享 Icon 映射到 Lucide，并用 PageHeader 统一五个一级页面层级。 (build)
- [x] 子阶段 3：重排 Progress 移动 toolbar、filters、项目摘要、阶段轨和 Change 摘要。 (build)
- [x] 子阶段 4：统一反馈、i18n、120–280ms ease-out 动效与 reduced-motion 终态。 (build)
- [x] 运行受影响组件测试、全量前端测试、类型检查、生产构建和静态质量检查。 (build)

## 验证

- [x] 运行前端类型检查、测试、生产构建及受影响的跨端验证。 (verify)
- [x] 在真实 Tenon Dashboard 完成桌面/移动、明暗主题、键盘、状态与动效浏览器验收。 (verify)
- [x] 完成设计、前端质量与代码审查，修复发现的问题。 (verify)

## 交付

- [ ] 提交并推送独立 `codex/` 分支，创建包含前后对比与验证证据的非草稿 PR。 (ship)
- [ ] 检查 PR 与 CI 状态并修复范围内失败。 (ship)

## 归档

- [ ] 应用规格、完成 Change 归档并记录最终交付证据。 (archive)
