# Dashboard UI/UX 系统化优化

## Why

Tenon Dashboard 承载多类高密度工作流与治理信息，需要以一致、清晰、可访问的界面帮助本地开发者快速判断状态并完成操作。当前任务将以真实浏览器证据为基础，系统化收敛视觉语言与交互体验，而不是进行零散装饰调整。

## What Changes

- 建立 Dashboard 的连贯视觉方向与可执行设计系统，并按可审查切片逐步落地。
- 覆盖主题 token、信息层级、组件状态、响应式、可访问性、反馈与克制动效。
- 每个切片同步中英文文案、组件测试、构建和真实浏览器验收证据。
- 不改变服务端业务规则、生产部署或安全边界；不升级主版本或引入重复 UI 库。
- 本轮与其他 Dashboard PR/worktree 隔离，优先选择生产可达且不重叠的 UI 区域。
- 首个候选 AppHeader 经调用链复核证实没有生产消费者，因此不交付无浏览器效果的死代码改动。
- 修订后的首个切片聚焦生产可达的 SolutionView 长页面，为七个主要章节提供响应式、键盘可达的页内导航。

## Capabilities

### New Capabilities

- `dashboard-ui-ux-system`：为 Dashboard 提供一致、响应式、可访问且支持 reduced motion 的界面体验。

### Modified Capabilities

无。现有业务能力与 API 契约保持不变。

## Impact

主要影响 `packages/dashboard-app` 的主题、共享展示组件和功能域视图，以及对应测试、i18n 与浏览器证据。修订后的首切片只影响 `src/solution/` 内的概览页与相邻测试，不修改被 PR #5–#8 触及的 App、Nav、i18n、API 或全局 token。前端依赖方向保持 `App/shell → 功能域 → model/state → api`，不新增服务端契约或生产依赖。
