# Dashboard UI/UX 系统化优化

## Why

Tenon Dashboard 承载多类高密度工作流与治理信息，需要以一致、清晰、可访问的界面帮助本地开发者快速判断状态并完成操作。当前任务将以真实浏览器证据为基础，系统化收敛视觉语言与交互体验，而不是进行零散装饰调整。

## What Changes

- 建立 Dashboard 的连贯视觉方向与可执行设计系统，并按可审查切片逐步落地。
- 覆盖主题 token、信息层级、组件状态、响应式、可访问性、反馈与克制动效。
- 每个切片同步中英文文案、组件测试、构建和真实浏览器验收证据。
- 不改变服务端业务规则、生产部署或安全边界；不升级主版本或引入重复 UI 库。
- 本轮与其他 Dashboard PR/worktree 使用独立 Change、分支和 worktree；重叠文件必须显式记录并
  保持可独立回滚，禁止复用对方 canonical state 或强推覆盖。
- 首个候选 AppHeader 经调用链复核证实没有生产消费者，因此不交付无浏览器效果的死代码改动。
- 修订后的首个切片聚焦生产可达的 SolutionView 长页面，为七个主要章节提供响应式、键盘可达的页内导航。
- 第一次 Verify 失败后，同一 Change 增加可验证的系统基线：语义主动作 token、system 主题、
  移动 Nav/设置键盘语义、共享原语触控与 reduced-motion、空态与错误恢复反馈。

## Capabilities

### New Capabilities

- `dashboard-ui-ux-system`：为 Dashboard 提供一致、响应式、可访问且支持 reduced motion 的界面体验。

### Modified Capabilities

无。现有业务能力与 API 契约保持不变。

## Impact

主要影响 `packages/dashboard-app` 的主题 token、App/shell、共享 UI 原语、SolutionView、Onboarding、
对应测试、i18n 与浏览器证据。PR #5 的重叠作为合并风险记录；本 Change 不复制其 state 或强推覆盖。
前端依赖方向保持 `App/shell → 功能域 → model/state → api`，不新增服务端契约或生产依赖。
