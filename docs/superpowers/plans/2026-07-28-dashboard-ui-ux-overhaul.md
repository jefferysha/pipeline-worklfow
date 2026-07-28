---
change: dashboard-ui-ux-overhaul
design-doc: docs/superpowers/specs/2026-07-28-dashboard-ui-ux-overhaul-design.md
track: frontend
---

# Dashboard UI/UX 系统化优化实施计划

## 目标

在不改变 Tenon 工作流、服务端规则和 API 契约的前提下，建立统一语义视觉系统，修复移动导航与
Progress 响应式问题，统一一级页面层级、图标和动效，并用生产构建的真实 Dashboard 完成多主题、
多视口、键盘和 reduced-motion 验收。

## 前置证据

- 审计：`docs/research/2026-07-28-dashboard-ui-ux-audit.md`
- 设计：`docs/superpowers/specs/2026-07-28-dashboard-ui-ux-overhaul-design.md`
- ADR：`docs/adr/2026-07-28-dashboard-ui-ux-overhaul.md`
- Delta spec：
  `openspec/changes/dashboard-ui-ux-overhaul/specs/dashboard-ui-ux-system/spec.md`

## 原型决策

不插入一次性 prototype。真实生产 Dashboard 已在隔离端口和真实 Change 数据上运行，核心未知已由
1440×900 与 390×844 基线直接验证；继续制作脱离应用的数据原型不会比在现有组件上完成纵向切片
更快降低风险。若 Build 发现业务状态或 API 契约缺口，必须以 `requirements-changed` 回退 Spec，
不能在原型或样式层掩盖。

## Build 子阶段 1：Tracer bullet——语义 token 到移动导航

> 子阶段边界：完成后建议 `/clear`。

### 1.1 先写外壳行为测试

文件：

- `packages/dashboard-app/src/shell/Nav.test.tsx`
- `packages/dashboard-app/src/App.test.tsx`

行为：

- 稳定断言五个一级入口、设置与品牌入口的可访问名称。
- 增加移动底部导航的结构标识、安全区和设置弹层锚点测试。
- 保持桌面 rail 的当前入口、进度/AFK 徽标和主题/语言交互行为。

验证：

```bash
npx vitest run packages/dashboard-app/src/shell/Nav.test.tsx packages/dashboard-app/src/App.test.tsx
```

预期先红：移动结构尚不存在。

### 1.2 打通全局 token → App shell → Nav 的最小纵向链路

文件：

- `packages/dashboard-app/src/index.css`
- `packages/dashboard-app/src/App.tsx`
- `packages/dashboard-app/src/shell/Nav.tsx`

行为：

- primary/cobalt 与 success/green 分离，三种主题解析路径保持等值。
- 桌面 rail 使用更清晰的选中态和文字对比。
- ≤720px 变为固定底部导航，显示短标签，触控目标 ≥44px。
- App 主内容、flash 和设置弹层避让底栏与 safe area。
- 不修改 `View`、路由、snapshot 或业务回调契约。

验证：

```bash
npx vitest run packages/dashboard-app/src/shell/Nav.test.tsx packages/dashboard-app/src/App.test.tsx
npm run build:web
```

回滚边界：可单独回退 token 和 shell/Nav，不影响数据层。

## Build 子阶段 2：共享图标、页面层级与反馈

> 子阶段边界：完成后建议 `/clear`。

### 2.1 将共享 Icon 映射到 Lucide

文件：

- `packages/dashboard-app/src/shared/Icon.tsx`
- `packages/dashboard-app/src/shell/Icon.test.tsx`

行为：

- 保留 `IconName`、`name`、`size` API。
- 14 个名称全部映射到 Lucide，统一 `strokeWidth=1.75` 与 `aria-hidden=true`。
- 测试验证 API、尺寸、Lucide 标识与无障碍行为，不锁定手写 path 实现。

验证：

```bash
npx vitest run packages/dashboard-app/src/shell/Icon.test.tsx
```

### 2.2 建立共享 PageHeader 并迁移一级页面

文件：

- 新增 `packages/dashboard-app/src/shared/PageHeader.tsx`
- 新增 `packages/dashboard-app/src/shared/PageHeader.test.tsx`
- `packages/dashboard-app/src/shell/ProjectsView.tsx`
- `packages/dashboard-app/src/progress/ProgressToolbar.tsx`
- `packages/dashboard-app/src/afk/AfkView.tsx`
- `packages/dashboard-app/src/workbench/WorkbenchHeader.tsx`
- `packages/dashboard-app/src/workbench/WorkbenchView.tsx`
- `packages/dashboard-app/src/machine/MachineView.tsx`
- `packages/dashboard-app/src/i18n/translations.ts`

行为：

- 每个一级页面拥有唯一 H1、说明、状态与动作层级。
- Workbench 补齐一级页面标题。
- 触及的可见文案全部走 i18n；不在本任务中重写功能域数据或操作逻辑。

验证：

```bash
npx vitest run packages/dashboard-app/src/shared/PageHeader.test.tsx \
  packages/dashboard-app/src/shell/ProjectsView.test.tsx \
  packages/dashboard-app/src/progress/ProgressToolbar.test.tsx \
  packages/dashboard-app/src/afk/AfkView.test.tsx \
  packages/dashboard-app/src/workbench/WorkbenchView.test.tsx \
  packages/dashboard-app/src/machine/MachineView.test.tsx
```

回滚边界：PageHeader 为展示组合，可逐页回退而不改变业务状态。

## Build 子阶段 3：Progress 移动重排

> 子阶段边界：完成后建议 `/clear`。

### 3.1 先固定响应式行为

文件：

- `packages/dashboard-app/src/progress/ProgressToolbar.test.tsx`
- `packages/dashboard-app/src/progress/ProgressView.test.tsx`
- `packages/dashboard-app/src/progress/WorkflowCanvas.test.tsx`

行为：

- tabs 与阶段轨使用独立 overflow 容器。
- 项目摘要、workflow、阶段和 Change 卡在移动端保持状态优先顺序。
- 长 root/change 名称不会制造文档级横向溢出。

### 3.2 实现 Progress 响应式布局

文件：

- `packages/dashboard-app/src/progress/ProgressToolbar.tsx`
- `packages/dashboard-app/src/progress/ProgressView.tsx`
- `packages/dashboard-app/src/progress/WorkflowCanvas.tsx`
- `packages/dashboard-app/src/progress/WorkflowCanvasStage.tsx`
- `packages/dashboard-app/src/progress/progress.css`

行为：

- 桌面行为和真实阶段数据保持不变。
- 移动端按 toolbar → filters → project summary → stage rail → change summary 排列。
- 只允许局部横向滚动；根文档保持 `scrollWidth === clientWidth`。

验证：

```bash
npx vitest run packages/dashboard-app/src/progress
npm run build:web
```

回滚边界：Progress CSS/结构可独立回退，不改变 progress model 或 API。

## Build 子阶段 4：动效、国际化与全量回归

> 子阶段边界：完成后建议 `/clear`。

### 4.1 统一共享动效

文件：

- `packages/dashboard-app/src/shared/motion.ts`
- `packages/dashboard-app/src/shared/motion.test.tsx`
- 使用 `rg` 找到的功能域 GSAP 调用点

行为：

- 删除 `back.out`/bounce；所有共享进入、dialog、drawer、toast 保持 120–280ms ease-out。
- reduced-motion 直接终态，运行指示只保留必要状态表达。

验证：

```bash
npx vitest run packages/dashboard-app/src/shared/motion.test.tsx
rg -n "back\\.out|bounce" packages/dashboard-app/src
```

### 4.2 i18n 与静态质量审计

文件：

- `packages/dashboard-app/src/i18n/translations.ts`
- 本轮触及的一级视图

行为：

- 新增/修改的所有可见文案具备中英文键。
- 运行搜索确认没有新裸色、emoji 图标或新增第二套 UI/图标依赖。

验证：

```bash
npx vitest run packages/dashboard-app/src/i18n/i18n.test.tsx
rg -n "#[0-9a-fA-F]{3,8}|linear-gradient|radial-gradient" packages/dashboard-app/src \
  --glob '!index.css'
```

### 4.3 全量工程验证

```bash
npm run typecheck
npm run test:web
npm run build
git diff --check
```

若仓库脚本名称与计划不一致，以 `package.json` 的当前脚本为准，并在验证报告记录实际命令。

## Verify：真实浏览器矩阵

使用隔离 runtime 与生产构建，注册且只注册当前 worktree。每个组合核对页面 title、URL、root 与
`dashboard-ui-ux-overhaul`，并完成：

1. 1440×900 light/dark：Projects、Progress、AFK、Workbench、Machine；
2. 1024×768：一级导航、页面头和 Progress；
3. 390×844 light/dark：底部导航、设置、Progress tabs/阶段轨、长名称；
4. 键盘：一级导航、tabs、filter、设置弹层、主要动作；
5. reduced-motion：列表/dialog/toast 直接终态；
6. 根布局：`document.documentElement.scrollWidth === clientWidth`；
7. console：无本 Change 引入的 error。

将命令、浏览器步骤、截图结论和剩余限制写入
`docs/superpowers/reports/2026-07-28-dashboard-ui-ux-overhaul-verification.md`。

## 兼容、发布与回滚

- 不改变 API、路由 query、`View` 枚举、snapshot、Change 模型或服务端行为。
- 不新增依赖；现有生产 chunk 警告不作为本 Change 新引入的回归。
- PR 必须附前后桌面/移动对比、测试/构建命令、浏览器矩阵和已知限制。
- 若全局 token 造成不可接受回归，可先回退 token 映射；若移动外壳有问题，可独立回退
  App/Nav 子阶段；Progress 结构和共享 Icon/PageHeader 均有各自回滚边界。
