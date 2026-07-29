---
change: dashboard-review-inbox-triage-20260729
design-doc: docs/superpowers/specs/2026-07-29-dashboard-review-inbox-triage-design.md
---

# Dashboard Progress 待复核分诊实现计划

## 交付边界

只修改 Progress 状态筛选、画布任务卡交互语义、相邻测试和中英文翻译。保持默认 `all`、现有
`deckMatch`、Workflow 画布位置、抽屉/API/Snapshot/GSAP 合约；不恢复 Inbox、不改手机设计、不加依赖。
Explore 已用真实浏览器与 DOM 消除交互可行性未知，且本批不改数据模型或状态机；持续授权下不插入
一次性 prototype，以红绿组件测试作为最小可逆探索面。

## 子阶段 1：状态筛选 tracer bullet

目标：从现有 `deckCounts/deckTab` 数据到 Toolbar 视觉、键盘与双语状态反馈打通最小纵向链路。

1. 在 `packages/dashboard-app/src/progress/ProgressToolbar.test.tsx` 先增加失败测试：
   - 非当前 tab 为 `tabIndex=-1`，当前 tab 为 0；
   - ArrowLeft/Right/Home/End 调用 `onDeckTab` 并把焦点移到目标 tab；
   - 非 `all` 状态显示匹配数/上下文数的 `role=status`；
   - 英文状态摘要没有中文。
2. 在 `packages/dashboard-app/src/progress/ProgressToolbar.tsx` 实现受控 roving tablist 与筛选摘要。
   箭头切换必须复用 `DECK_TABS`，不得复制分类规则或触发任务动作。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 成对增加摘要 key。
4. 运行：
   `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/progress/ProgressToolbar.test.tsx`
5. 验收条件：当前 tab 是 tablist 唯一普通 Tab 停靠点；方向键切换不会调用任务动作；摘要在
   中文、英文和零匹配场景中都报告精确计数。

此处建议 `/clear`。

## 子阶段 2：画布上下文卡交互隔离

1. 在 `packages/dashboard-app/src/progress/WorkflowCanvas.test.tsx` 先增加失败测试：
   - `dimmed=true` 卡同时具有 `disabled` 与 `aria-hidden=true`；
   - 点击不会调用 `onOpen`；
   - 匹配卡仍可点击并保留焦点归还触发器。
2. 在 `packages/dashboard-app/src/progress/WorkflowCanvas.tsx` 让 `dimmed` 成为唯一语义源：
   卡片禁用并从无障碍树隐藏，同时保持阶段位置和 30% 视觉上下文；禁用态不得触发 hover 位移。
3. 在 `packages/dashboard-app/src/progress/ProgressView.test.tsx` 把筛选集成断言从“只淡出”升级为
   “淡出 + 禁用 + 隐藏”，并覆盖零匹配摘要。
4. 运行三份 Progress 定向测试和 `npm run typecheck:web`。
5. 验收条件：匹配卡仍能打开抽屉并恢复焦点；每个上下文卡由同一 `dimmed` 布尔量同时驱动
   `data-dim`、`disabled` 与 `aria-hidden`，不存在隐藏焦点或鼠标旁路。

此处建议 `/clear`。

## 子阶段 3：验证与交付

1. 运行 `npm run test:web`、`npm run build:web`、`npm run build`、
   `npm run check:comments`、`npm run check:architecture` 和 `npm run check:repository-hygiene`。
2. 用该 worktree 的生产 Dashboard 验收 1024×768、1200×870、1440×900、1920×1080：
   - `all/need/run/queue`，含零匹配；
   - Light/Dark/System、键盘、匹配卡打开/Escape 焦点归还、loading/error/empty；
   - reduced-motion 下墨线终态、无新循环动效；
   - 文档/主区域零横向溢出，既有画布局部滚动保留；
   - 不运行或声称手机验收。
3. 完成独立 review、E2E/视觉检查和验证报告；失败则回 Build 修复。
4. Ship 时提交、正常 push、创建非草稿 PR；标签仅在仓库存在时添加。等待 CI 终态后 Archive。

## 兼容与回滚

- 兼容：不改 props 数据形状、API、Snapshot、模型或默认 `all`。
- 回滚：可整体回退 Toolbar 键盘/摘要与 Canvas 禁用语义；不会留下迁移、状态或服务端数据。
- 已知非目标：不消除七阶段画布的局部横向滚动，不重新设计手机布局，不修复仓库既有依赖审计告警。
