# Dashboard 视觉重塑 + 交互深化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 dashboard 全量换到「OpenAI 配色 × Trellis 布局」视觉语言（spec：`docs/superpowers/specs/2026-07-09-openai-trellis-restyle-design.md`，真相源 `design-demos/v4-openai-trellis.html`），同轮合并 impeccable 评审的 P0/P1 交互深化（证据层/详情卡/AFK 活化/Loops 深化/Dialog 礼仪/拖拽前示/聚合语境）。

**Architecture:** 数据/状态层（snapshot/SSE/workflowModel/api client）不动；styles.ts 全量换 token 后各视图按新组件语言重写 markup；新增三个共享组件（Dialog / Icon / ChangeDetailCard）+ 一个纯函数模块（evidence.ts）+ 一个轮询 hook（useAfkLog）。每任务 TDD 先红后绿，每阶段跑三连门（`npm test` + `npm run test:web` + `npm run typecheck:web`），UI 阶段附真机双主题截图。

**Tech Stack:** React 18 + vitest/@testing-library（jsdom）+ GSAP（既有 motion.ts）+ Playwright 真机验收（.playwright-tmp）。零新依赖。

## Global Constraints

- Token 值以 spec §1 为唯一真相（含 `--btn-bg:#0b6cff` 蓝实底主按钮，禁黑实底主按钮）；冲突时以 `design-demos/v4-openai-trellis.html` 为准。
- 紫色全线退役；「等你复核」徽章 = red-t 底 red-d 字；mono 仅用于 id/路径/sha/JSON/字段名。
- 既有 testid 不删不改（意图迁移表列明的除外——迁移表里每条要写旧断言→新断言）；`npm run test:web` 在每任务结束时必须全绿。
- 所有对话框必须经由 Task 3 的 `<Dialog>`（Esc/autoFocus/焦点困笼/关闭归位/backdrop 可关）。
- 图标一律 Task 2 的内联 SVG sprite，禁 emoji。
- 动效沿用 motion.ts 词汇（150-250ms、prefers-reduced-motion 豁免），颜色跟随新 token。
- 每任务独立 commit（中文主题，引用任务号）；阶段结束跑三连门并在 commit 尾注记录。
- 真机脚本前置纪律：三连 build（`npm run build && npm run build:web && npm run build:server`）+ 清孤儿端口 8796-8799；Playwright 禁 `networkidle`（SSE 长连），用 `load`+`waitForSelector`。

---

## 阶段 0 · 底座（token + 图标）

### Task 1: styles.ts token 全量替换

**Files:**
- Modify: `packages/dashboard-app/src/styles.ts`（`:root`/`@media dark`/`[data-theme]` 三段 token 块 + 受 token 改名影响的规则）
- Test: 无新测试（GLOBAL_CSS 是字符串常量；现有测试不断言颜色值）——本任务的门是 typecheck + 全量 test:web 不回归 + Task 19 真机截图

**Interfaces:**
- Produces: CSS 变量集（spec §1 全表：`--bg/--card/--fill/--fill-2/--border/--border-2/--text/--text-2/--text-3/--accent{,-d,-t,-b}/--green{,-d,-t,-b}/--red{,-d,-t,-b}/--ink{,-fg,-hover}/--btn-bg/--btn-fg/--btn-hover/--code-bg/--code-border/--shadow/--shadow-2/--ring`）。后续所有任务只允许消费这些变量。

- [ ] **Step 1:** 把 spec §1 浅色/深色两块 token **逐字**写入 styles.ts 的三段主题块（`:root`、`@media (prefers-color-scheme: dark)`、`[data-theme="light"]`/`[data-theme="dark"]` 双向覆盖机制保持原样）。旧 token（`--well/--plate/--plate-fg/--verm/--verm-soft/--green-soft/--gate-bg/--gate-fg/--ok*/--danger*/--run/--focus/--font/--mono`）中：`--font/--mono` 保留原值；其余在本文件内全局替换为新语义映射：
  - `--well`→`--fill`；`--plate`→`--ink`（brand 块）；`--plate-fg`→`--ink-fg`；`--verm`→`--red`；`--verm-soft`→`--red-t`；`--green-soft`→`--green-t`；`--gate-bg`→`--red-t` 且对应规则字色改 `--red-d`（徽章从实底改 tint）；`--gate-fg`→删除；`--ok/--ok-soft`→`--green/--green-t`；`--danger/--danger-soft`→`--red/--red-d`；`--run`→`--green`；`--focus`→`--accent`。
- [ ] **Step 2:** 基础组件类重映射（同文件）：`.btn`（主按钮）改 `background:var(--btn-bg);color:var(--btn-fg)`、hover `--btn-hover`；`.btn--ghost` 透明底+`--border` 边+`--text-2` 字；`.btn--danger` 改 ghost 红（透明底 `--red-d` 字 `--red-b` 边）；`.badge--gate` 改 `background:var(--red-t);color:var(--red-d)`；`.qk__btn` 前进钮改蓝系（`--accent` 边字、hover `--accent-t`），`.qk__btn--back` 红系不变量映射；`.card`/`.ticket-row` 边框圆角对齐 v4（radius 12、`--shadow`）。
- [ ] **Step 3:** `rg -n "verm|plate|--well|gate-bg|green-soft" packages/dashboard-app/src --glob '!styles.ts'` 找出组件内联引用旧 token 的残留，逐处替换为新变量（只改 CSS 变量名引用，不动结构）。
- [ ] **Step 4:** 三连门：`npm run typecheck:web && npm test && npm run test:web`，全绿（若 test:web 有断言撞旧类名/旧文案，逐条按「意图迁移」处理并在 commit message 里列表）。
- [ ] **Step 5:** Commit：`style(dashboard): token 底座切换 OpenAI 配色（spec §1，Task 1）`

### Task 2: Icon sprite 组件

**Files:**
- Create: `packages/dashboard-app/src/shell/Icon.tsx`
- Test: `packages/dashboard-app/src/shell/Icon.test.tsx`

**Interfaces:**
- Produces: `export function Icon({ name, size = 14 }: { name: IconName; size?: number }): JSX.Element`；`export type IconName = 'check'|'copy'|'doc'|'link'|'x'|'chevron'|'inbox'|'board'|'flow'|'gauge'|'gate'|'clock'|'folder'|'layers'`。内联单文件 SVG path 表（1.5px stroke，`currentColor`），无外部资源。

- [ ] **Step 1（红）:** 测试：渲染 `<Icon name="check"/>` 产出 `<svg>` 且 `aria-hidden="true"`、宽高=size；未知 name 类型层面拒绝（类型测试用 `@ts-expect-error`）。
- [ ] **Step 2:** 跑 `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/shell/Icon.test.tsx`，确认 FAIL（模块不存在）。
- [ ] **Step 3（绿）:** 实现 path 表 + 组件（`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>`）。
- [ ] **Step 4:** 测试过绿 + typecheck。
- [ ] **Step 5:** Commit：`feat(dashboard): 内联 SVG 图标 sprite（Task 2）`

## 阶段 1 · 壳层礼仪

### Task 3: 共享 Dialog 组件（评审 P0-5/P1-9 的地基）

**Files:**
- Create: `packages/dashboard-app/src/shell/Dialog.tsx`
- Test: `packages/dashboard-app/src/shell/Dialog.test.tsx`

**Interfaces:**
- Produces:
```tsx
export interface DialogProps {
  title: string
  onClose: () => void            // Esc / backdrop / ✕ 都走它
  children: React.ReactNode
  actions?: React.ReactNode      // 底部动作条（调用方放确认/取消按钮）
  testid?: string
  /** 首个聚焦目标：缺省聚焦对话框容器内第一个可聚焦元素 */
  initialFocusRef?: React.RefObject<HTMLElement>
}
export function Dialog(props: DialogProps): JSX.Element
```
- 行为契约（每条一个测试）：挂载时焦点进入对话框；Esc 触发 onClose；点 backdrop（自身，非冒泡）触发 onClose；Tab 在对话框内循环（困笼：对最后元素 Tab → 第一个）；卸载时焦点回到打开前的元素；`role="dialog" aria-modal="true" aria-label={title}`。

- [ ] **Step 1（红）:** 写上述 6 条行为测试（用一个带按钮的宿主组件真实开合，`fireEvent.keyDown(document, {key:'Escape'})`、`fireEvent.click(backdrop)`、Tab 循环用 `userEvent.tab()`）。
- [ ] **Step 2:** 跑测试确认 6 条全 FAIL。
- [ ] **Step 3（绿）:** 实现：`useEffect` 记录 `document.activeElement` → 聚焦 initialFocus/首个可聚焦；`keydown` 监听 Escape 与 Tab 困笼（查询 `button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])`——评审修正：原字面串不排 disabled/hidden 会在「确认键 disabled」形态下困笼逃逸）；Esc/Tab 响应按模块级 LIFO 栈只归栈顶实例（评审修正：activeElement 归属检查在焦点落 body 时会让 Esc 静默失效）；卸载归位。样式复用现有 `.dialog__backdrop/.dialog`（已在 Task 1 换过 token）。
- [ ] **Step 4:** 6 条全绿 + typecheck。
- [ ] **Step 5:** Commit：`feat(dashboard): 统一 Dialog 组件——Esc/初焦点/困笼/归位（Task 3，评审 P1-9）`

### Task 4: 全部 7 处 backdrop 迁移 + 注册对话框陷阱修复（评审 P0-5）

**Files:**
- Modify: `packages/dashboard-app/src/App.tsx`（注册对话框：`register-dialog`）、`packages/dashboard-app/src/shell/NewChangeDialog.tsx`、`packages/dashboard-app/src/board/BoardView.tsx`（回退确认）、`packages/dashboard-app/src/inbox/InboxView.tsx`（回退确认）、`packages/dashboard-app/src/workflow/WorkflowEditorView.tsx`（删除确认）、`packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`（event 名输入弹窗——补标题「新连线的 event 名」）、`packages/dashboard-app/src/settings/SkillTransferModal.tsx`
- Test: 各视图既有测试文件 + `packages/dashboard-app/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 3 `Dialog`。

- [ ] **Step 1（红）:** App.test.tsx 新增：打开注册对话框 → 有「取消」按钮、按 Esc 对话框消失、焦点回到「＋」钮（今天全不成立=红）。NewChangeDialog 测试新增：挂载后名字输入框 `document.activeElement`、包裹 `<form>` 按 Enter 提交一次。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 逐处把手写 backdrop 换 `<Dialog>`；注册对话框加「取消」ghost 钮（`onClose`）；NewChangeDialog 套 `<form onSubmit>`+`initialFocusRef` 指名字输入框。
- [ ] **Step 4:** 各视图测试全绿（既有「取消钮关闭」类断言应天然继续过；对话框结构断言若撞 markup 变化，按意图迁移表改：旧 `.dialog__backdrop` 查询 → `getByRole('dialog')`）。
- [ ] **Step 5:** 三连门 + Commit：`fix(dashboard): 7 处对话框迁移统一 Dialog，注册陷阱补取消/Esc（Task 4，评审 P0-5）`

### Task 5: Nav/壳层换语言 + 聚合入口 + 注销 + 断线横幅

**Files:**
- Modify: `packages/dashboard-app/src/shell/Nav.tsx`、`packages/dashboard-app/src/App.tsx`、`packages/dashboard-app/src/i18n/translations.ts`、`packages/dashboard-app/src/api/client.ts`（无改动预期，仅消费 `unregisterProject`）
- Test: `packages/dashboard-app/src/shell/Nav.test.tsx`、`App.test.tsx`

**Interfaces:**
- Produces: `Nav` 新 props：`onRoot(root: string)` 语义扩展——`root === ''` 表示「全部项目」聚合语境（App 状态 `currentRoot: string`，空串=聚合，**这是全应用聚合语境的唯一表示**，后续任务都消费它）；`onUnregister?: (root: string) => void`；`connected: boolean` 已有，断线时 App 渲染 `data-testid="offline-banner"` 横幅（红 tint，含「重连」钮=调 `subscribeSnapshot` 重建 + 手动 `fetchSnapshot`）。
- 意图迁移表：`nav__conn--on` 圆点保留；`common.offline` 文案「离线（轮询）」→「连接断开——数据可能过期」（zh/en 同步）。

- [ ] **Step 1（红）:** Nav.test 新增：切换器下拉首项「◈ 全部项目」、点击后 `onRoot('')`；项目项 hover 区有「注销…」入口，点击弹 Dialog 确认后调 `onUnregister(root)`。App.test 新增：`connected=false` 时 offline-banner 出现、点「重连」发起一次 `GET /api/snapshot`。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现（brand 块/导航徽标数/主题钮换新 token 类；聚合项计数=各项目 change 总和）。注销走 `unregisterProject` + 成功后 refresh + 若注销的是 currentRoot 则切到聚合。
- [ ] **Step 4:** 全绿 + 三连门。
- [ ] **Step 5:** Commit：`feat(dashboard): 壳层新语言——全部项目聚合入口/注销项目/断线横幅（Task 5，评审 P2-13 + G19③ 入口）`

## 阶段 2 · 收件箱深化

### Task 6: 证据映射纯函数 evidence.ts（评审 P0-1 核心）

**Files:**
- Create: `packages/dashboard-app/src/inbox/evidence.ts`
- Test: `packages/dashboard-app/src/inbox/evidence.test.ts`

**Interfaces:**
- Produces:
```ts
export interface EvidenceChip {
  key: string                   // 字段名，mono 展示
  value: string                 // 原值
  tone: 'pass' | 'fail' | 'pending' | 'neutral'
  copyable?: boolean            // 路径/sha 类
}
/** 按 change 当前 gate 相位返回应展示的证据 chips（值为空/'null' 的路径类字段产出 pending 条目或剔除，见测试） */
export function gateEvidence(c: ChangeSnapshot, rules: WorkflowRules | undefined): EvidenceChip[]
```
- 映射规则（default workflow）：phase∈{verify}→`verify_result/agent_review_result/codex_review_result`（值 pass→tone pass、fail→fail、pending/空→pending）+ `verification_report`（非空→neutral copyable，空→剔除）+ `build_sha`（非空 copyable）；phase∈{explore,spec}→`design_doc/plan`（非空 copyable / 空→`key=未产出` pending）。自定义 workflow（rules 存在且非 default 或相位不在上表）→ 返回全部**非空**的路径型字段（design_doc/plan/verification_report/pr_url）neutral copyable。archived/非 gate 相位调用方自行不渲染（函数不判 gate）。

- [ ] **Step 1（红）:** 6 条测试：verify 门三轨+report+sha 齐全；fail 染 fail；空 report 剔除；explore 门 design_doc 有值+plan 未产出；自定义 workflow 只出非空路径字段；全空返回 []。
- [ ] **Step 2:** 跑红。 
- [ ] **Step 3（绿）:** 实现（纯函数，无 IO）。
- [ ] **Step 4:** 绿 + typecheck。
- [ ] **Step 5:** Commit：`feat(dashboard): gate 证据映射纯函数（Task 6，评审 P0-1）`

### Task 7: ChangeDetailCard 详情卡 + 收件箱行点开 + 键盘

**Files:**
- Create: `packages/dashboard-app/src/inbox/ChangeDetailCard.tsx`
- Modify: `packages/dashboard-app/src/inbox/InboxView.tsx`
- Test: `packages/dashboard-app/src/inbox/ChangeDetailCard.test.tsx`、`packages/dashboard-app/src/inbox/InboxView.test.tsx`

**Interfaces:**
- Produces:
```tsx
export interface ChangeDetailCardProps {
  root: string
  change: ChangeSnapshot
  rules: WorkflowRules | undefined
  onTransition: (name: string, root: string, event: string) => Promise<void>
  onClose: () => void
  onToast?: (msg: string) => void
  onError?: (msg: string) => void
}
export function ChangeDetailCard(props: ChangeDetailCardProps): JSX.Element  // data-testid="change-detail"
```
- 区块（v4 形态）：头（名字/相位/等你复核徽章/关闭✕）→「为什么在等你」一句话（`detail.why_gate` i18n：verify 门列出未过项）+ 证据格（gateEvidence 复用，格状排布）→ 产物（非空路径字段行+拷贝钮）→ 语境（workflow/track/preset/automation/created→updated）→ 底部动作条（出边按钮：前进=蓝实底「→ 放行」语义、回退=ghost 红「↩ 打回」走既有二次确认管线）。**无历史区**（spec §5 登记：待 history 读端点）。
- InboxView 变化：行 `onClick`/`Enter` 切换选中（`selected: string | null` state），选中行下方渲染 `<ChangeDetailCard>`；行本体加 `aria-expanded`；j/k 移动选中焦点环、Esc 关卡。行内追加 `<div class="ev">` 渲染 `gateEvidence` chips（copyable chip 点击 `navigator.clipboard.writeText` + toast，测试 stub clipboard）。
- 意图迁移表：`inbox-card` testid 不变；快捷钮 testid 不变；新 testid：`inbox-evidence-<name>`、`change-detail`、`detail-approve`、`detail-reject`。

- [ ] **Step 1（红）:** DetailCard 测试 5 条：verify 门渲染三轨语义色/产物路径可拷/「→ 放行」触发 onTransition(name,root,正确 event)/回退按钮弹确认（复用既有 pending 管线断言）/✕ 调 onClose。InboxView 测试 4 条：点行出 detail、Enter 出 detail、j/k 移动 `.kbd-focus`、Esc 关；证据 chips 行渲染 pass/fail tone 类名。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现两组件改动。
- [ ] **Step 4:** 全绿 + 三连门。
- [ ] **Step 5:** Commit：`feat(dashboard): 收件箱证据 chips + change 详情卡 + j/k 键盘（Task 7，评审 P0-1）`

### Task 8: 收件箱聚合语境 + 视觉迁移收口

**Files:**
- Modify: `packages/dashboard-app/src/inbox/inbox.ts`（`selectInbox`）、`packages/dashboard-app/src/inbox/InboxView.tsx`、`packages/dashboard-app/src/App.tsx`（rules 聚合拉取）
- Test: `packages/dashboard-app/src/inbox/inbox.test.ts`、`InboxView.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `currentRoot === ''` 聚合语义。
- Produces: `selectInbox(snapshot, currentRoot, rulesByKey)` 语义扩展：`currentRoot===''` 时遍历全部 ok 项目；**rules 键升级为 `${root} ${wf}`**（不同项目同名 workflow 定义可不同——评审排除合并列集的同一根因）：新纯函数 `export function rulesKey(root: string, wf: string): string`（`inbox.ts` 导出，看板/App 共用）；App 的 `useWorkflowRules` 调用点按 (root,wf) 对聚合去重拉取（`workflowModel.useWorkflowRules` 已按 root 参数化，App 聚合模式下对每个 root 各调一次 hook 不可行——改为 App 收集 `[{root, names}]` 后用新 hook `useWorkflowRulesMulti(pairs)`，内部复用既有 fetch/缓存，`packages/dashboard-app/src/model/workflowModel.ts` 新增导出）。
- 意图迁移表：`selectInbox` 既有单项目测试不变（非空 currentRoot 行为逐字保持）；`default` 恒 DEFAULT_RULES 零网络不变。

- [ ] **Step 1（红）:** inbox.test 新增：空串 currentRoot 聚合两项目 gate 卡且行带各自 root；rulesKey 区分同名 wf。workflowModel 新增 useWorkflowRulesMulti 测试（两 root 同名 wf 各自 fetch 一次、互不串缓存）。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现。
- [ ] **Step 4:** 全绿 + 三连门。
- [ ] **Step 5:** Commit：`feat(dashboard): 收件箱全部项目聚合 + (root,wf) 规则键（Task 8，G19③ 前半）`

## 阶段 3 · 看板

### Task 9: 看板卡点开详情（评审 P0-2 兑现 ARIA 契约）

**Files:**
- Modify: `packages/dashboard-app/src/board/BoardView.tsx`
- Test: `packages/dashboard-app/src/board/BoardView.test.tsx`

**Interfaces:**
- Consumes: Task 7 `ChangeDetailCard`。
- Produces: BoardView 内 `detail: {root,name} | null` state；卡片 `onClick`/`onKeyDown(Enter/Space)` 置 detail；看板 groups 下方渲染 `<ChangeDetailCard>`（`data-testid="change-detail"`），Esc/✕ 关。

- [ ] **Step 1（红）:** 测试：点卡出 detail 卡且内容对应；聚焦卡按 Enter 同效；Esc 关；detail 里放行按钮走 onTransition。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现（卡片既有 role/tabIndex 终于有行为；拖拽与点击并存：dragstart 时抑制 click——`draggingRef` 标记）。
- [ ] **Step 4:** 全绿。
- [ ] **Step 5:** Commit：`feat(dashboard): 看板卡片点开详情卡——死元素复活（Task 9，评审 P0-2）`

### Task 10: 拖拽合法性前示（评审 P1-11）

**Files:**
- Modify: `packages/dashboard-app/src/board/BoardView.tsx`、`packages/dashboard-app/src/styles.ts`（`.board__col--legal/.board__col--illegal/.board__col--shake` 三类）
- Test: `packages/dashboard-app/src/board/BoardView.test.tsx`

**Interfaces:**
- Produces: `dragging: {name,phase,workflow} | null` state；onDragStart 置入 → 每列按 `plannedTransition(rules, phase, step)` 得 legal/illegal 类；非法 onDrop → 该列加 shake 类 300ms + `onError(t('board.illegal_drop',{from,to}))`；drop/dragend 清态。i18n 新键 `board.illegal_drop`：「{from} 没有到 {to} 的转换边」（zh/en）。

- [ ] **Step 1（红）:** 测试：fireEvent.dragStart 卡片后合法列含 `--legal` 类、非法列含 `--illegal`；非法 drop 调 onError 且不调 onTransition；dragEnd 清除类。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现。
- [ ] **Step 4:** 全绿 + 三连门。
- [ ] **Step 5:** Commit：`feat(dashboard): 拖拽前示合法落点 + 非法 drop 反馈（Task 10，评审 P1-11）`

### Task 11: 看板聚合分组 + archive 展开名单

**Files:**
- Modify: `packages/dashboard-app/src/board/BoardView.tsx`
- Test: `packages/dashboard-app/src/board/BoardView.test.tsx`

**Interfaces:**
- Consumes: Task 8 `rulesKey`/聚合 rules。
- Produces: 聚合模式（currentRoot===''）分组键=`${root}:${wf}`，组头「`<root尾段>` · `<wf>`」双 mono；collapse localStorage 键沿用 `board.collapsed.${root}.${wf}` 不变。archive 折叠条改 `<button aria-expanded>`，点击展开只读名单（名字+归档时间 `archived_at`，无则 updated_at；`fold-body` grid-rows 动效同既有 foldOpen 词汇）。
- 意图迁移表：`board-fold-archive` testid 保留在折叠条按钮上；新 testid `board-archive-list`。

- [ ] **Step 1（红）:** 测试：聚合快照下两项目组独立渲染、组名带项目前缀、同名 wf 不同 rules 各用各的列集；archive 条点击展开列出 4 张名字、再点收起。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现。
- [ ] **Step 4:** 全绿 + 三连门。
- [ ] **Step 5:** Commit：`feat(dashboard): 看板聚合分组 + 归档点开名单（Task 11，G19③/④ 收编）`

## 阶段 4 · 工作台深化

### Task 12: AFK 活化（评审 P0-3 + P1-7）

**Files:**
- Create: `packages/dashboard-app/src/afk/useAfkLog.ts`
- Modify: `packages/dashboard-app/src/afk/AfkWorkbench.tsx`
- Test: `packages/dashboard-app/src/afk/useAfkLog.test.ts`、`packages/dashboard-app/src/afk/AfkWorkbench.test.tsx`

**Interfaces:**
- Produces:
```ts
/** 选中 running 任务时 2.5s 轮询日志；follow=false 暂停轮询；refresh() 手动拉一次 */
export function useAfkLog(name: string | null, status: string | undefined): {
  log: string; follow: boolean; setFollow(v: boolean): void; refresh(): Promise<void>
}
```
- AfkWorkbench 变化：日志区接 useAfkLog + 「跟随尾部」switch + 「↻ 刷新」ghost 钮 + 跟随时滚动到底；卡片加 root 徽章；列表按 currentRoot 过滤（''=全部）；详情区加「查看 change →」（回调 `onOpenChange(root,name)`，App 接线跳看板并打开该卡详情）；挂队输入换 `<input list>` + `<datalist>`（选项=snapshot 当前语境 change 名（相位），空输入时挂队钮 `disabled`）；取消任务走 Dialog 确认。
- 意图迁移表：既有「选中卡拉日志」断言改为「选中即拉第一次」（不变），新增轮询断言用 `vi.useFakeTimers`。

- [ ] **Step 1（红）:** useAfkLog 测试 4 条（fake timers：running 每 2.5s 拉、follow=false 停、refresh 主动拉、非 running 不轮询）；Workbench 测试 5 条（root 徽章/currentRoot 过滤/datalist 选项/空名禁用/取消弹确认）。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现。
- [ ] **Step 4:** 全绿 + 三连门。
- [ ] **Step 5:** Commit：`feat(dashboard): AFK 日志轮询+跟随+挂队识别化+语境对齐（Task 12，评审 P0-3/P1-7）`

### Task 13: Loops 深化（评审 P1-6）

**Files:**
- Modify: `packages/dashboard-app/src/loops/LoopsPanel.tsx`
- Test: `packages/dashboard-app/src/loops/LoopsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 3 Dialog；snapshot 行已含 `budget.remaining/maxTokensPerDay/spentToday/usedRatio/breaker` 与 `readiness.score/band/dimensions[]`（loops.ts 已产出，前端类型补齐字段即可）。
- Produces: 展开区新增预算行（进度条=usedRatio，>0.8 红；文案 `spentToday/maxTokensPerDay · 剩 remaining`）、就绪构成行（dimensions[] 逐项 ✓/✗，缺失则只显 band）、breaker==='tripped' 时红 tint 说明块（i18n `loops.tripped_help`：「预算断路器已熔断：今日额度用尽或超限。调整 loops.yaml 预算后重跑即复位。」）；升档钮 → Dialog 确认（正文含 band/预算摘要），确认后才 POST；降档保持直发。
- 意图迁移表：既有升档测试改为「点升档→出确认 Dialog→点确认→POST」；`loop-demote-*` 直发断言不变。

- [ ] **Step 1（红）:** 5 条测试：remaining 渲染、usedRatio>0.8 红条、tripped 说明块、升档确认后才 POST、取消不 POST。
- [ ] **Step 2:** 跑红。
- [ ] **Step 3（绿）:** 实现。
- [ ] **Step 4:** 全绿 + 三连门。
- [ ] **Step 5:** Commit：`feat(dashboard): Loops 预算/构成/熔断出口 + 升档确认（Task 13，评审 P1-6）`

## 阶段 5 · 编辑器 + 设置

### Task 14: 编辑器列表行信息量（评审 P2-14 前半）

**Files:**
- Modify: `packages/dashboard-app/src/workflow/WorkflowEditorView.tsx`
- Test: `packages/dashboard-app/src/workflow/WorkflowEditorView.test.tsx`

**Interfaces:**
- Produces: 列表行渲染 `steps.length` 相位 · `gate 数` 门 · `引用数` 张（引用数=snapshot 里 `fields.workflow===name` 的 change 计数，纯前端）；删除确认 Dialog 正文带引用数（>0 红字警示）。

- [ ] **Step 1（红）→ Step 5 Commit**（同上模式；测试 3 条：行 meta 渲染、删除确认含「2 张 change 正在引用」、零引用时不出警示）。Commit：`feat(dashboard): 编辑器列表行补步数/门数/引用数（Task 14）`

### Task 15: 编辑器阶段卡横排 + 脏状态守卫（评审 P1-8）

**Files:**
- Modify: `packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`、`packages/dashboard-app/src/styles.ts`（`.stage-card*` 词汇）
- Test: `packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx`

**Interfaces:**
- Produces: 画布上方阶段卡横排（steps 顺序渲染编号圆标+id+label+gate 标记，点击卡=选中该 step 打开 StepDetailPanel——与画布点节点同一状态；激活卡蓝描边）；`dirty` 位=当前 wf 与最近一次加载/保存快照的 `JSON.stringify` 比较；dirty 时标题旁 `未保存` chip（testid `canvas-dirty`）+ 保存钮实底（非 dirty ghost）；返回列表且 dirty → Dialog 确认「未保存的编辑将丢弃」。
- 意图迁移表：既有「点返回列表→onBack」测试改为「非 dirty 直接 onBack；dirty 时先确认」。

- [ ] **Step 1（红）:** 4 条：阶段卡渲染且点击选 step；改动后 canvas-dirty 出现；dirty 返回弹确认、确认后 onBack；保存成功后 dirty 清除。
- [ ] **Step 2-5:** 红→绿→三连门→Commit：`feat(dashboard): 编辑器阶段卡横排 + 脏状态守卫（Task 15，评审 P1-8）`

### Task 16: 设置穿梭框成品化（评审 P1-10 后半）

**Files:**
- Modify: `packages/dashboard-app/src/settings/SkillTransferModal.tsx`、`packages/dashboard-app/src/styles.ts`（`.transfer*` 类）
- Test: `packages/dashboard-app/src/settings/SettingsView.test.tsx`

**Interfaces:**
- Consumes: Task 3 Dialog（穿梭框整体改为 Dialog 承载，脱离 `<td>` 内联）。
- Produces: 左右栏条目**点击即移动**（拖拽保留）；`skill-available/skill-chosen` testid 不变。

- [ ] **Step 1（红）:** 测试：点击左栏条目 → 出现在右栏；Esc 关闭不 POST。
- [ ] **Step 2-5:** 红→绿→三连门→Commit：`fix(dashboard): 穿梭框 Dialog 化+点击移动+真样式（Task 16，评审 P1-10）`

## 阶段 6 · 收口

### Task 17: 视图骨架统一（面包屑/标题行/右栏摘要）

**Files:**
- Modify: `packages/dashboard-app/src/App.tsx`、`packages/dashboard-app/src/inbox/InboxView.tsx`（右栏：项目在制清单+选中 change 关联产物）、`packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`（右栏：摘要计数+生成配置 JSON 预览+复制）
- Test: 各视图测试补右栏断言（2 条/视图）

- [ ] **Step 1（红）:** 收件箱右栏渲染项目在制计数（聚合时逐项目行）；编辑器右栏 JSON 预览含 phases 数组且「复制 JSON」调 clipboard。
- [ ] **Step 2-5:** 红→绿→三连门→Commit：`feat(dashboard): Trellis 双列骨架——右栏摘要卡（Task 17）`

### Task 18: 真机验收 + 双主题截图（spec §6 验收标准）

**Files:**
- Create: `.playwright-tmp/acceptance-restyle.mjs`（以 `acceptance-redesign.mjs` 为骨架改写）
- Modify: `.playwright-tmp/shot-redesign.mjs` 环境段复用

- [ ] **Step 1:** 三连 build + 清孤儿端口（Global Constraints 命令）。
- [ ] **Step 2:** 验收脚本走全链：空注册表 onboarding → 注册（Esc 可逃逸断言）→ 新建 change → 收件箱见 gate 行+证据 chips → j/k/Enter 开详情 → 详情内放行（seedGateEvidence 造证据，参考旧脚本）→ 盖确认 → 看板点卡开详情 → 拖拽前示类名断言 → AFK 日志两次轮询内容变化 → Loops 升档确认框 → 全部项目聚合分组可见 → 六视图×双主题截图到 `.playwright-tmp/shots/restyle/`。
- [ ] **Step 3:** 跑到 `ACCEPTANCE_ALL_PASS` + 零 page error；人工过全部截图（对照 v4 真相源）。
- [ ] **Step 4:** Commit（若脚本迭代产生源码修复则随修随提）：`test(dashboard): 重塑真机验收脚本 + 双主题截图（Task 18）`

### Task 19: 文档收口

**Files:**
- Modify: `docs/loops/progress.md`（iteration-39 行）、`docs/TEST-REALITY.md`（评审 P0/P1 逐条改判追记 + 新遗留登记：详情历史区待 history 端点、AFK 轮询非 SSE）、`README.md`（dashboard 一节视觉描述更新）

- [ ] **Step 1:** 三份文档更新（progress 含全过程数字证据；TEST-REALITY 对照评审快照逐条 P0-1/P0-2/P0-3/P0-5/P1-5～P1-11 标记已闭/部分/登记）。
- [ ] **Step 2:** 最终三连门 + Commit：`docs: 重塑收口——progress iteration-39 + TEST-REALITY 评审改判`

---

## Self-Review 结论

- spec 覆盖：§1→T1，§2→T1/T2/T3，§3→T5/T17，§4.1→T6/T7/T8，§4.2→T9/T10/T11，§4.3→T14/T15（保存缓存已在 0a7204d 修复），§4.4→T12，§4.5→T13，§4.6→T16，§4.7→T4/T5，§6→T18。评审 P0-4/P1-5 前半/P1-10 前半已在本计划前落地（0a7204d/8a5de4d/528c292），不重复排任务。
- 已知留白（有意）：详情卡历史区（待 history 读端点，spec §5 登记）；键盘数字键触发出边（P2 尾巴，未排）。
- 类型一致性：`rulesKey`/`useWorkflowRulesMulti`/`ChangeDetailCard`/`gateEvidence`/`useAfkLog` 的签名在各消费任务中逐字一致。
