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
   - 桌面使用紧凑层级；移动允许横向滚动，每个链接至少 44px 高并提供明确 `focus-visible`。
   - 根容器只裁剪横向溢出，不能用纵向 `overflow-hidden` 破坏 sticky。
   - 不添加平滑滚动或非必要动画，reduced-motion 直接保持终态。
3. 绿与重构
   - 运行定向 Vitest使新增测试与既有 SolutionView 测试全部通过。
   - 在测试保持绿色的前提下整理 domain-local section 配置，避免视图与导航锚点漂移。
4. 验证
   - `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/solution/SolutionView.test.tsx`
   - `npm run typecheck:web`
   - 真实 Playwright：1200×870 / 390×844、浅/深色、键盘、锚点与 reduced-motion。
5. 回滚
   - 单独回退 SolutionView、章节导航与相邻测试；不需要数据迁移、i18n 或 API 回滚。

**此处建议 /clear**

## Build 子阶段 2：共享交互原语

1. 重新检查并行分支文件重叠与子阶段 1 浏览器结果。
2. 审计 `packages/dashboard-app/src/components/ui/{button,input,card,badge}.tsx` 的真实消费者，并排除已被其他 PR 修改的调用方。
3. 只对已有两个以上消费者的原语统一 focus、disabled、loading、invalid、touch target 与 reduced-motion。
4. 为每个修改原语补相邻测试或消费者组件测试。
5. 运行定向 Vitest、`npm run typecheck:web`、`npm run test:web`、`npm run build:web` 与浏览器视觉回归。
6. 回滚时按 primitive 独立提交回退。

**此处建议 /clear**

## Build 子阶段 3：功能域状态与视觉层级

1. 根据最新 overlap 选择一个未冲突功能域，不跨域批量重写。
2. 补齐 loading/error/empty/disabled/success、Lucide 图标、响应式与键盘路径。
3. 新增可见文本时同步 `src/i18n/translations.ts` 中英文。
4. 补组件测试与真实浏览器成功/失败/空态证据。
5. 每个域单独提交并更新同一 PR，直至 OpenSpec 范围满足。

**此处建议 /clear**

## Verify

1. 定向 Vitest 覆盖每个修改组件。
2. 运行 `npm run typecheck:web`、`npm run test:web`、`npm run build:web`。
3. 涉及共享契约时补 `npm run build`；纯前端切片不虚构跨端影响。
4. 启动当前 worktree 的真实 Dashboard，确认标题、URL、release/source 与目标一致。
5. 覆盖桌面/移动、浅/深主题、键盘、主要状态与 reduced-motion；保存截图和 accessibility snapshot。
6. 任何失败默认回 Build 修复，不接受无证据偏差。

## 原型决策

不插入一次性 prototype。首切片使用浏览器原生锚点、现有 React/Tailwind 与真实生产页面，未知点可由相邻测试和真实浏览器直接验证；引入独立原型不会降低架构风险，反而会扩大非生产代码。

## 兼容与风险

- 不升级依赖、不改变服务端 API、不迁移数据。
- PR #5–#8 若先合并，先 rebase 后重跑完整视觉基线；solution 域文件保持独立。
- UI primitive 修改可能放大到多个消费者，必须在子阶段 2 单独执行。
- 浏览器 fixture 只验证真实渲染与交互，不替代真实本地项目 API 验收。
