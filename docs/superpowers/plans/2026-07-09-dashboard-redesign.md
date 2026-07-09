# Dashboard 全量重构实现计划（工票车间 × 分组看板 × G17/G18）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 本计划按 **inline 执行**（执行者 = 拥有完整侦察上下文的本会话）编写：新契约给完整代码；
> 重写类任务给结构/testid/i18n 清单 + 指向视觉真相源。视觉真相源 = 已经 Playwright 深浅色
> 验证过的 demo：`.superpowers/brainstorm/97296-1783564232/content/{design-language,g17-layout,all-views,forms-motion}.html`。
> 规格：`docs/superpowers/specs/2026-07-09-dashboard-redesign-design.md`（其 §N 编号在下文直接引用）。

**Goal:** packages/dashboard-app 推倒重来换成「工票车间」设计语言，根治 G17（分组看板 + gate 泛化），交付 G18（注册项目/新建 change 闭环，动 server），顺手吃掉 G14（项目切换器）。

**Architecture:** 前端相位模型收敛到新模块 `workflowModel.ts`（default 走 types.ts 常量、自定义走既有 `GET /api/workflows/:name` + 缓存）；styles.ts 单文件 token 全量替换；server 新增 3 个写端点复用既有三层鉴权 + 信任锚模式；动效仍走 GSAP motion.ts。

**Tech Stack:** React 18 + vite + vitest/RTL（jsdom）、GSAP、@xyflow/react、node stdlib http server、Playwright（真机验收）。

## Global Constraints（每个任务隐含遵守）

- **现有 21 个端点请求/响应形状零改动**；新端点走 handlePost/handleDelete 既有三层鉴权（Host 守卫 403 → token 401 → Content-Type 400）+ 信任锚 `dedupeRoots(registry()).includes(resolvePath(root))` → 404。
- **CSP 自足红线**：零外部字体/CDN/图片；styles.ts 是唯一样式源（内联注入）。
- **禁**：>1px 单侧彩边（side-stripe）、bounce/elastic 缓动、gradient text、页面加载编排动效。
- **动效纪律**：150-250ms、ease-out 族（power2/power3/power4.out）、reduced-motion 一律瞬时（沿用 styles.ts 全局覆盖 + motion.ts prefersReducedMotion 双保险）。
- **i18n**：所有新 UI 文案走 `t()`，zh/en 同步加（completeness 测试守结构对齐）；key 清单在各任务列出。
- **阶段门**：每阶段末 `npm test`（node 侧 150 文件）+ `npm run test:web`（jsdom 19+ 文件）+ `npx tsc --noEmit -p packages/dashboard-app` 全绿才准进下一阶段；涉及视图的阶段补 Playwright 深浅色截图对比。
- **测试重写纪律**：改 markup 前先读该视图 `*.test.tsx`，逐条迁移测试意图（断言的行为不丢）；testid 变更在任务里显式列出。
- **提交风格**：仓库惯例 `feat(dashboard): …` / `fix(server): …` 中文主题，小步频繁提交。
- **颜色书写**：新增色值一律 hex 落地 + 行内注释 OKLCH 来源（spec §1.1 表为准）。

---

## 阶段 1 · token 基础层

### Task 1: styles.ts 全量重写（工票车间 token + 全部基础组件类）

**Files:**
- Modify: `packages/dashboard-app/src/styles.ts`（整文件替换，保留 `export const GLOBAL_CSS` 导出名）

**Interfaces:**
- Consumes: 无（纯 CSS 层）
- Produces: 全部视图消费的 class 体系；后续任务新增 class 也追加进本文件

**要点：**

1. token 三段式机制保留（`:root` 浅色默认 → `@media (prefers-color-scheme: dark)` → `[data-theme="light"]`/`[data-theme="dark"]` 显式覆盖），值全换。**浅色段逐字**：

```css
:root {
  --bg: #ffffff; --surface: #ffffff; --well: #f2f6f3;
  --ink: #191c1a; --ink-soft: #3b423d; --ink-mute: #5b625d;
  --line: #dfe5e0; --plate: #1f4d33; --plate-fg: #f2f7f3;
  --green: #23854f; --green-soft: #e3f2e8;            /* oklch(0.60 0.158 150) 系 */
  --verm: #c23a26; --verm-soft: #fae3de;              /* oklch(0.55 0.19 30) 系 */
  --gate-bg: #c23a26; --gate-fg: #ffffff;
  --ok: #23854f; --ok-soft: #e3f2e8; --danger: #c23a26; --danger-soft: #fae3de;
  --run: #23854f; --focus: #1f4d33;
  --radius: 10px; --radius-sm: 8px; --radius-lg: 12px;
  --shadow: none; --shadow-dialog: 0 14px 40px rgba(10,22,14,.25);
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}
```

深色段（media + data-theme 两处同值）：

```css
--bg: #131a15; --surface: #131a15; --well: #1a231d;
--ink: #e9efe9; --ink-soft: #c2cbc4; --ink-mute: #96a099;
--line: #2c372f; --plate: #245c3c; --plate-fg: #eaf4ec;
--green: #4dbb82; --green-soft: rgba(77,187,130,.15);
--verm: #e56a54; --verm-soft: rgba(229,106,84,.16);
--gate-bg: #b6402c; --gate-fg: #ffffff;
--ok: #4dbb82; --ok-soft: rgba(77,187,130,.15); --danger: #e56a54; --danger-soft: rgba(229,106,84,.16);
--run: #4dbb82; --focus: #6fcf9a;
--shadow-dialog: 0 14px 40px rgba(0,0,0,.5);
```

2. **兼容别名**：`--accent: var(--green); --accent-soft: var(--green-soft); --gate: var(--verm); --gate-soft: var(--verm-soft); --sunken: var(--well);` —— 让尚未换装的组件在阶段间隙不裸奔（阶段 6 末删除别名并 grep 确认无消费方）。
3. **class 清单**（demo 为视觉真相源，选择器名沿用现有 BEM，测试查 testid/text 不查 class，故 class 内部样式随便换）：
   - 保留选择器名、换样式：`.app/.main/.nav*/.view*/.empty*/.card*/.badge*/.board*/.tabs/.tab/.settings*/.matrix*/.axis*/.footer*/.advanced*/.btn*/.dialog*/.flash*/.input/.select/.field/.workflow-editor*/.workflow-canvas*/.step-detail-panel*/.btn--icon`。
   - 新增（G17/新组件用，阶段 2+ 消费）：`.plate`（deep-green 分组头）`.board__group/.board__group-head/.board__group-caret`、`.ticket-row`（工票行）`.ticket-row--gate`、`.qk`（快捷按钮容器）`.qk__btn/.qk__btn--back`、`.g-phase`（相位胶囊）、`.wf-label`、`.btn--verm-ghost`、`.stamp`、`.toast/.toast--error`（替代 flash 视觉，元素/testid 不变）、`.loop-*`、`.afk-*`、`.traffic-*`、`.onboard-*`、`.transfer-*`、`.newchange-*`（各视图任务落地时按 demo 追加，本任务先放核心通用件：plate/ticket-row/qk/g-phase/badge 语义色/btn 家族/dialog/toast/表单错误态 `.input--error/.field__error`）。
   - 徽章语义（spec §1.3）：`.badge--phase`= well 底 mono 胶囊；`.badge--gate`= `--gate-bg` 实底白字（琥珀退役）；`.badge--run`= 绿点绿字。
   - 卡片 meta 票根虚线：`.card__meta { border-top: 1px dashed var(--line); }`。
   - `:focus-visible` 环用 `--focus`；reduced-motion 全局覆盖保留原样。
4. xyflow 主题化段照旧存在（值跟 token 走）+ 画布点阵网格底：`.workflow-canvas__stage { background-image: radial-gradient(var(--line) 1px, transparent 1px); background-size: 22px 22px; }`。

**Steps:**

- [x] **Step 1**: 重写 `styles.ts`（上述 token + 全部既有选择器按 demo 语言重样式 + 新增核心通用件）。
- [x] **Step 2**: `npm run test:web` → 预期 PASS（纯 CSS 不碰 markup/testid；若有测试查了 class 名，逐条核对该测试意图后同步）。
- [x] **Step 3**: `npx tsc --noEmit -p packages/dashboard-app` → 预期 0 错误。
- [x] **Step 4**: `git add … && git commit -m "feat(dashboard): 工票车间 token 体系落地，styles.ts 全量重写（spec §1）"`。

### Task 2: 深浅色截图基线

**Files:**
- Create: `.playwright-tmp/shot-redesign.mjs`（复用 `.playwright-tmp/helpers.mjs` 的 `collectPageErrors`）

**Steps:**

- [x] **Step 1**: 写截图脚本：`npm run build:web && npm run build:server`，`PIPELINE_DASHBOARD_HOME=<临时目录> PIPELINE_DASHBOARD_PORT=8799 node packages/server/dist/dashboard.mjs` 起真 server（临时 home 里预写 `~/.claude/pipeline-projects.json` 指向一个 `pipeline init` 出来的 demo 项目），对 收件箱/看板/设置/loops/afk/workflows 六视图 × 深浅色截图到 `.playwright-tmp/shots/`，`collectPageErrors` 断言零 page error。
- [x] **Step 2**: 跑脚本，人工核对截图与 demo 观感一致（token 生效、无裸奔区）。
- [x] **Step 3**: commit：`chore(dashboard): 重构期截图基线脚本`。

---

## 阶段 2 · G17 核心（workflowModel + 收件箱 + 看板）

**阶段级决策（spec §8 的延伸，就此定死）**：项目切换器语义 = 看板/收件箱**只显示 `currentRoot` 项目的卡**（与 AFK/workflow 编辑器的既有 per-root 语义对齐）；Nav 收件箱徽章数同步按 currentRoot。原"全项目聚合"行为退役，相关测试意图迁移为"当前项目"。

### Task 3: workflowModel 模块

**Files:**
- Create: `packages/dashboard-app/src/model/workflowModel.ts`
- Test: `packages/dashboard-app/src/model/workflowModel.test.tsx`（jsdom，stub fetch）

**Interfaces:**
- Consumes: `types.ts` 的 `PHASES/TRANSITIONS/EVENT_BY_EDGE/REVIEW_PHASES`（**常量留在 types.ts 不动**——`board/transition-mirror.test.ts` 的单源守卫零改动；views 从此只经本模块消费）；`StepDef` type-only import 自 `../workflow/StepDetailPanel`（该文件头注释声明的单一真相源）。
- Produces（后续任务消费的精确签名）:

```ts
export interface WorkflowRules {
  steps: readonly string[]
  transitions: Record<string, readonly { event: string; to: string }[]>
  gateByStep: Record<string, 'review' | 'confirm' | null>
}
export const DEFAULT_RULES: WorkflowRules
export function rulesFromDef(def: { name: string; steps: StepDef[] }): WorkflowRules
/** (root,name) 模块级缓存；失败进 errors 不进 rules；'default' 恒命中 DEFAULT_RULES 零网络 */
export function useWorkflowRules(root: string, names: readonly string[]): {
  rules: Map<string, WorkflowRules>; errors: Map<string, string>; loading: boolean
}
export function invalidateWorkflowRules(root?: string, name?: string): void
```

实现要点：`DEFAULT_RULES` 由四常量构造（`gateByStep`: REVIEW_PHASES→'review' 其余 null；`transitions[from]` = TRANSITIONS[from].map(to => ({event: EVENT_BY_EDGE[`${from}->${to}`], to}))，排除 archive→archive 自环之外照抄）；fetch 走 `/api/workflows/${name}?root=`（同 client.ts 错误处理惯例：先 r.ok 再 json）；缓存 `Map<`${root} ${name}`, WorkflowRules>` 模块级 + in-flight promise 去重。

**Steps:**

- [x] **Step 1**: 写失败测试（≥6 例）：DEFAULT_RULES 形状（7 steps/verify 双出口/gate 三相位）；rulesFromDef 映射（含 gate:'confirm'/null）；useWorkflowRules 对 default 零 fetch；自定义名触发 fetch 且缓存命中第二次零 fetch；fetch 404 → errors 有 entry、rules 无 entry；invalidate 后重新 fetch。
- [x] **Step 2**: `npm run test:web -- src/model/workflowModel.test.tsx` → 预期 FAIL（模块不存在）。
- [x] **Step 3**: 实现模块。
- [x] **Step 4**: 同命令 → PASS；`npm run test:web` 全量 → PASS。
- [x] **Step 5**: commit：`feat(dashboard): workflowModel——default 常量/自定义 API 的混合相位模型（G17 核心，spec §2.1）`。

### Task 4: events.ts 泛化

**Files:**
- Modify: `packages/dashboard-app/src/board/events.ts`
- Test: `packages/dashboard-app/src/board/events.test.tsx`（现有测试迁移）

**Interfaces:**
- Produces: `plannedTransition(rules: WorkflowRules, fromStep: string, toStep: string): PlannedTransition | null`（`backward` = `rules.steps.indexOf(to) < rules.steps.indexOf(from)`）；`legalTargets(rules: WorkflowRules, step: string): readonly string[]`。`PlannedTransition.from/to` 类型放宽为 `string`。

**Steps:**

- [x] **Step 1**: 迁移现有 events 测试为 rules 注入式（default 用 DEFAULT_RULES 断言行为逐字不变：build→verify=build-complete、verify→build=backward、open→verify=null）+ 新增自定义 rules 用例（draft→review→ship，review→draft 为 backward）。
- [x] **Step 2**: 跑 → FAIL（签名不符）。
- [x] **Step 3**: 改实现（删除 isPhase/ORDER 依赖，全部从 rules 推导）。
- [x] **Step 4**: `npm run test:web -- src/board/events.test.tsx` → PASS。
- [x] **Step 5**: commit：`feat(dashboard): plannedTransition/legalTargets 按 WorkflowRules 泛化（G17）`。

### Task 5: inbox 谓词泛化 + InboxView 工票行重写

**Files:**
- Modify: `packages/dashboard-app/src/inbox/inbox.ts`、`packages/dashboard-app/src/inbox/InboxView.tsx`
- Test: `packages/dashboard-app/src/inbox/inbox.test.tsx`、`packages/dashboard-app/src/inbox/InboxView.test.tsx`
- Modify: `packages/dashboard-app/src/i18n/translations.ts`

**Interfaces:**
- Produces: `isAwaitingDecision(c, rules: WorkflowRules): boolean`（判据 `!archived && rules.gateByStep[c.phase] === 'review'`）；`selectInbox(snapshot, root: string, rulesByWf: Map<string, WorkflowRules>): InboxItem[]`（只收 root 匹配项目；change 的 wf = `c.fields.workflow ?? 'default'`，rulesByWf 缺失该 wf → 该卡不判 gate（错误分组由 Board 呈现，收件箱不误报））；`decisionKind` 泛化：default 三相位保留原 key，其余返回 `'other'`。
- InboxView props 变化：`{ snapshot, loading, error, currentRoot: string, onOpenBoard, onTransition, onToast, onError }`（快捷按钮直推转换，复用 App 的 onTransition 管线）。
- 行结构（demo all-views §1 为真相源）：`li.ticket-row.ticket-row--gate[data-testid=inbox-card]` 内：`.card__name`(mono) + `.card__track` + `.wf-label`[data-testid=inbox-card-wf] + `.g-phase`[data-testid=inbox-card-phase] + `.badge--gate`(文案 `t('inbox.badge_waiting')`) + 时间 + `.qk`（`legalTargets` 出边按钮：正向 `.qk__btn`、回退 `.qk__btn--back`，data-testid=`inbox-quick-<event>`；回退走与看板同款确认对话框）。
- 新 i18n key：`inbox.badge_waiting`（等你复核/Awaiting review）、`inbox.quick_go`（→ {to}）、`inbox.quick_back`（↩ {to}）。

**Steps:**

- [x] **Step 1**: 重写两个测试文件：迁移原 8 个意图（空态/去看板/只渲染 gate 卡/计数/决定文案/相位徽章/loading/error）到 currentRoot + rules 注入语境；新增：自定义 workflow gate 卡进收件箱（fields.workflow='release-train'、phase='review'、rules gate=review）；快捷按钮点击 → onTransition(name, root, event)；verify 卡双按钮且回退需确认。
- [x] **Step 2**: 跑 → FAIL。
- [x] **Step 3**: 实现 inbox.ts + InboxView + i18n key。
- [x] **Step 4**: `npm run test:web -- src/inbox` → PASS。
- [x] **Step 5**: commit：`feat(dashboard): 收件箱 gate 泛化 + 工票行重写（G17，spec §2.3）`。

### Task 6: BoardView 分组看板重写

**Files:**
- Modify: `packages/dashboard-app/src/board/BoardView.tsx`
- Test: `packages/dashboard-app/src/board/BoardView.test.tsx`
- Modify: `packages/dashboard-app/src/i18n/translations.ts`

**Interfaces:**
- Props 变化：`{ snapshot, loading, error, currentRoot: string, onTransition, onToast, onError }`。
- 结构（demo g17-layout 方案 1 为真相源）：按 `fields.workflow ?? 'default'` 分组（default 前、自定义按名序）；每组 `section[data-testid=board-group-<wf>]`：`.board__group-head.plate`（折叠 caret[data-testid=board-fold-<wf>] + wf 名 mono + `N 相位 · M 张`）+ `.board__grid`（列数 = 该组 rules.steps.length，`grid-template-columns: repeat(<n>, minmax(126px,1fr))`，inline style）。
- **testid 变更表**（旧 → 新）：`board-col-<phase>` → `board-col-<wf>-<step>`；`board-col-count-<phase>` → `board-col-count-<wf>-<step>`；`board-card-<name>` 不变；`board-confirm`/`board-confirm-yes` 不变；新增 `board-group-<wf>`、`board-fold-<wf>`、`board-quick-<name>-<event>`、`board-group-error-<wf>`。
- 行为：拖拽 payload 增带 `workflow` 字段；drop 用该卡所属组的 rules 调 `plannedTransition`；卡片 hover/focus-within 显示 `.qk` 快捷按钮（CSS 控制显隐，DOM 常在——测试可直接点）；default 组 archive 末列渲染 `.board__fold`（"N 张已归档"计数条，卡不逐张渲染）；自定义组的末位 step 正常渲染卡片；折叠态存 localStorage `board.collapsed.<root>.<wf>`；rules 加载失败的组 → 组头照常 + `board-group-error-<wf>` 朱红提示 + 卡片只读平铺（不可拖、无快捷按钮）。
- 新 i18n key：`board.group_meta`（{steps} 相位 · {cards} 张）、`board.group_error`（workflow 定义加载失败：{msg}）、`board.archived_fold`（{n} 张已归档）。

**Steps:**

- [x] **Step 1**: 重写 BoardView.test.tsx：迁移原 9 个意图（7 列渲染→default 组 7 列；卡落对应列；无矩阵泄漏；空态；拖拽正向=build-complete；跨项目重名→改为同项目内行为（currentRoot 语义）；回退确认→verify-fail；非法落点 no-op；失败→onError）+ 新增：自定义 workflow 独立分组渲染自己的列集；自定义组内拖拽用自己的 event 名；快捷按钮推进；折叠隐藏组 body；rules 失败组只读降级；archive 折叠计数。fetch stub：`vi.stubGlobal('fetch', …)` 返回 release-train WorkflowDef（gate step 齐全）。
- [x] **Step 2**: 跑 → FAIL。
- [x] **Step 3**: 实现 BoardView 重写 + i18n key + styles.ts 追加 `.board__group*` 等（Task 1 已放核心件，此处补齐缺口）。
- [x] **Step 4**: `npm run test:web -- src/board` → PASS。
- [x] **Step 5**: commit：`feat(dashboard): 分组看板落地——每个 workflow 独立列集 + 快捷转换 + 折叠（G17，spec §2.2）`。

### Task 7: App/Nav 接线 currentRoot + 阶段门

**Files:**
- Modify: `packages/dashboard-app/src/App.tsx`（currentRoot 升级为 state：默认 snapshot.projects[0]，localStorage `pipeline-dashboard-root` 记忆 + snapshot 校验回退；向 Inbox/Board 传新 props；inboxCount 改按 currentRoot + rules）
- Modify: `packages/dashboard-app/src/App.test.tsx`（fetch/EventSource stub 语境下迁移）
- Test: `npm run test:web` 全量

**Steps:**

- [x] **Step 1**: App 测试补 currentRoot 语义用例（双项目 snapshot：默认第一个；G14 注释块删除）。
- [x] **Step 2**: 实现接线；删除 App.tsx:49-52 的 G14 注释。
- [x] **Step 3**: 阶段门全跑：`npm test` && `npm run test:web` && `npx tsc --noEmit -p packages/dashboard-app` → 全 PASS。
- [x] **Step 4**: 更新 Task 2 截图脚本跑一遍深浅色（含一个自定义 workflow change 的分组看板证据截图）。
- [x] **Step 5**: commit：`feat(dashboard): App currentRoot 状态化接线 G17 视图（阶段 2 收口）`。

---

## 阶段 3 · G18 server 端点（TDD）

### Task 8: POST/DELETE /api/projects

**Files:**
- Create: `packages/server/src/projects.ts`
- Modify: `packages/server/src/server.ts`（handlePost/handleDelete 各加一个分支；paths 已在闭包）
- Test: `packages/server/src/server.test.ts`（新 describe 两组）

**Interfaces:**

```ts
// projects.ts —— 注册表写模块（读沿用 registry.ts::readRegistry，绝不引入缓存）
export type AddProjectResult =
  | { ok: true; root: string }                       // root = resolvePath 规范化
  | { ok: false; code: 400 | 404 | 409; error: string }
export function addProjectToRegistry(registryPath: string, rawRoot: unknown): AddProjectResult
// 校验序：非空 string→400；statSync 存在且 isDirectory→404；resolvePath 后已在
// dedupeRoots(readRegistry(registryPath))→409；否则读原数组 push 规范化路径、
// JSON.stringify(arr, null, 2) 写回（mkdirSync(dirname, {recursive}) 兜 ~/.claude 不存在）。
export type RemoveProjectResult = { ok: true } | { ok: false; code: 400 | 404; error: string }
export function removeProjectFromRegistry(registryPath: string, rawRoot: unknown): RemoveProjectResult
// 过滤规则：resolvePath(rawRoot) 与逐条 resolvePath(entry) 相等的移除；无命中→404。
```

server.ts 接线：handlePost `if (path === '/api/projects')`（**豁免信任锚**——见 spec §3.1，注释写明理由）→ `addProjectToRegistry(paths.registryPath, body.root)` → ok?200:code。handleDelete `if (path === '/api/projects')` → root 从 query 取 → 同上。

**Steps:**

- [x] **Step 1**: server.test.ts 新增 describe（harness：`start()` 不注入 registry 时需走真文件——现 harness 固定注入 `registry: () => [root]`；为本组测试写局部 `startWithHome()`：`makeTempHome()` + `createDashboardServer({ home, store, flow: testFlow(), token, clock })`，registry 走真 `<home>/.claude/pipeline-projects.json`）。用例（POST）：200 注册成功且文件真落盘含规范化路径 + `GET /api/snapshot` 立即可见该项目；400 body 非对象/root 非串；404 路径不存在；404 是文件非目录；409 重复注册（含"尾斜杠不同写法"归一化判重）；401 无 token；403 假 Host；400 非 JSON Content-Type。（DELETE）：200 注销且文件更新；404 未注册；400 缺 root query；401 无 token。
- [x] **Step 2**: `npm test -- packages/server/src/server.test.ts` → 新用例 FAIL（404 未知端点）。
- [x] **Step 3**: 实现 projects.ts + server.ts 两分支。
- [x] **Step 4**: 同命令 → PASS；`npm test` 全量 → PASS。
- [x] **Step 5**: commit：`feat(server): POST/DELETE /api/projects——dashboard 注册/注销项目（G18，spec §3.1）`。

### Task 9: POST /api/changes

**Files:**
- Modify: `packages/server/src/server.ts`（handlePost 加分支）
- Test: `packages/server/src/server.test.ts`

**Interfaces:**
- 请求 `{root, name, workflow?, track?}`；track 缺省 `'chat'`、preset 固定 `'full'`（server 侧常量，注释说明）；成功 `200 {ok:true, name, path}`。
- 校验序（全部先于任何落盘）：三层鉴权（既有）→ body 对象 → root 信任锚（**本端点要求已注册**，404）→ name 正则 `^[a-zA-Z0-9_-]+$`（400）→ track ∈ TRACKS（400）→ workflow 若给且非 default：`loadWorkflow(root, workflow)` null→404 / throw→400（校验错文案透传）/ steps[0] 缺→400 → `store.init({repoRoot: root, name, track, preset: 'full', clock})`（已存在等 kernel 抛错→400 文案透传）→ 自定义时 `store.setMany(created, { workflow, phase: steps[0].id })`（对齐 cli/commands/init.ts:69-80 语义；history 记账为 CLI 侧 best-effort 职责，server 端点不写 history，注释登记差异）。
- kernel import 追加：`loadWorkflow`（server.ts 顶部 import from '@pipeline-lite/kernel'）。

**Steps:**

- [x] **Step 1**: 新 describe 用例：200 默认（走 startWithHome + 先经 POST /api/projects 注册，断言 `openspec/changes/<name>/.pipeline.yaml` 真落盘、snapshot 出现该 change、phase='open'、track='chat'）；200 显式 track=frontend；200 自定义 workflow（真写 `.pipeline/workflows/rel.yaml` 极简两 step 定义→断言 phase=首 step id、fields.workflow='rel'）；400 name 非法；400 track 非法；400 重复 name；404 workflow 不存在；404 root 未注册；401/403/Content-Type 三连。
- [x] **Step 2**: 跑 → FAIL。
- [x] **Step 3**: 实现分支。
- [x] **Step 4**: `npm test` 全量 → PASS。
- [x] **Step 5**: commit：`feat(server): POST /api/changes——pipeline init 的 HTTP 化（G18，spec §3.1）`。

### Task 10: 前端 client.ts 扩展

**Files:**
- Modify: `packages/dashboard-app/src/api/client.ts`
- Test: `packages/dashboard-app/src/api/client.test.tsx`

**Interfaces（Produces，阶段 4 消费）:**

```ts
export async function registerProject(root: string): Promise<{ root: string }>
export async function unregisterProject(root: string): Promise<void>
export async function createChange(input: { root: string; name: string; workflow?: string; track?: string }): Promise<void>
export async function fetchWorkflowNames(root: string): Promise<string[]>   // GET /api/workflows?root=
```

全部沿用 postTransition 的错误处理惯例（非 2xx 读 `{error}` 抛 ApiError；DELETE 不带 Content-Type）。

**Steps:**

- [x] **Step 1**: client.test.tsx 补四函数用例（stub fetch：断言 method/headers/body 形状 + 错误文案透传）。
- [x] **Step 2**: FAIL → 实现 → PASS。
- [x] **Step 3**: 阶段门三连跑 → 全 PASS。commit：`feat(dashboard): api client 补 G18 四函数`。

---

## 阶段 4 · G18 前端（切换器 + 新建对话框 + 教学空状态）

### Task 11: Nav 项目切换器

**Files:**
- Modify: `packages/dashboard-app/src/shell/Nav.tsx`、`packages/dashboard-app/src/App.tsx`
- Test: `packages/dashboard-app/src/shell/Nav.test.tsx`
- Modify: `packages/dashboard-app/src/i18n/translations.ts`

**Interfaces:**
- Nav 新 props：`projects: { root: string; name: string; count: number }[]`（App 从 snapshot 派生，name=root 尾段）、`currentRoot: string`、`onRoot: (root: string) => void`、`onRegisterProject: () => void`（打开注册对话框——复用 onboarding 的注册表单组件，见 Task 13）。
- 结构：brand 右侧 `.nav__project`（下拉按钮 data-testid=`project-switcher`，单项目时渲染为静态标签无下拉）；菜单项 data-testid=`project-item-<name>`；末项"＋ 注册项目…" data-testid=`project-register`。
- 新 key：`nav.project_register`（＋ 注册项目…/+ Register project…）。

**Steps:**

- [x] **Step 1**: Nav.test 补用例（双项目渲染下拉/点击切换回调/单项目静态/注册入口回调）。FAIL → 实现 → PASS。
- [x] **Step 2**: App 接线（onRoot 更新 state + localStorage）。`npm run test:web` → PASS。
- [x] **Step 3**: commit：`feat(dashboard): 导航项目切换器（吃掉 G14，spec §3.2/D5）`。

### Task 12: NewChangeDialog + 入口接线

**Files:**
- Create: `packages/dashboard-app/src/shell/NewChangeDialog.tsx`
- Test: `packages/dashboard-app/src/shell/NewChangeDialog.test.tsx`
- Modify: `App.tsx`（对话框状态 + 收件箱/看板 view__head 的"＋ 新建 change"绿主按钮接线，testid=`new-change-open`）

**Interfaces:**

```ts
export interface NewChangeDialogProps {
  root: string
  onClose: () => void
  onCreated: () => void          // App: refresh() + toast
}
```

- 结构（demo forms-motion §1 真相源）：dialog role + 名字 mono 输入（onChange 实时校验 `^[a-zA-Z0-9_-]+$`，非法 → `.input--error` + `.field__error`[data-testid=newchange-name-error]，创建钮 disabled）+ workflow 下拉（`default` + `fetchWorkflowNames(root)`）+ track 下拉（TRACKS 四项，默认 chat）+ `.dlg-cli` 灰票块实时拼 `$ pipeline init <name> --workflow <wf> --track <track>`[data-testid=newchange-cli] + 取消/创建（testid=`newchange-submit`）。提交走 `createChange`，ApiError 文案落行内 `newchange-server-error`。
- 新 key：`newchange.title/desc/name_label/name_error/workflow_label/track_label/create/cancel/created_toast`（zh/en 全量）。

**Steps:**

- [x] **Step 1**: 测试（渲染/名字校验实时错误+禁用/CLI 教学行实时更新/提交调 createChange 正确 body/成功回调/server 错误行内呈现/取消关闭）。FAIL。
- [x] **Step 2**: 实现组件 + App 接线 + styles.ts 追加 `.newchange-*`/`.dlg-cli`。
- [x] **Step 3**: `npm run test:web` → PASS。commit：`feat(dashboard): 新建 change 对话框 + 全局入口（G18，spec §3.2）`。

### Task 13: 教学空状态（onboarding）

**Files:**
- Create: `packages/dashboard-app/src/shell/Onboarding.tsx`（两形态：零项目=注册表单+CLI 块；有项目零 change=新建引导+`pipeline init` CLI 块）
- Test: `packages/dashboard-app/src/shell/Onboarding.test.tsx`
- Modify: `App.tsx`（snapshot.project_count===0 时全 view 替换为零项目形态；InboxView/BoardView 空态换用零 change 形态）

**Interfaces:**

```ts
export function Onboarding(props: {
  kind: 'no-project' | 'no-change'
  root?: string                       // no-change 形态用于 CLI 命令拼写
  onRegistered?: () => void           // 注册成功 → App refresh
  onNewChange?: () => void            // no-change 形态的主按钮 → 打开 NewChangeDialog
}): JSX.Element
```

- 结构（demo all-views §6 真相源）：`.onboard` 票卡：深绿 mark 块 + 标题 + 说明 + （no-project）路径输入+`registerProject` 提交（错误行内 testid=`onboard-error`）+ 分隔线"或者用 CLI" + `.ob-cli` mono 块 + 复制按钮（`navigator.clipboard.writeText`，成功换文案"已复制"2s；jsdom 下 stub）。
- 新 key：`onboard.*`（no_project_title/no_project_desc/register/path_placeholder/or_cli/copy/copied/no_change_title/no_change_desc/new_change）。

**Steps:**

- [x] **Step 1**: 测试（两形态渲染/注册提交调 registerProject/成功回调/错误呈现/复制按钮文案切换/no-change 主按钮回调）。FAIL → 实现 → PASS。
- [x] **Step 2**: App/Inbox/Board 空态接线；`npm run test:web` 全量 + `npm test` + tsc 三连 → PASS。
- [x] **Step 3**: Task 2 截图脚本补零项目/零 change 两形态截图（深浅色）。
- [x] **Step 4**: commit：`feat(dashboard): 教学式空状态——注册/新建双路径 onboarding（G18 收口，spec §3.2）`。

---

## 阶段 5 · 零样式三件套

### Task 14: LoopsPanel 重写

**Files:**
- Modify: `packages/dashboard-app/src/loops/LoopsPanel.tsx`、`packages/dashboard-app/src/loops/LoopsPanel.test.tsx`、`translations.ts`、`styles.ts`（`.loop-*` 按 demo all-views §3）

**结构（demo 真相源）**：table 换 `.g-list` 工票行列表：每行 `.loop-row`[data-testid=`loop-row-<id>`]：caret + id(mono) + `.loop-level`（深绿铭牌徽章 `L2 · 半自动`，档位副标签 key `loops.level_l1/l2/l3`）+ `.loop-ready`（就绪度 `{score}`，绿 mono）+ breaker 徽章（ok 绿/warn 中性/tripped 朱红——**去 emoji**，语义色徽章替代，文案 key 复用现有 breaker_*去掉 emoji）+ spacer + 升档 `.qk__btn`[testid=`loop-promote-<id>`]/降档 ghost（降档现无端点——**不做降档按钮**，YAGNI，demo 中仅为视觉示意；登记到任务注释）+ 展开区（band 行 + `promoteError` 朱红 `.loop-reject` 条[testid=`loop-reject`]）。

**测试意图迁移表**（先读现 LoopsPanel.test.tsx 逐条核对后重写）：加载错误可见 / 空态 / 行渲染（id/level/readiness/breaker）/ 点击展开 / 升档成功 refetch / 升档被拒（400 body errors）文案可见 / L3 无升档钮。

**Steps:**

- [x] **Step 1**: 读现测试 → 重写测试（意图表全覆盖 + 新 testid）。FAIL。
- [x] **Step 2**: 重写组件 + styles + i18n（`loops.level_l1: '提案制'` 等 zh/en）。
- [x] **Step 3**: `npm run test:web -- src/loops` → PASS。commit：`feat(dashboard): Loop 治理面板工票化重写（spec §4）`。

### Task 15: AfkWorkbench 重写

**Files:**
- Modify: `packages/dashboard-app/src/afk/AfkWorkbench.tsx`、`AfkWorkbench.test.tsx`、`translations.ts`、`styles.ts`（`.afk-*` 按 demo all-views §2）

**结构**：`.afk-split`：左 `.afk-list`（挂队表单置顶：input+绿钮；队列卡 `.afk-item`[testid=`afk-item-<name>`]：name(mono)+`.afk-state--{run,queue,fail,pause}` 徽章 + meta 行 track·phase·automation；选中 `.is-active` 绿描边）；右 `.afk-detail`：标题行（mono 名 + 状态徽章 + 右侧操作组：取消=`.btn--verm-ghost`[testid=afk-cancel] / 重试=`.qk__btn`[testid=afk-retry]）+ `.afk-dmeta`（track/相位/sandbox/worktree/last_error）+ `.afk-loghead` + `.afk-log`（等宽深底日志块，testid=afk-log 保持 pre 语义）。

**行为保持逐条**（现测试 + 组件注释里的教训，一条不丢）：三处网络错误全部行内可见不静默；取消/重试成功后 refetch 且 selected 按 root+name 重对齐；挂队成功清空输入并 refetch；挂队错误可见；cancel 仅 automation==='running'、retry 仅 RETRYABLE lane、enqueue 空名 no-op。

**Steps:**

- [x] **Step 1**: 读现 AfkWorkbench.test.tsx → 重写（意图全迁移 + 新结构 testid）。FAIL。
- [x] **Step 2**: 重写组件 + styles + i18n key（`afk.title/scheduler_meta/queue_pos/started_ago` 等按 demo 文案补齐 zh/en）。
- [x] **Step 3**: `npm run test:web -- src/afk` → PASS。commit：`feat(dashboard): AFK 工作台双栏工票化重写（spec §4）`。

### Task 16: TrafficPanel + AdvancedPanel 样式化

**Files:**
- Modify: `packages/dashboard-app/src/advanced/TrafficPanel.tsx`（markup 微调：会话行复用 `.ticket-row` 语言、记录块复用 `.afk-log` 等宽深底；**testid 全部保持**：traffic-panel/note/empty/sessions/session-<id>/records/record-<i>/error/rec-error）、`styles.ts`（`.traffic-*`）
- Test: `npm run test:web -- src/advanced` 现测试直接过（testid/文案不动）

**Steps:**

- [x] **Step 1**: styles 追加 + markup 微调。跑 advanced 测试 → PASS（有破随改，意图不丢）。
- [x] **Step 2**: 阶段门三连 + 截图脚本跑 loops/afk/traffic 深浅色。commit：`feat(dashboard): Traffic/Advanced 面板套用工票语言（零样式三件套收口）`。

---

## 阶段 6 · workflow 三件套换装 + guard 补全

### Task 17: 画布 gate 徽章 + 视觉核对

**Files:**
- Modify: `packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`（仅 :160 一处：顶层图 node `data.label` 从字符串改 JSX——`s.gate === 'review'` 时追加 `<span className="badge badge--gate">{t('workflow_editor.gate_badge')}</span>`，'confirm' 时 `.badge--phase` 同法；钻入图 :182 不动）
- Test: `packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx`（补一例：gate step 节点内渲染徽章文案）
- Modify: `translations.ts`（`workflow_editor.gate_badge`: 复核门/review gate、`gate_badge_confirm`: 确认门/confirm gate）

**Steps:**

- [x] **Step 1**: 补测试 → FAIL → 实现 → `npm run test:web -- src/workflow` 全量 PASS（既有 636 行测试是回归网，重点确认 label 断言仍过——原断言若 getByText('draft') 精确匹配，JSX 化后文字节点拆分需核对，破了按意图修查询）。
- [x] **Step 2**: 截图核对画布深浅色（点阵底/绿边/徽章/侧栏）。commit：`feat(dashboard): 画布 gate 节点徽章 + 工票化视觉核对（spec §4）`。

### Task 18: StepDetailPanel guard 新增表单

**Files:**
- Modify: `packages/dashboard-app/src/workflow/StepDetailPanel.tsx`（Guards section 追加内嵌表单）
- Test: `packages/dashboard-app/src/workflow/StepDetailPanel.test.tsx`

**Interfaces（新增局部 state/结构，demo forms-motion §3 真相源）:**

```tsx
// Guards section 尾部（列表之后）：
<div className="gd-form">
  <select className="select" data-testid="guard-type" value={guardType}
          onChange={(e) => setGuardType(e.target.value as GuardConfig['type'])}>
    <option value="tasks-at-least">tasks-at-least</option>
    <option value="nonempty-output">nonempty-output</option>
  </select>
  {guardType === 'tasks-at-least' && (
    <input className="input gd-n" data-testid="guard-n" type="number" min={1}
           value={guardN} onChange={(e) => setGuardN(e.target.value)} />
  )}
  <button className="btn" data-testid="guard-add" onClick={confirmAddGuard}>
    {t('workflow_editor.detail_guard_add')}
  </button>
</div>
// confirmAddGuard: tasks-at-least → n = parseInt(guardN)，!Number.isFinite(n)||n<1 → 行内错误
// （复用 fieldNameError 同款 view__note--error 模式，testid=guard-n-error）；合法 →
// onChange({...step, guards: [...step.guards, guard]}) 并重置 n 输入。
```

i18n：`workflow_editor.detail_guard_add` 已存在（预留 key 终于接线）；新增 `workflow_editor.invalid_guard_n`（n 须为 ≥1 的整数 / n must be an integer ≥ 1）。

**Steps:**

- [x] **Step 1**: 测试：默认类型渲染 n 输入/切 nonempty-output 隐藏 n/添加 tasks-at-least(n=3) 调 onChange 正确 guards/非法 n 行内错误且不调 onChange/添加 nonempty-output 无参直加。FAIL。
- [x] **Step 2**: 实现 + `npm run test:web -- src/workflow` → PASS。
- [x] **Step 3**: 阶段门三连 → PASS。**删除 styles.ts 兼容别名**（--accent/--gate/--sunken 等），`grep -rn "var(--accent\|var(--gate\b\|var(--sunken" packages/dashboard-app/src` → 零命中。commit：`feat(dashboard): guard 新增表单补全 + token 别名退役（阶段 6 收口）`。

---

## 阶段 7 · 动效统一 + 全量验收 + 文档

### Task 19: motion.ts 扩展 + 接线

**Files:**
- Modify: `packages/dashboard-app/src/workflow/motion.ts`（追加三函数，既有四个签名不动、参数对齐 spec §5）
- Modify: `BoardView.tsx`（转换成功盖章 + 分组折叠）、`App.tsx`（flash→toast 动效）、`InboxView.tsx`（列表 stagger）
- Test: 各视图现测试回归（动效经 prefersReducedMotion 在 jsdom 无 matchMedia 时瞬时降级——test-setup 未 stub matchMedia，`window.matchMedia?.()` 可选链返回 undefined → 走瞬时分支，测试稳定）

**Interfaces:**

```ts
/** 转换成功盖章：徽章 scale 1.6→1 + fade，200ms power4.out；1.6s 后自动淡出移除。 */
export function stampConfirm(el: gsap.TweenTarget): void
/** toast 底部滑入：y 14→0 + fade，200ms power2.out。 */
export function toastIn(el: gsap.TweenTarget): void
/** 分组折叠：height auto⇄0 + fade，210ms power3.out（reduced-motion 瞬时 set）。 */
export function foldToggle(el: Element, open: boolean): void
```

盖章接线：Board `apply()` 成功后在卡片内渲染 `.stamp`（`✓ 已推进 → {to}`，key=`board.stamp`，testid=`board-stamp-<name>`）并 stampConfirm；1.6s 后卸载。

**Steps:**

- [x] **Step 1**: 实现三函数 + 接线 + i18n（`board.stamp`）。
- [x] **Step 2**: `npm run test:web` 全量 → PASS（Board 测试补一例：转换成功后 stamp 元素出现）。
- [x] **Step 3**: commit：`feat(dashboard): 动效词汇落地——盖章确认/toast/折叠（spec §5）`。

### Task 20: Playwright 全量验收

**Files:**
- Create: `.playwright-tmp/acceptance-redesign.mjs`（复用 helpers.mjs `dragConnect`/`collectPageErrors`）

**验收场景（spec §6 逐条，真 build + 真 server + 真点击）：**

- [x] 环境：`npm run build && npm run build:web && npm run build:server`；`PIPELINE_DASHBOARD_HOME=<空临时 home>` 起 server（**注册表从空开始**）。
- [x] **G18 闭环**：零项目 onboarding 可见 → 表单注册临时项目（真目录）→ 零 change onboarding → 新建 change 对话框建 `demo-a`（错误态先输 `bad name` 断言行内错误）→ 看板出现。
- [x] **全 7 相位**：拖拽 open→…→ship（verify→build 回退确认对话框出现后取消，再走 verify-pass），quick 按钮至少推进一次，盖章元素出现。
- [x] **workflow 编辑器**：新建 `rel`（draft→review→ship，review 设 gate=review + guard tasks-at-least n=1，dragConnect 连线）→ 保存。
- [x] **G17 验收**：`POST /api/changes` 建 `rel-change` (workflow=rel) → 看板出现 `board-group-rel` 独立分组三列 → 拖 draft→review 成功 → 收件箱出现该卡（gate 泛化证据）→ quick 按钮 ship。
- [x] **AFK**：挂队 `demo-a` → queued 徽章可见（不真跑 automation，仅入队证据）。
- [x] **Loops**：面板渲染（demo 项目无 loop → 空态文案即过）。
- [x] 全程 `collectPageErrors` 零 error；六视图 × 深浅色终版截图存 `.playwright-tmp/shots/final/`。
- [x] commit：`test(dashboard): 重构全量真机验收脚本 + 通过证据`。

### Task 21: 文档收尾 + 八门

**Steps:**

- [x] **Step 1**: `docs/loops/progress.md` 追加 iteration-38（本轮全记录：spec/plan 链接、四决策、验收证据）。
- [x] **Step 2**: `docs/TEST-REALITY.md`：G14/G17 改判已修（附验收场景引用）、G18 改判已交付；登记本轮新增已知简化（server 端 init 不写 history、Loops 无降档端点、Board 按 currentRoot 过滤的语义变更）。
- [x] **Step 3**: `README.md` 功能面补：项目注册/新建 change/分组看板/自定义 workflow 可视化。
- [x] **Step 4**: 八门全跑：`npm run build`+`build:web`、`npm test`、`npm run test:web`、`tools/test-hooks.sh`、`tools/verify-skills.sh`、`tools/test-bundle.sh`、`npm run oracle`、`tools/test-adapters.sh` → 全绿。
- [x] **Step 5**: commit：`docs: dashboard 重构收官——progress iteration-38 + TEST-REALITY 改判 + README`。

---

## Self-Review 结论

- **Spec 覆盖**：§1→T1；§2.1→T3；§2.2→T6；§2.3→T5；§3.1→T8/T9；§3.2→T10-T13；§4→T14-T17（设置/穿梭框/对话框已被 T1 token 层覆盖，无结构变更）；§5→T19；§6→T20/T21；§7 阶段映射一致；§8 遵守（Loops 降档按钮据此裁掉）。
- **类型一致性**：WorkflowRules/PlannedTransition/AddProjectResult 等签名在消费任务处逐字引用；testid 变更表集中在 T6。
- **占位符扫描**：无 TBD；"读现测试后重写"类步骤均附意图迁移表，非空泛指令。
