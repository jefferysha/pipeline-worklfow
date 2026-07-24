# 进度页重构 v3：拆单项目 + 项目总览页 + 画布即操作

2026-07-14 用户拍板（针对聚合画布「乱/空/重复」的根因）：

**根因**：聚合「全部项目」把 N 个项目的 change 灌进同几个相位（立项 16 张卡变巨柱、右侧大片空），画布画的是拓扑却被塞进明细，且下方按项目列表又铺一遍 = 冗余。

**决策**：
1. **项目不在进度页聚合展示**——拆成两页：
   - **「项目」总览页**（新）：所有项目的概览卡；点卡钻进单项目进度页。
   - **「进度」页永远单项目**：只看当前选中项目，change 少、画布干净、名称完整不截断。
2. **画布卡片即操作面，去掉下方列表**：change 挂在相位卡里，点开=右滑抽屉（TaskDetail + 放行/打回/重试/终止/回终端全在抽屉内）。下方那条按项目分组的重复列表**整段删除**。
3. 顺手修：sched 图标丑（→lucide）、AFK/沙箱 vs 终端 change 无区分、rail「在线」换行、rail 留白。

配色继续沿现有 token，一个色值不改。通用纪律照 `design-demos/v10b-migration-spec.md §2`（颜色只走 token、状态 data-*/aria、现有 testid 保留、禁 git 写、不动 src/components/ui 与 src/index.css）。dev server 在 5173 热更新，两个 agent 都不用管。

---

## App ↔ ProgressView 契约（两 agent 都遵守，避免并行踩踏）

- `view` 取值扩为 `'projects' | 'progress' | 'workbench'`（原 PRIMARY_VIEWS 加 'projects'）。
- **`currentRoot` 在 view='progress' 时恒为真实项目 root（非空）**。App 负责：currentRoot 为 '' 或失效时，不再渲染聚合，而是把 view 落到 'projects'（或渲染 ProjectsView）。ProgressView 因此**删除 currentRoot==='' 聚合分支**，只处理单项目。
- App 传给 ProgressView 的 props 形状不变（snapshot/loading/error/currentRoot/rulesByKey/onToast/onRefresh），只是 currentRoot 保证非空。
- **i18n 归属**：translations.ts 只由 **Agent A** 编辑（新增 `projects.*`/`nav.*` 键）。**Agent B 不碰 translations.ts**——进度/画布用现有键即可（列表删除=删 t() 调用不加键；画布键 canvas_* 已存在）；若确需新 progress 键，在报告里列出键名与文案，主会话补，不要自己编辑该文件。

---

## Agent A：外壳 + 路由 + 项目总览页

**独占文件**：`src/App.tsx`、`src/shell/Nav.tsx`(+test)、新建 `src/shell/ProjectsView.tsx`(+test)、`src/i18n/translations.ts`（仅加 projects/nav 键）。

1. **路由**（App.tsx）：view 加 'projects'；initialView 白名单加 'projects'；currentRoot 逻辑改为「恒定单项目」——localStorage 存的是真实 root，''（旧聚合偏好）或失效 → view 落 'projects'。聚合相关的 rulesByKey 多项目收集可简化为当前单项目（default 零网络 + 当前项目自定义 workflow）。decisionCount 变为当前项目口径。零项目仍走 Onboarding。
2. **ProjectsView.tsx**（新，只读总览）：
   - 网格 `repeat(auto-fill,minmax(280px,1fr))`，每项目一张卡（bg-card border-border rounded-lg shadow-sm，hover 微升）。
   - 卡内容：项目名（mono，rootBasename，title 全路径）+ 一排状态 stat（在制 N / 等你动手 N / 运行中 N，用现有 selectProgress(snapshot,root,rulesByKey) 或 schedulerHealth 口径算）+ 一条迷你相位分布（default workflow 各相位小段+件数，简版即可，做不动就省略但保留三个 stat）。
   - ok=false 项目：卡置灰、标「读不到」，不可点。
   - 点卡 = setCurrentRoot(root) + setView('progress')。
   - data-testid：`projects-view`、`project-card-{basename}`、stat 各带 testid。
3. **Nav.tsx（rail）**：
   - 「全部项目」聚合切换钮 → 改为 **「项目」nav 项**（lucide 合适图标，如 FolderKanban/LayoutGrid），点击 view='projects'，激活态 aria-current。
   - 保留 进度（当前项目流，图标换 lucide 如 GitBranch/Workflow）、工作台（lucide Sliders/Settings2）。当前项目名可在进度项下方或 rail 顶部小字显示（让用户知道"进度"看的是哪个项目）。快速切换下拉可保留为次要入口，也可去掉（项目页是主入口）——你定，但别丢「能切项目」的能力。
   - **修点6**：底部连接指示不再"点上字下"堆叠换行——改一枚状态点 + hover tooltip（在线/离线），或点+同行小字，别换行。
   - **修点2**：底部控制区往上收、加一条细分隔或当前项目块，rail 不显空旷。
   - 现有 testid 全保留；Nav.test/App.test 布局断言按新结构改写，行为覆盖不变薄。
4. i18n：加 `projects.title`/`projects.subtitle`/`projects.stat_wip`/`projects.stat_need`/`projects.stat_running`/`projects.unreachable`/`nav.projects` 等，zh/en 对称（i18n.test 键对称必须过）。

**自证**：`npx tsc --noEmit --incremental false -p packages/dashboard-app`；`npm test -w @pipeline-lite/dashboard-app -- src/App.test.tsx src/shell src/i18n`。

---

## Agent B：进度页单项目 + 画布重设计 + 图标/AFK 修复

**独占文件**：`src/progress/ProgressView.tsx`(+test)、`src/progress/WorkflowCanvas.tsx`(+test)、`src/progress/PhaseTrack.tsx`（+test，若失去消费方则退役删除）、`src/progress/progress.css`。**不碰** App.tsx/shell/translations.ts/components/ui。

1. **ProgressView 单项目化 + 删列表**：
   - 删 currentRoot==='' 聚合分支（契约保证非空）。
   - **整段删除下方按项目分组的在制列表**（renderRow/projGroups/visibleRows 列表渲染、compareFlat 列表序等随之退役）；页签（全部/等你动手/运行中/等待中）+ 调度芯片保留在画布上方，页签筛选作用于画布。
   - 抽屉（TaskDetail + RunLogPane + 焦点陷阱/Esc/scrim/滚动锁）与全部动作逻辑（transitionAction/killAction/cmdChipOf/会话链接预取）**保留**——现在由画布 change 卡点击触发 openDrawer。
   - **归档不能失联**：画布归档相位小站点击 → 抽屉/popover 只读列出该相位归档 change（沿现有 archived 数据），别把归档入口删没了。
   - PhaseTrack（原列表行的分段轨）若无消费方 → 退役删除（同 PhaseRail 先例）。
2. **WorkflowCanvas 重设计（单项目，干净）**：
   - 单项目每 workflow 一组（无需跨项目合并逻辑，可删 mergeCanvasGroups 或留着单组走）；组头=workflow 名+「{n}相位·在制{m}」。
   - 一条**贯穿全宽的水平基线**串起该 workflow 全部相位，相位等距；空相位=小站（圆环节点+相位名+门徽章，~72px），有在制的相位=站台卡（bg-card border-border rounded-lg shadow-sm，min-w-[200px] max-w-[280px]，卡头=序号+相位名+门+件数）。
   - change 小卡竖排：状态点 + **完整 mono 名称（禁 ellipsis，可 break-all）** + ▦/⌨ sched。single-project 语境不需要项目缩写 chip（同项目），去掉它（这也解决 image#8 里那枚丑 chip）。
   - **修点5（图标）**：sched 符号 ▦/⌨ 换 lucide-react 正规图标——沙箱用 `Container`/`Box`、终端用 `Terminal`/`SquareTerminal`（择一，尺寸 ~13px，text-3 描边），别再用 unicode 字符。
   - **修点4（AFK/沙箱区分）**：沙箱(AFK)跑的 change 卡给明确视觉区分——沙箱图标 + 一枚小「沙箱」标签或整卡极轻 accent tint（**禁 side-stripe 左边框**，impeccable 明令）；终端 change 保持素净。一眼能分「这条是无人值守沙箱在跑 vs 我在终端手动」。
   - 连线纯 CSS（保留现有 progress.css 贯穿基线+运行段流动虚线方案，reduced-motion 停帧），jsdom 零测量。
   - running 站台 data-run 呼吸环、running 小卡脉冲、页签筛选 data-dim、点击开抽屉——全保留。
3. **测试**：WorkflowCanvas.test 覆盖单项目干净布局、空相位小站不出卡、名称完整不截断、sched 图标存在（可查 lucide 渲染的 svg/aria-label）、AFK 区分（data 属性）、点击回调；ProgressView.test 删列表相关用例、补「无列表」与画布主面用例、归档入口可达用例；PhaseTrack.test 若退役则删。

**自证**：`npx tsc --noEmit --incremental false -p packages/dashboard-app`；`npm test -w @pipeline-lite/dashboard-app -- src/progress`。

---

## 收尾（主会话）
两路交卷后：整包 `npm run build` + 全量 `npm test` 绿；playwright 截图验收（项目总览页 + 单项目进度页画布，亮/暗；确认名称完整、图标不丑、AFK 有区分、无下方列表、rail 不换行不空旷）；重建 dist 让 8765 同步。
