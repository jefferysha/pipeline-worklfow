# dashboard-app 全量迁移 spec：shadcn + tailwind + 进度页 v10b 布局

2026-07-14 拍板（用户决策）：
1. **一次性全量迁移** `packages/dashboard-app` 到 shadcn/ui + tailwind v4，删除 `src/styles.ts` 手写全局 CSS。
2. **进度页布局改为 `design-demos/v10b-railway-canvas.html` 的 `#progress` 视图**（画布 + 分组列表），其余视图保持现有布局、只换样式实现。
3. **配色沿用现有 v8 Trellis token**（styles.ts :root 三段原值，一个色值不改）；不采用 demo 的 Railway 紫黑。
4. **文案精简**：无信息量的教学句/长导语退出 UI（细则见 §4.5）。
5. app 外壳保持现有**顶部导航**；demo 的左侧图标 rail 不在本轮范围。

## 1. 基座（Phase 1，已由 scaffold agent 完成后生效）

- tailwind v4（`@tailwindcss/vite`）+ `src/index.css`：
  - v8 token 三段式逐字搬运（默认亮 / `@media (prefers-color-scheme: dark)` 跟随 / `[data-theme]` 显式覆盖两向皆胜）；
  - `@theme inline` 暴露 tailwind 颜色：`bg/card/fill/fill-2/border/border-2/text/text-2/text-3` + `accent/green/red/purple/amb` 家族（`-d/-t/-b` 变体）+ shadcn 语义名（`background/foreground/card/primary(绿)/secondary/muted/destructive/input/ring(蓝)`）；
  - `@custom-variant dark`（挂 `[data-theme=dark]`）。
- `src/components/ui/`：button、badge、tabs、dialog、switch、select、slider、input、label、tooltip、table、collapsible、dropdown-menu、separator、popover、card。
- `src/lib/utils.ts` 的 `cn()`；`@/*` 路径别名。
- GLOBAL_CSS 在 Phase 2 期间**继续共存**（App.tsx 的 `<style>` 不许动），Phase 3 统一删除。

## 2. 所有 agent 的通用纪律

1. **颜色只许用 token 语义类**（`bg-card`、`text-text-2`、`border-border`、`bg-green-t`、`text-red-d`……）或 `var(--*)`；**禁止新硬编码色值**（迁移前 styles.test.tsx 就在钉这条，迁移后纪律不变）。深浅色由 token 自动切换，一般不需要 `dark:` 变体。
2. **状态一律 data-\* 属性承载**（`data-state` / `data-tone` / `data-mode` / `data-on` / `aria-*`），样式用 tailwind `data-[state=…]:` / `aria-[…]:` 变体挂。**测试改为断言 data 属性 / aria / testid，不再断言视觉类名。**
3. **现有 `data-testid` 全部保留**；组件对外 props 契约、行为逻辑（动作接线、乐观 patch、轮询、焦点陷阱、Esc/scrim、localStorage 键）一律不变——本轮是样式与布局迁移，不是行为重构（进度页布局重做除外，见 §4）。
4. shadcn 组件用于标准词汇（按钮/徽章/开关/滑杆/下拉/对话框/表格/折叠…），映射不上的保持自定义元素 + tailwind 原子类。**不许在 `src/components/ui/` 新建或修改文件**——缺基元就用 tailwind 手写在自己视图里。
5. GSAP 动效全部保留（含 `shared/motion.ts` 封装与 reduced-motion 契约）；motion.ts 本身谁也不改（Phase 3 清死导出）。
6. **不动 `src/styles.ts` / `styles.test.tsx` / App.tsx 的 `<style>` 注入**（Phase 3 统一处理）；i18n 字典只有进度 agent 可改（zh/en 必须对称，`i18n.test.tsx` 键对称测试必须过）。
7. 复杂长文案不进行内联样式（`style={{}}`）救急——一律 tailwind 类。
8. 验收自证：改完必须真跑 `npm run build -w @pipeline-lite/dashboard-app` + 自己负责文件的 vitest（`npm test -w @pipeline-lite/dashboard-app -- <文件>`），全绿才算完。
9. **禁止一切 git 写操作**；git 只读也不需要。
10. 类名词汇：仍可保留少量**语义骨架类**（如 `prg-canvas`、`dt-sec`）作为 GSAP 选择器/测试锚点，但样式必须全部来自 tailwind 类，语义类不再在 CSS 里有定义。GSAP querySelector 目标优先换成 data-testid / data-anim 属性。

## 3. 拆包（Phase 2 并行，文件互斥）

| agent | 负责文件（含各自 .test.tsx） |
|---|---|
| **P 进度页** | `progress/ProgressView.tsx`、`progress/PhaseRail.tsx`（退役删除）、新建 `progress/WorkflowCanvas.tsx`、`progress/PhaseTrack.tsx`；`i18n/translations.ts` 的 progress 相关键（zh+en） |
| **S 外壳** | `App.tsx`（chrome 类：app/main/footer/offline-banner/flash/app-error；`<style>` 保留）、`shell/Nav.tsx`、`shell/Dialog.tsx`、`shell/Icon.tsx`、`shell/Onboarding.tsx` |
| **T 详情+观测** | `shared/TaskDetail.tsx`、`shared/SessionResumeRow.tsx`、`advanced/AdvancedPanel.tsx`、`advanced/TrafficPanel.tsx` |
| **W1 工作台骨架** | `workbench/WorkbenchView.tsx`、`workbench/StepperRail.tsx`、`workbench/StepEditor.tsx` |
| **W2 工作台卡片A** | `workbench/LoopCard.tsx`（含 LpSlider）、`workbench/AutomationCard.tsx`、`workbench/SecretsCard.tsx` |
| **W3 工作台卡片B** | `workbench/SkillChain.tsx`、`workbench/HookTimeline.tsx`、`workbench/SkillHealthPanel.tsx`、`workbench/SkillTransferModal.tsx` |

跨包契约：S 不改 `Dialog` 的 props；W2 不改 `LpSlider` 导出签名；所有人不动 `model/`、`api/`、`inbox/`、`state/`、`shared/failureDiagnosis.ts`、`shared/shellQuote.ts`。

## 4. 进度页 v10b 布局 spec（agent P 专属）

设计真相源：`design-demos/v10b-railway-canvas.html` 的 `#view-progress` 段（HTML 679-716 行 + JS renderCanvas/renderList 1358-1425 行 + CSS .canvas/.node/.chg/.row/.ptrack 段）。**只搬布局与信息架构，配色用现有 token。**

数据层全部沿用现状：`selectProgress`、`FlatRow` 投影、`rowSemantics`、乐观 patch、`deckMatch` 谓词、抽屉 TaskDetail + RunLogPane、v9-J 会话链接批量预取、`killAction`/`transitionAction`。

### 4.1 吸顶工具条（替代现有 view__head + prg9t-tabs）
- 大标题「进度」/副标题/页脚全部退役；工具条即页头。
- 左：状态页签（全部/等你动手/运行中/等待中 + 计数），沿用现有 tablist + 墨线 GSAP 姿势，样式对位 demo `.tabs/.tab/.tab .n`（tailwind 化）。
- **页签语义微调**：`等待中 = queued + agent`（demo waiting 口径，修复 agent 行只在「全部」可见的既有孤儿态）；cancelled 仍归「等你动手」（能力面模型：终止后重跑/放着是人的决定）。计数仍=分类总数不随筛选变。
- 中：调度芯片（demo `.schedchip`）：`调度 · N 执行 · N 排队 · N 失败（· 上限 N）`——数据= `schedulerHealth(base.counts)` + 现有 autoMaxParallel（仅单 root 语境显示上限，现状保留）；替代现有 prg-doctor。
- 错误/加载提示行保留（样式 tailwind 化）。

### 4.2 workflow 筛选 pills（新增）
- demo `.wfpills`：「全部 workflow」+ 每个出现过的 workflow 一枚 pill（聚合语境按 workflow 名去重）。选中态 `data-on` + `border-accent`。
- 筛选作用于画布分组与列表行两处；demo 的 hint 教学句**不搬**（§4.5）。

### 4.3 画布（新增 `WorkflowCanvas.tsx`）
- 容器：圆角边框 + 点阵背景（`radial-gradient(circle, var(--border-2) 1px, transparent 1.2px) 0 0/22px 22px` 叠 `var(--fill)` 底，token 化的 demo `.canvas` 对位）+ `overflow-x-auto`。
- 每个 `(root × workflow)` 组一条 `wfgroup`：组标签 = workflow 名（mono 小胶囊）+ 聚合语境补项目名 chip + 计数 meta（`N 相位 · 在制 M`）。
- 节点卡（`.node` 对位，白卡 `bg-card border-border`，宽 ~156px）每相位一张：序号 `01` + 相位名（stepLabel 现有解析）+ 该相位 change 数 + 竖排 change 小卡。
  - workflow rules 若有该步 gate/产出信息则渲染小门徽章（用 `missingGateArtifacts` 同源数据能拿到什么就渲染什么，**不硬编码七相、不造假数据**）。
  - change 小卡（`.chg` 对位）：状态点（tone 色，running 脉冲）+ mono 名称 + 聚合语境项目缩写 + 调度符（▦/⌨，沿 `inSandbox` 谓词）；点击 = openDrawer；当前筛选未命中的小卡 `opacity` 淡出（demo .dimmed）。
  - 含 running change 的节点：`border-accent` 系 + 呼吸环动画（CSS keyframes，reduced-motion 停）。
- 相邻节点 SVG 贝塞尔连线（demo connectNodes 迁移为 React：ref + rAF + ResizeObserver 重算；jsdom 下 rect 全 0 → 直接跳过画线，测试不依赖连线）。指向 running 节点的边加流动虚线动画。
- 空相位节点显示 `—` 占位（demo .nodeempty）。

### 4.4 在制列表（现行体 v2 退役，换 demo `.row` 网格）
- 保留：聚合语境按项目分组（组头=folder 图标+项目名+件数，样式对位 demo `.pghead`）；单项目语境无组头；行序、归档折叠区（改 demo `.archfold` 视觉，交互沿现有 toggle + 只读行）。
- 行体 = 4 列网格 `[minmax(0,1fr) | ~150px | ~96px | ~216px]`，响应式窄屏退化为堆叠：
  1. 信息列：L1 = 状态点 + mono 名称钮（开抽屉）+ 判定徽章（rowSemantics/judge 现状口径：绿✓可以放行/红等你判断/红失败×N/琥珀已取消/蓝运行中/中性）+ 失败短成因 chip（`failure.short_*` 现状）；L2 = track chip + workflow chip + 调度 chip（automation 原始值 chip **不搬**——§4.5）。
  2. 相位列：**新组件 `PhaseTrack.tsx`**（demo `.ptrack` 分段小轨：每相位一枚 15×6px 圆角段，done=绿、cur=按行 tone 发光、todo=灰）+ 下方小字 `当前 · {相位}`。`PhaseRail.tsx` 列车轨与其测试**退役删除**（App 内唯一消费方是本视图）。PhaseTrack 保持纯展示、props 形状类似（phases/currentIndex/tone/ariaLabel/testid），状态用 data 属性。
  3. 时间列：`shortTime(updated_at)`。
  4. 动作列：现有 actionsFor 全逻辑不变（放行/打回多出边纪律、终止 cancel-gate、失败回终端命令 chip cmdChipOf），竖排靠右。
- **行内长导语（prg9-lead）与行内证据 chip 退役**：判定徽章+短成因已是结论；证据与处置指引本来就在抽屉 TaskDetail 里（Important-1 口径不动）。
- need 行分色 ring 保留语义（gate 绿/失败红/取消琥珀）——用 `data-need`/`data-tone` + tailwind 环形描边实现。
- 抽屉、焦点陷阱、GSAP 开合全部沿用（样式 tailwind 化）。

### 4.5 文案精简清单（i18n zh/en 同步删改，键对称测试必须过）
- 删渲染+删键：`progress.subtitle`、`progress.foot`、`progress.acts_terminal_note`、`progress.note_queued`、`progress.note_agent`（抽屉底注释句——排队/等产出本身无动作，无需一句话解释）、行内 lead 相关消费（`inbox.lead_*` 键先保留——TaskDetail 仍在消费的不许动，只把进度行内消费退役）。
- `progress.doctor_*` 改为调度芯片短文案（`调度 · {running} 执行 · {queued} 排队 · {failed} 失败`），title 提示保留一句。
- 徽章文案维持现状（已是结论式短句）。
- 新增键：wfpills（`全部 workflow`）、画布 aria、PhaseTrack aria（`{m} 相位 · 当前 {phase}` 级别的一句话）。
- 原则：**屏上每句话必须改变用户行为，否则删**；教学/比喻句（demo hint、列车轨 aria 长文）一律收短。

### 4.6 GSAP（对位现状，不加新循环 JS）
- 入场：页签条浮现 → 画布节点弹入（scale+stagger）+ 连线 draw → 行 stagger 上浮。reduced 直达终态（现有 matchMedia 双分支姿势）。
- 拍板成功 pulseRow / 墨线滑动 / 抽屉开合补间：保留现状逻辑，选择器换 data 属性。
- 流光/呼吸/脉冲纯 CSS（tailwind `@keyframes` 进 index.css 的 `@layer utilities` 或组件内 `<style>` 禁止——统一进 index.css？**不行，index.css 归 scaffold**。做法：进度专用 keyframes 用 tailwind v4 任意值动画类 + `@utility` 不可用时，放进新建 `src/progress/progress.css` 由 ProgressView import，仅 keyframes 与复杂选择器，颜色仍走 var token）。

## 5. Phase 3 收尾（integrator）
1. 删 `src/styles.ts`、`src/styles.test.tsx`、App.tsx 的 `<style>{GLOBAL_CSS}</style>` 与 import。
2. 全包 grep 死类名（`prg9-`/`wb8-`/`dt8-`/`nav8-`/`rl-` 等旧前缀）与孤儿 i18n 键（zh/en 同步）清理；motion.ts 无消费方导出（stampConfirm/slideInPanel/crossfadeStage/foldOpen）删除+测试同步。
3. `npm run build` + 全量 `npm test` 绿。
4. playwright 起 dev server 截图：进度页（亮/暗 × 全部/等你动手页签 × 聚合/单项目）+ 工作台 + 抽屉，对照 demo 布局与 v8 配色验收；宽 1440 与 900 两档。
