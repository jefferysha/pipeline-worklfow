---
change: dashboard-ui-ux-overhaul-reconcile-20260729
design-doc: docs/superpowers/specs/2026-07-29-dashboard-ui-ux-overhaul-reconcile-design.md
---

# Dashboard UI/UX 主线整合实施计划

## 执行原则

- 基线固定为 `origin/main@4c242b928b61285561f9cdbc63617db899a18a12`。
- 旧实现提交只作为增量来源；不 checkout 旧文件，不复制旧治理目录或生成资产。
- 冲突时保留 main 新能力，再人工加入旧修复。
- 每个子阶段先运行定向测试；失败立即在 Build 修复。
- 支持与验收范围仅为 1024–1920px 电脑端。

## 原型决策

不插入一次性 prototype。此次没有未知数据模型、API 或新状态机；旧产品提交、相邻测试、merge-tree
和真实浏览器基线已提供足够证据。直接使用测试驱动的增量整合比另建原型更能暴露真实冲突。

## 子阶段 1：Solution 纵向曳光弹

这是首个 tracer bullet：从域配置到组件、URL hash、可访问语义、浏览器布局完整打通一条最小前端链路。

1. 应用旧提交 `18ac2bba` 与 `40f5cab8` 的 Solution/Button 增量。
2. 在 `packages/dashboard-app/src/solution/solutionModel.ts` 定义七个稳定 section id。
3. 新增 `SolutionSectionNav.tsx`，使用原生锚点与 `aria-current`。
4. 在 `SolutionView.tsx` 保留 main 章节内容，只加入导航与 section id。
5. 更新 `SolutionView.test.tsx` 与 `button.test.tsx`。
6. 运行：
   `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/solution/SolutionView.test.tsx packages/dashboard-app/src/components/ui/button.test.tsx`
7. 浏览器检查 Overview 在 1024/1440px 的 hash、焦点和根级 overflow。

回滚边界：可独立撤销 Solution 与 Button 整合提交，不影响 main 其他功能域。

**此处建议 /clear**

## 子阶段 2：共享原语、App 与 Nav 生命周期

1. 依次应用旧提交 `ba4c7bf8`、`eabfb33f`、`749a0832`、`f22194b4`。
2. `components/ui/*` 只加入 focus-visible、disabled、motion-reduce 增量。
3. `shared/motion.ts` 合并 GSAP matchMedia、终态与 cleanup，保留 main API。
4. `App.tsx` 保留 main 路由/数据调用链，加入：
   - `system | light | dark` 与 matchMedia listener cleanup；
   - flash tween/timer cleanup；
   - offline/error/toast live region；
   - 可见焦点与恢复动作状态。
5. `Nav.tsx` 保留 main IA，加入 accessible name、设置首焦点、自然 Tab、Escape、焦点归还和 modal 隔离。
6. `Onboarding.tsx` 保留 main 的 Create Change 能力，加入唯一 H1、命令特定复制名称和桌面点击高度。
7. `translations.ts` 仅加入实际消费的成对 zh/en key。
8. `index.css` 以 main 为底合并语义 primary、焦点、disabled 与全局 reduced-motion。
9. 更新 App、Nav、Onboarding、motion 与 design-system 相邻测试。
10. 运行：
    `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/App.test.tsx packages/dashboard-app/src/shell/Nav.test.tsx packages/dashboard-app/src/shell/Onboarding.test.tsx packages/dashboard-app/src/shared/motion.test.tsx packages/dashboard-app/src/designSystem.test.tsx`

回滚边界：共享基线提交可整体回滚；不改变 API、model/state 或服务端。

**此处建议 /clear**

## 子阶段 3：Projects 身份与整合收口

1. 应用旧提交 `50629913`。
2. `ProjectsView.tsx` 保留 main 当前投影，加入完整 root accessible name、可见区分路径、稳定 key/id。
3. 更新 `ProjectsView.test.tsx` 和必要的 Onboarding/i18n 断言。
4. 对照 delta spec 逐项核对 1024–1920px 场景。
5. 运行：
   `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/shell/ProjectsView.test.tsx packages/dashboard-app/src/shell/Onboarding.test.tsx`
6. 运行 `npm run typecheck:web` 与 `npm run test:web`。

回滚边界：Projects 身份提交独立回滚，不影响其他 UI 基线。

**此处建议 /clear**

## 子阶段 4：生成资产与正式验证准备

1. 运行 `npm run build`，从最终源码生成 Dashboard、server、CLI 与 bootstrap tracked assets。
2. 确认无 conflict marker、无旧 asset 残留、`dist/index.html` 引用最终 hash。
3. 启动当前 worktree 的 `packages/server/dist/dashboard.mjs` 于独立端口。
4. 执行 1024×768、1200×870、1440×900、1920×1080 浏览器矩阵：
   light/dark/system、Tab/Shift+Tab/Escape、success/loading/error/retry/empty/disabled/offline、
   reduced-motion，以及 Projects/Progress/AFK/Workbench/Machine/Overview/Onboarding。
5. 保存无敏感信息的截图与步骤记录到
   `docs/ux/shots/dashboard-ui-ux-overhaul-reconcile-20260729/`。
6. 进入 Verify 后运行三轨复核并生成新 SHA 的 verification report。

回滚边界：生成资产与文档证据可随源码提交整体回滚；不得单独保留不匹配的 bundle。

**此处建议 /clear**

## 子阶段 5：Verify 失败闭环

1. 将桌面外壳与桌面浏览器验收表达为独立新增 requirement；既有 requirement 的
   `MODIFIED` 块保留完整 scenario 集合，并在隔离副本演练 OpenSpec 应用。
2. 先为共享长前缀的同 basename worktree、唯一 DOM `id` 和 modal Dialog 覆盖设置浮层
   Escape 分支补失败测试。
3. 为重复 basename 计算最短唯一祖先标签，保留完整 root accessible name/title，并增加稳定唯一
   DOM `id`。
4. 清理三个文档的 EOF 空行，重新运行 `git diff --check`。
5. 运行 `npm run build` 并提交最终 tracked Dashboard assets；在隔离副本再次构建，要求
   `packages/dashboard-app/dist` 无漂移。
6. 以新冻结 SHA 完整重跑 Reviewer、E2E、Codex 与视觉轨，不只复查旧 finding。

回滚边界：本子阶段代码修复与生成资产作为一个独立提交；若最短唯一标签产生回归，可回退该提交，
完整 root 的无障碍名称仍由前序提交保留。

## Ship 与替代 PR

1. Verify 通过后提交并推送 `codex/dashboard-ui-ux-overhaul-reconcile-20260729`，禁止 force push。
2. 创建非草稿替代 PR，说明旧 PR、冲突矩阵、桌面边界、测试、浏览器证据、风险和回滚。
3. 替代 PR 可读取后，在 PR #10 留下替代链接并关闭 #10。
4. 检查 CI；范围内失败继续修复，不自动合并。
