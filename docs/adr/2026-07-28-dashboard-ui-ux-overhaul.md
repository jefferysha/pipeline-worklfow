# ADR：Dashboard 采用语义化视觉系统与移动底部导航

- 日期：2026-07-28
- 状态：Accepted
- Change：`dashboard-ui-ux-overhaul`

## Context

Dashboard 已有成熟业务功能，但全局 primary 与 success 共用绿色、页面标题层级不一致、共享手写
图标与 Lucide 并存，并且 720px 以下仍使用纯图标左 rail。390×844 的真实浏览器基线表明，
左 rail 持续占宽且 Progress 桌面画布被压进狭窄内容列。

仓库早期“工票车间”设计明确不做移动专门布局；更新的 v10 产品约束已否决该隐喻，并强调玻璃
驾驶舱、14px 正文、AA 对比和状态语义色。

## Decision

1. 建立以角色命名的语义 token，primary=cobalt，success=green，warning=amber，
   danger=red，orchestration=violet。
2. Lucide 成为唯一图标形状源；现有 `shared/Icon` 保留 API 并映射到 Lucide。
3. 桌面保留紧凑左 rail，≤720px 切换为带文字标签的底部导航，并为 safe area 预留内容空间。
4. 一级页面统一标题、说明、状态和动作层级。
5. Progress 在移动端重排内容，不缩放桌面画布。
6. 统一 120–280ms ease-out 动效，禁止 bounce/back，reduced-motion 直达终态。

## Alternatives

### 只换配色

拒绝。不能解决移动横向空间、入口可发现性和页面层级不一致。

### 全量重写信息架构

拒绝。本轮目标可在现有 API、状态模型和功能域边界内完成；全面重写增加不可审查的业务风险。

### 保持纯图标移动 rail

拒绝。真实 390px 基线已经证明它持续占宽且隐藏入口语义。

## Consequences

- 全局 token 和外壳变化会影响所有视图，必须覆盖明暗主题、多视口和键盘回归。
- 部分依赖手写 SVG 细节的测试需要改为验证稳定 API、Lucide 标识与无障碍行为。
- 移动底栏需要同步调整 toast、弹层和主内容底部安全区。
- 不需要服务端或 OpenSpec 业务 capability 变更；若实现期出现契约缺口，必须回退 Spec 重新评审。
