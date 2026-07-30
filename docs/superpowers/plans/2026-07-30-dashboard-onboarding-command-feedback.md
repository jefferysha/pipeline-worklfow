---
change: dashboard-onboarding-command-feedback-20260730
design-doc: docs/superpowers/specs/2026-07-30-dashboard-onboarding-command-feedback-design.md
---

# Dashboard Onboarding 命令反馈实施计划

## 目标与边界

在不新增依赖、API、共享状态或手机端工作的前提下，让 1024–1920px Dashboard Onboarding
的每条命令得到真实、独立、可访问的复制结果，并把两个终端步骤组织成清晰的电脑端层级。
保留既有小屏契约仅作为回归边界，不执行手机端设计、截图或验收。

原型决策：不插入一次性 prototype。Explore 已用真实浏览器复现缺口，仓内
`HostPlanPreview` 已验证同步/异步 clipboard 失败收敛方式，状态机与组件边界均已定稿；
持续自主模式选择最小、可逆的 TDD 实现。

## 子阶段 1：曳光弹——一条命令的完整反馈链路

这是首个端到端最小链路：从可注入 clipboard 边界，经 `CmdRow` 状态机，到按钮、可见
live status 和中英文文案。

1. 在 `packages/dashboard-app/src/shell/Onboarding.test.tsx` 先写失败测试：
   - Enter 激活后立即进入 pending、按钮 `aria-disabled` 且重复动作被状态机拦截；
   - Promise resolve 后显示成功且焦点不移动；
   - Clipboard API 缺失与 reject 后显示错误、命令仍可选择。
   - 验证：`npm run test:web -- --run packages/dashboard-app/src/shell/Onboarding.test.tsx`。
2. 在 `packages/dashboard-app/src/shell/Onboarding.tsx` 增加可注入 `copyText` 边界和
   `idle → pending → success | error` 局部状态，实现同步/异步错误统一收敛。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 增加成对中英文 pending/error
   文案；成功文案沿用既有 key。
4. 重新运行相邻测试，确认最小链路由红转绿。

**子阶段边界：此处建议 /clear。**

## 子阶段 2：生命周期、独立性与电脑端视觉层级

1. 扩展相邻测试，覆盖两条命令状态互不影响、pending 防重入、成功/错误重置时序、
   新操作清理 timer、卸载后迟到 Promise 不更新状态。
2. 将每个步骤收敛为带语义边界的等高卡片；1024px 保持单列，1100px 以上启用双列，
   命令行在最窄支持宽度保持可读且不制造根级溢出。
3. 使用现有 Lucide 图标、主题 token、focus ring、`motion-reduce:transition-none`；
   不引入 GSAP，因为该反馈不需要时间轴或空间因果动画。
4. 同步测试对可见 role、accessible name、disabled 和焦点保持的断言。

验证：

- `npm run test:web -- --run packages/dashboard-app/src/shell/Onboarding.test.tsx`
- `npm run typecheck:web`

**子阶段边界：此处建议 /clear。**

## 子阶段 3：生成资产与全量回归

1. 运行 `npm run test:web`，确认所有 Dashboard 功能域回归。
2. 运行 `npm run build`，从当前源码统一生成 tracked CLI/server/Dashboard 资产；
   不手工编辑或挑选 `dist/`。
3. 检查 `git diff --check`、范围 diff、依赖方向和生成资产来源。
4. 若全仓生成引出不属于本 Change 的失败，记录精确命令和边界；范围内失败必须修复。

**子阶段边界：此处建议 /clear。**

## 子阶段 4：冻结基线与真实电脑端验收

1. 提交 Build 基线并登记精确 `build_sha`。
2. 在隔离端口启动当前 worktree 的 production Dashboard，记录页面标题、URL、root、
   Change、asset hash、进程和浏览器 owner。
3. 仅验收 1024×768、1200×870、1440×900、1920×1080：
   - Light、Dark、System；
   - 键盘成功、API 缺失、异步拒绝、pending disabled、两行独立；
   - empty Onboarding、focus、无根级溢出、reduced-motion；
   - 不运行或声称手机端验收。
4. 完成代码审查、OpenSpec strict 校验与 Verify 报告；发现问题回到 Build 修复并重新冻结。

## 兼容性、回滚与交付

- 兼容性：`copyText` 是 Onboarding 的可选测试边界；生产默认仍调用
  `navigator.clipboard.writeText`。命令值、项目注册和 App/shell 边界不变。
- 回滚：恢复 Onboarding、相邻测试、i18n 与由源码生成的 dist；无迁移、API、持久化或
  数据清理。
- Ship：提交范围文件、push 唯一 `codex/` 分支，创建非草稿 stacked PR；PR 互链依赖，
  包含设计前后、可访问性、实际测试、浏览器证据、风险与回滚。
- Archive：应用 delta spec、运行 Tenon Archive、push 归档提交并等待 exact-head CI 终态。
