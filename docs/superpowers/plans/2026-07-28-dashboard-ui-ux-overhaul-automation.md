---
change: dashboard-ui-ux-overhaul-automation
design-doc: docs/superpowers/specs/2026-07-28-dashboard-ui-ux-overhaul-automation-design.md
---

# Dashboard UI/UX 系统化优化实施计划

## 目标与交付策略

在同一个 Change/PR 中按无冲突、可验证的纵向切片持续优化 Dashboard。每次 Build 只完成一组连贯改动；若并行 worktree 新增重叠，改选下一组或等待。

## Build 子阶段 1：SolutionView 章节导航 tracer bullet

这是首个纵向切片，贯穿生产可达的 solution 域、语义导航、相邻测试与真实浏览器渲染，不改 API、App/Nav 接线或 i18n。

1. 先修改 `packages/dashboard-app/src/solution/SolutionView.test.tsx`
   - 新增失败测试：页内导航必须包含七个链接、链接 href 与真实 section id 一一对应、导航语义可识别。
   - 立即运行定向 Vitest，确认因导航尚不存在而按预期失败。
2. 新增 `packages/dashboard-app/src/solution/SolutionSectionNav.tsx` 并修改 `SolutionView.tsx`
   - 复用既有七个 `solution.sections.*_eyebrow` 文案，不触碰共享 i18n。
   - 为七个 section 建立稳定 id 和 `scroll-margin`，导航使用原生锚点。
   - 桌面使用紧凑层级并提供明确 `focus-visible`。
   - 根容器只裁剪横向溢出，不能用纵向 `overflow-hidden` 破坏 sticky。
   - 不添加平滑滚动或非必要动画，reduced-motion 直接保持终态。
3. 绿与重构
   - 运行定向 Vitest使新增测试与既有 SolutionView 测试全部通过。
   - 在测试保持绿色的前提下整理 domain-local section 配置，避免视图与导航锚点漂移。
4. 验证
   - `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/solution/SolutionView.test.tsx`
   - `npm run typecheck:web`
   - 真实 Playwright：1024×768 / 1200×870 / 1440×900、浅/深色、键盘、锚点与 reduced-motion。
5. 回滚
   - 单独回退 SolutionView、章节导航与相邻测试；不需要数据迁移、i18n 或 API 回滚。

**此处建议 /clear**

## Build 子阶段 2：共享交互原语

1. 已重新检查 PR #5–#9；PR #5 与 App/Nav/i18n/Solution 有文件重叠，其余开放 PR 无本批核心
   UI 实现重叠。重叠作为合并风险记录，不复用其 Change 或提交。
2. 已审计 `components/ui` 的 Button、Input、Select、Dialog、DropdownMenu、Tabs、Badge、Table
   与 Tooltip，并统一 focus、disabled 和 reduced-motion 基线。
3. 已补 Button 全尺寸矩阵和设计系统源码契约测试；明确 `xs` 是紧凑例外。
4. 用户最终明确只支持电脑端；Build 将撤销专门的移动触控规则，不把旧 390×844 结果计入交付。

**此处建议 /clear**

## Build 子阶段 3：功能域状态与视觉层级

1. 已将主动作从 success green 分离为 accent blue，并以 CSS 契约测试锁定浅/深主题语义。
2. 已增加显式 system 主题偏好和系统主题实时响应；新增文案同步中英文。
3. 已补 Nav 设置弹层的初始焦点、Tab/Shift+Tab 圈定、Escape 关闭与焦点返回。
4. 已补 Nav、离线恢复、快照错误重试和 Onboarding 的焦点与 reduced-motion 状态。
5. 已通过真实零项目 API 验收 empty 状态，并通过受控中断 snapshot/stream 验收 error 与恢复路径；
   UI fault injection 明确标注，不伪装为生产故障。

**此处建议 /clear**

## Verify

1. 定向 Vitest 覆盖每个修改组件。
2. 运行 `npm run typecheck:web`、`npm run test:web`、`npm run build:web`。
3. 涉及共享契约时补 `npm run build`；纯前端切片不虚构跨端影响。
4. 启动当前 worktree 的真实 Dashboard，确认标题、URL、release/source 与目标一致。
5. 覆盖 1024/1200/1440px 桌面、浅/深主题、键盘、主要状态与 reduced-motion；保存截图和 accessibility snapshot。
6. 任何失败默认回 Build 修复，不接受无证据偏差。

## 原型决策

不插入一次性 prototype。首切片使用浏览器原生锚点、现有 React/Tailwind 与真实生产页面，未知点可由相邻测试和真实浏览器直接验证；引入独立原型不会降低架构风险，反而会扩大非生产代码。

## 兼容与风险

- 不升级依赖、不改变服务端 API、不迁移数据。
- PR #5–#8 若先合并，先 rebase 后重跑完整视觉基线；solution 域文件保持独立。
- UI primitive 修改可能放大到多个消费者，必须在子阶段 2 单独执行。
- 浏览器 fixture 只验证真实渲染与交互，不替代真实本地项目 API 验收。
