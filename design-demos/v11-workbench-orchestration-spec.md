# v11 · 工作台编排画布 —— 调研结论 + 能力矩阵 + 设计方案

> 目标：把「只展示」的工作台，改造成一个**真实、可拖动、有体系的编排空间**——在**一个画布**里同时配置
> 技能编排（skill）、固定钩子（hook）、自动循环（loop）、整体流程（阶段/门/产出）。
> 本文是 demo `v11-workbench-orchestration.html` 的设计真相源。**不改任何生产代码。**

---

## 0. 现状诊断（为什么用户说"只是展示"）

现工作台 `WorkbenchView.tsx` 的形态是**下拉切 workflow + 横排阶段卡（StepperRail）+ 五页签 sheet（阶段编辑/自动运行/AFK/凭证/技能健康）+ 右栏摘要**。问题不在数据真假（数据其实大多是真的、能写回），而在**信息架构**：

- 编排被切成**五个互不相见的页签**——技能、Hook、Loop、阶段各在一屏，用户无法在一个视野里看到"这条流水线是怎么串起来的"。
- 阶段卡是**只读的鱼鳞流程带**，`StepperRail` 头注释白纸黑字写着"纯展示组件"；真正的编辑要跳进 sheet 里的表单。
- 没有**拖拽**。加阶段是弹窗表单，技能是穿梭框（且只能增删、不能排序），阶段顺序完全不能调。
- 「阶段 × 技能序列 × Hook 时机 × Loop 治理」四个维度**在同一领域里本是一张网**，却被拆成表单字段，丢了空间关系。

**结论**：需要的不是再换一套配色，而是换一套**编排范式**——从"表单页签"走向"节点式编排画布"。但必须严守本项目的**诚实门纪律**：能写的格子做成真交互，只读/终端配的格子诚实标注，绝不做假按钮。

---

## 1. 后端真实可编辑面调查（决定画布里什么是真、什么是诚实只读）

调查了 `packages/kernel`（模型/状态机/事件真相源）、`packages/server`（读写端点）、`templates/`（default workflow、manifest）、以及现有 dashboard 组件的数据源。核心发现：**产品是"双轨"架构**——

- **`default` workflow**：阶段/门/产出**硬编码在 kernel + `templates/manifest.yaml`**，运行时**不落盘、无写端点**，只能改磁盘文件（终端）。唯一例外：`mandatory_skills` 矩阵有窄写端点。
- **自定义 workflow**（`name !== 'default'`）：`WorkflowDef` 结构，落盘 `<root>/.pipeline/workflows/<name>.yaml`，**全量 CRUD**（阶段名/顺序/门/产出/技能 DAG 都可写）。

### 1.1 能力矩阵（编排画布的"真/假"边界总表）

图例：🟢=有写端点，画布可真编辑 | 🔒=运行时固定（kernel/manifest 硬编码，去终端改文件）| 📊=只读派生（后端算，前端不可直接写）| ⌘=终端/文件配（无 app 写端点）

| 维度 | `default` workflow | 自定义 workflow | 读端点 | 写端点 | 依据（file:line） |
|---|---|---|---|---|---|
| **阶段 增/删/改名/排序** | 🔒 硬编码（`PHASES` 常量 + manifest；无写端点，终端改 `templates/manifest.yaml`） | 🟢 `StepDef.id/label/transitions` 全可写 | `GET /api/workflows/:name`（自定义）；default 无定义端点，现态从 `types.ts` manifest 镜像本地合成 | `POST /api/workflows/:name` | `kernel/src/types.ts:34`（PHASES）；`kernel/src/workflow/types.ts:33-47`（StepDef）；`server/src/server.ts:573,905`；`packages/server/src/workflows.ts:36,45` |
| **门 gate（review/confirm）** | 🔒 `review_phases:[explore,spec,verify]` 固定；标记文件/TTL/拦截机制硬编码 | 🟢 `StepDef.gate: 'review'\|'confirm'\|null` 可写 | 同上 | 同上 | `templates/manifest.yaml:48`；`kernel/src/workflow/types.ts:7,36`；`kernel/src/types.ts:41-55`（GATE_MARKERS/TTL 硬编码）；`cli/src/commands/advance.ts:301-307`（门控制自动推进） |
| **产出 outputs/inputs** | 🔒 硬编码为转换前置条件（`design_doc/plan/verification_report/build_sha`） | 🟢 `StepDef.outputs/inputs` 可写，`nonempty-output` guard 校验 | 同上（值经 `GET /api/snapshot`；default 的"要求"不暴露） | 同上 | `kernel/src/flow/transition-table.ts:83-158`（硬编码前置）；`kernel/src/workflow/types.ts:38-39`；`kernel/src/workflow/stepGuard.ts:31-39` |
| **技能：哪些技能（default）** | 🟢 但受限：manifest `mandatory_skills[phase.track]` 强制集，可写——**仅 pm/frontend/backend**，`_all` 只读、`archive` 拒写 | —（default 专属） | `GET /api/config` | `POST /api/config/mandatory-skills` | `templates/manifest.yaml:68-85`；`server/src/server.ts:509,785`；`packages/server/src/config.ts:26,99-104,155` |
| **技能：执行顺序（default）** | 🔒 **无排序语义**：manifest 是扁平 token 列表，无 `order`/`depends_on`；现 UI（`SkillTransferModal`）只能增删、**不能拖排序**（新技能一律追加） | — | — | 写端点保序但无排序 UI | `templates/manifest.yaml:68-85`；`SkillTransferModal.tsx:114-118`（只 append 无 reorder） |
| **技能：DAG 顺序（自定义）** | — | 🟢 `StepDef.skills[].depends_on` 依赖 DAG 可写，`isSkillUnlocked` 是运行时解锁真相源 | `GET /api/workflows/:name` + `GET /api/skills/registry`（候选池） | `POST /api/workflows/:name` | `kernel/src/workflow/skillDag.ts:18-27`；`SkillChain.tsx:507-677`；`server/src/server.ts:520,904` |
| **Hook：4 时机开关** | 🟢 4 个可配（session-start/breadcrumb/router/skill-tracker）逐阶段开关 | 🟢 同（per-root，与 workflow 无关） | `GET /api/hooks?root=` | `POST /api/hooks`（body: root/hook/phase/enabled） | `hooks/hooks.json`；`server/src/hooksConfig.ts:33-42,55-78,91-131`；`server/src/server.ts:531,856` |
| **Hook：安全门（gate/interactive-skill-gate）** | 🔒 **强制常开不可关**（决议 #2）：脚本不读开关，写端点拒 400，读端点过滤 | 🔒 同 | 只读（`LOCKED_IDS`） | 无（400 拒） | `hooks/gate.sh`；`hooks/interactive-skill-gate.sh`；`server/src/hooksConfig.ts:14-17,37,41,99-101`；`HookTimeline.tsx:40`（LOCKED_IDS） |
| **Hook：confirm-clear/decision-recorder** | 🔒 暂不可配（常开，脚本未接开关矩阵） | 🔒 同 | 只读 | 无 | `server/src/hooksConfig.ts:16-17,38-39`；`HookTimeline.tsx`（pending 态） |
| **Hook：新增/改时机注册** | ⌘ 只读：hook 集合硬编码在 `hooks/hooks.json` + `HOOK_METAS`；无 add-hook 端点 | ⌘ 同 | — | 无（改文件） | `hooks/hooks.json`；`server/src/hooksConfig.ts:33-42`（HOOK_METAS 固定 8 个） |
| **Loop：自治级 L1/L2/L3** | 🟢 可写，**逐级晋升门控**（L1→L2 就绪≥70；L2→L3 就绪≥90+≥5 次运行；跨级拒；降级恒允许） | 🟢 同（per-root） | `GET /api/loops/snapshot`（`row.autonomy_level`） | `POST /api/loops/level`（`/update` 显式拒改级） | `kernel/src/loops/types.ts:20`；`kernel/src/loops/graduation.ts:142-258`；`server/src/server.ts:800`；`packages/server/src/loops.ts:172` |
| **Loop：就绪分（就绪分 0-100）** | 📊 只读派生（8 维加权纯函数；70/90 阈值 + 权重硬编码；靠改底层字段间接抬） | 📊 同 | `GET /api/loops/snapshot`（`row.readiness`） | 无（改 goal/kill_criteria/budget… 间接影响） | `kernel/src/loops/drift.ts:41-43,299-349` |
| **Loop：熔断阈值（max_tokens_per_day）** | 🟢 可写（token 预算滑块） | 🟢 同 | `GET /api/loops/snapshot`（`row.budget`） | `POST /api/loops/update` | `packages/server/src/loops.ts:114-156`；`kernel/src/loops/budget.ts:119-153`；`LoopCard.tsx:944-956` |
| **Loop：熔断态 arm/reset** | 📊 只读派生（ok/warn/tripped，纯按当日 token 花费算；80% warn 硬编码；自动停未实现，L1 仅报告） | 📊 同 | `GET /api/loops/snapshot`（`row.budget.breaker`） | 无 arm/trip/reset 端点 | `kernel/src/loops/budget.ts:113-153`；`kernel/src/loops/enforce.ts:36,168` |
| **Loop：其余治理字段** | 🟢 goal/cadence/change_prefix/risk/runner/status/human_gates/kill_criteria/allowlist/denylist 可写 | 🟢 同 | `GET /api/loops/snapshot` | `POST /api/loops/update` | `packages/server/src/update.ts:27-31`；`LoopCard.tsx:801-1065` |

### 1.2 一句话边界

> **自定义 workflow = 一张可以真拖拽真编辑的编排图**（阶段/门/产出/技能 DAG 全有写端点）。
> **`default` workflow = 大部分只读**：阶段/门/产出结构运行时固定（去 `manifest.yaml`/终端改），唯一能在 app 里改的是各 track 的强制技能**集合**（无排序语义）。
> **Hook** 4 时机的**开关**是真的（per-root），但**新增 hook / 改时机注册 / 两个安全门**都是只读/终端。
> **Loop** 的**级别、预算阈值、治理字段**可写；**就绪分、熔断态**是只读派生（后端算）。

这张矩阵直接决定了画布里每个格子的观感：🟢 给真交互控件；🔒/⌘ 给锁徽章 + "去终端配"提示；📊 给只读仪表。

---

## 2. 业界节点式编排编辑器调研

看了 10 类主流做法，按"和本领域的贴合度"归类：

### 2.1 自由画布派（free-form node graph）
- **Node-RED**：SVG 空白画布，节点带端口自由连线。自由度最高，但"空画布"要靠纪律维持可读性，随复杂度上升会乱；面向工程师而非运营。UX 自 2013 几乎没变（5.0 才计划现代化）。
- **n8n**：意见更强的自由画布——**左→右顺序流**、节点配置走**侧边/抽屉式 NDV（Node Detail View）**、执行调试内嵌每节点输入输出。比 Node-RED 更适合非开发者。**节点内不塞配置、配置进侧面板**是它最值得抄的一条。
- **Retool Workflows / Windmill**：block/step 画布 + 侧 inspector；Windmill 的 flow editor 尤其接近本领域——它**不是**纯自由图，而是**顺序为主 + 显式 for-loop/branch 容器**的结构化流，配置走右侧 inspector。

### 2.2 线性步骤派（linear stepper）
- **Zapier**：根本**不用画布**——步骤**纵向堆叠**，点开就地展开配置。因为"自动化"多是近线性的，强行上 DAG 画布反而增加认知负担。这对"流水线阶段本就近线性"是关键启示。
- **GitHub Actions 可视化**：把 jobs 按 `needs` 深度排成**列**（DAG 分层），只读可视化；**编辑仍回 YAML**。即"图用来看、结构用文本改"。

### 2.3 只读可视化派（read-only run viz）
- **Temporal UI**：执行历史/事件时间线，只读，不是编辑器。
- **Prefect**：flow run graph / radar，只读 DAG 可视化。
- **Dagster（Dagit）**：asset graph 交互强（可重跑单步、看物化、探依赖），但**DAG 来自代码**，UI 里**不自由编辑拓扑**——"读图理解、代码改结构"。2025 起 Components/dg CLI GA，仍是代码定义。

### 2.4 提炼：交互范式的 5 个共识
1. **配置不塞进节点，走侧边 inspector**（n8n NDV / Windmill / Retool 一致）——节点只显摘要，点开才是全量表单。
2. **近线性领域别硬上自由图**（Zapier / GitHub Actions）——顺序为主 + 少量分支，用"分层/泳道"比"随意 XY 拖"更可读、更防错。
3. **拖拽的价值在"约束内的重排"**，不在"自由摆坐标"——排序、连依赖、挂载，才是用户真的要拖的。
4. **结构编辑与只读可视化要分清**（Dagster/Temporal 把两者分开）——能编辑的给编辑器语义，运行态叠加只读浮层。
5. **保存/校验/脏态**是一等公民——脏标、校验红字、保存态，n8n/Windmill 都做得很重。

### 2.5 本领域的形状 → 推荐范式

本领域的拓扑是**高度受约束的**：
- **阶段是近线性主脊**（open→explore→spec→build→verify→ship→archive），只有 `build⇄verify` 一条回边——**不是任意 DAG**。
- **每阶段内有一个小技能 DAG**（`depends_on`，通常浅）。
- **Hook 挂在生命周期时机上**（4 时机 × 每轮重复），不是挂在阶段间连线上。
- **Loop 是一层治理浮层**（级别/就绪/熔断），叠在整条流水线之上。

> **推荐范式：约束式编排画布（Constrained Orchestration Canvas）= 横向阶段脊（railway spine）+ 侧边 inspector + 阶段内技能序列 + 生命周期 Hook 带 + 顶层 Loop 治理轨。**
>
> 不是 Node-RED 式自由图，也不是纯 Zapier 纵向表单，而是**取两者之长**：
> - 用 **Zapier/GitHub Actions 的"近线性主脊"** 表达阶段流程（横排卡 + 声明式连接件，只在真有转换边时画线，回边画曲线）——天然防止用户拖出非法几何。
> - 用 **n8n 的 inspector** 承载阶段的全量配置（技能/门/产出/Hook）。
> - 用 **约束内拖拽**（拖排阶段顺序、拖排技能序列、拖连依赖）替代"自由摆坐标"。
> - 用 **Dagster/Temporal 的只读浮层**思路处理运行态（就绪分/熔断/在跑脉冲）与 `default` 只读态。

这个范式恰好把用户列的四件事——skill 排序、hook 固定挂载、loop、整体阶段/门——**收进同一张画布的四个自然分区**，而不是四个页签。

---

## 3. 「无画布库红线」判断建议

现状红线（`StepperRail.tsx:29`、`WorkbenchView.tsx:30`）：**决议 #1——无画布库、无 SVG DAG/graph 渲染库**，连接件用 CSS 文本 chip，不引入 react-flow。

### 3.1 评估 react-flow / @xyflow/react
- MIT 许可、v12、成熟（SSR、minimap、受控节点/边、d3-zoom/d3-drag 平移缩放）。
- 但它解决的是**任意 DAG 的自由布局 + 平移缩放 + SVG 连线**——**恰恰是本领域不需要、甚至有害的能力**：
  - 本领域是**近线性主脊**，不需要自由 XY 布局；给用户自由拖坐标反而能拖出与 `transitions` 模型不符的非法几何。
  - 平移缩放画布对"7 个阶段一屏排得下"是过度设计。
  - 引入 ~40-55KB gzipped 的图引擎 + d3 依赖，与本项目 **tailwind v4 + GSAP、零重依赖**的基调冲突，也和"边存在才画线"的诚实原则打架（图库倾向让你先连线再校验）。

### 3.2 建议：**红线部分松动，不引入图库，改为"自绘可拖拽"**

| 项 | 判断 |
|---|---|
| 引入 react-flow / SVG DAG 图库 | **维持红线：不引入。** 领域不需要自由图，代价与基调不符。 |
| "纯展示、无拖拽" | **松动：应允许拖拽。** 用户明确要"可拖动编排"，只读带已不够。 |
| 拖拽实现 | **自绘约束式拖拽**：① 阶段横向重排 = 1D 拖拽重排；② 技能序列/依赖 = 阶段内拖拽重排 + 拖连；③ 都用原生 Pointer/HTML5 DnD 或轻量 `dnd-kit`（~10KB，无 d3、无 SVG 图引擎，仅提供拖拽传感器与碰撞），**不是**画布图库。 |
| 连接件 | **声明式**：由 `transitions` 模型驱动，CSS 流动虚线画主脊、少量内联 SVG 画 `build⇄verify` 回边曲线。**边不存在就不画**（延续诚实原则）。 |

> **一句话**：红线的精神是"别为了炫技扛一个自由图引擎进来"——这个精神保留；但"纯展示不可拖"这条要松，换成**自绘的、约束在流水线语义内的拖拽**。技术上 `dnd-kit`（可选）或原生 Pointer 事件即可，**不碰 react-flow / SVG DAG 库**。

---

## 4. 推荐设计方案（布局 · 交互 · 真实/只读边界 · 选型）

### 4.1 一屏布局（一个画布，四个分区）

```
┌─ 顶栏 ─────────────────────────────────────────────────────────────┐
│ [workflow ▾ default(只读) / release-train(可编排)]   [脏标] [保存]   图例 │
├─ ① 流程脊 railway spine（横向，可拖排序） ───────────────────────────┤
│  ①open ─→ ②explore◆ ─→ ③spec◆ ─→ ④build ⇄ ⑤verify◆ ─→ ⑥ship → ⑦archive  [+阶段] │
│  （门=红闸菱形；build⇄verify=回边曲线；在跑=流光脉冲；选中=绿环）           │
├─ ② 阶段编排面（点阶段展开：左技能序列 · 右 Hook 时机） ──┬─ ③ 治理轨(Loop) ─┤
│  技能序列（可拖排/拖连依赖）        Hook 4 时机           │ 自治级 L1/L2/L3   │
│   1 brainstorming                  SessionStart          │  ●───○───○  🟢    │
│   2 grill-with-docs ⟵depends       UserPromptSubmit       │ 就绪分 82 📊只读   │
│   3 tdd                            PreToolUse 🔒gate      │  ▓▓▓▓▓▓▓░░        │
│   [+ 技能]                         PostToolUse [开关]     │ 熔断 token 预算🟢 │
│                                                          │  ▓▓▓░ warn 📊     │
└──────────────────────────────────────────────────────────┴──────────────────┘
```

- **① 流程脊**：整体流程（阶段/门/产出摘要）。自定义 workflow 可**拖拽重排 + 加阶段 + 删阶段**；`default` 锁定（🔒 徽章 + 禁用拖拽）。连接件声明式。
- **② 阶段编排面**（点阶段卡展开）：
  - **左·技能序列**：自定义走 `depends_on` DAG，**拖排序/拖连依赖/加删**（🟢）；`default` 走 track tab 的强制技能**集合**（🟢 可增删，但**明确标注"无执行顺序语义"**，不给排序手柄——诚实）。
  - **右·Hook 时机**：4 时机纵列，各挂 hook 卡；可配 4 个给**真开关**（🟢）；`gate`/`interactive-skill-gate` 给**🔒 强制常开徽章**（禁用开关）；`confirm-clear`/`decision-recorder` 给**灰态"暂不可配"**；底部诚实提示"新增 hook / 改时机注册请去 `hooks/hooks.json`（⌘ 终端）"。
- **③ 治理轨（Loop）**：per-root 浮层。**自治级 L1/L2/L3** 真单选 + 晋升门确认（🟢）；**就绪分** 只读仪表（📊，附"改 goal/kill_criteria/预算 间接抬"提示）；**熔断 token 预算** 真滑块（🟢）+ **熔断态** 只读 chip（📊）。

### 4.2 交互清单（demo 演示这些）
1. **拖排阶段**：拖阶段卡换位，连接件与序号实时重算（自定义）；default 拖拽被锁 + 提示。
2. **选阶段 → inspector 联动**：点阶段卡，下方编排面 crossfade 到该阶段的技能/Hook。
3. **拖排技能 / 拖连依赖**：阶段内技能卡拖动重排；拖到另一技能上建立 `depends_on`，链号重算。
4. **加技能**：从候选池（`/api/skills/registry` 语义）拖入或点加。
5. **Hook 开关**：拨可配 hook；安全门锁定不可拨（点它给"强制常开"解释）。
6. **切 default/自定义**：整屏在"可编排"与"只读"两态间切换，所有 🔒/📊 徽章相应亮灭——**演示诚实边界**。
7. **Loop 级别/预算**：调级触发晋升门（就绪分不够则拦），拖 token 预算滑块看熔断态变化（只读派生跟着算）。
8. **脏态/保存/校验**：任一编辑亮脏标；保存演示成功态；示意 kernel validate 拒绝（如循环依赖）红字。

### 4.3 真实/只读边界的视觉语言（诚实门）
- 🟢 **可编排**：绿/蓝实控件（可拖手柄、开关、滑块、加删钮）。
- 🔒 **运行时固定**：灰锁徽章 + 禁用态 + hover 解释"去 manifest/终端改"。
- 📊 **只读派生**：仪表/进度条 + "后端算，改底层字段间接影响"。
- ⌘ **终端/文件配**：命令 chip（如 `pipeline setup`、编辑 `hooks/hooks.json`），**不做假按钮**。
- 一律**不谎报数字**：数据面未就绪回落 `—`（延续现有纪律）。

### 4.4 前端实现选型
| 关注点 | 选型 | 理由 |
|---|---|---|
| 画布图引擎 | **不引入**（维持红线） | 领域近线性，自由图有害且违基调 |
| 拖拽 | **原生 Pointer/HTML5 DnD** 或轻量 `dnd-kit`（~10KB，可选） | 约束式重排/连依赖足够，无 d3/SVG 图引擎 |
| 连接件 | **CSS 流动虚线 + 少量内联 SVG 回边** | 声明式、随模型走、边不存在不画 |
| 动效 | **GSAP**（本项目既有） | 拖拽落位、选中环、脉冲、仪表填充；`matchMedia` 全量 reduced-motion 降级 |
| 样式 | **tailwind v4 + 现有 token** | 零新依赖，配色沿 `index.css` 三段式 |
| 状态/写回 | 复用既有端点：`POST /api/workflows/:name`、`/api/config/mandatory-skills`、`/api/hooks`、`/api/loops/level`、`/api/loops/update` | 不新增端点，脏守卫沿现有四件套 |

---

## 5. 分期建设计划（落地生产时的路线）

- **P0 · 画布骨架（只读可切）**：横向流程脊 + 声明式连接件 + 选阶段 inspector 切换（复用现有 `stepperSteps` 投影）。不含拖拽——先把"一个画布"的 IA 立起来，退役五页签中的"阶段编辑/技能健康"平铺。**零新端点、零新依赖。**
- **P1 · 阶段编排面合并**：把 `SkillChain`（技能 DAG）+ `HookTimeline`（4 时机）从页签折叠区提到画布下方左右两栏；default 的强制技能集合（track tab）也并入。全部复用现有读写端点。
- **P2 · 约束式拖拽**：① 阶段横向重排（写回 `transitions` 线性重连，复用 `confirmAddStage` 的重连逻辑）；② 技能序列拖排 / 拖连 `depends_on`（写回 `POST /api/workflows/:name`）。引入原生 Pointer 或 `dnd-kit`。default 拖拽锁定。
- **P3 · 治理轨内联**：`LoopCard` 精简为画布右侧治理轨（级别/就绪/熔断三件），退役"自动运行"独立页签。就绪分/熔断保持只读派生。
- **P4 · 打磨**：脏态/校验红字/晋升门确认/reduced-motion 全量降级/大字号（回应用户长期"嫌小"）。

> 每一期都**不碰 kernel/后端**、不新增端点——纯前端 IA 重构，风险可控、可分期上线、可随时回退到页签态。

---

## 6. 给用户拍板的关键决策点

1. **红线松动到哪一档？** 建议：不引图库、自绘约束式拖拽（§3.2）。要不要连 `dnd-kit`（~10KB）都不引、纯原生 Pointer？
2. **`default` workflow 在画布里怎么摆？** 建议：同一张画布，只读态（🔒 徽章满屏），而非"default 走旧视图、自定义走新画布"两套。确认这个统一画布方向。
3. **Loop 治理轨的位置**：进画布右侧常驻轨（本方案），还是保留为可展开的抽屉？（常驻更"一个画布"，但占横向空间。）

---

*Demo：`design-demos/v11-workbench-orchestration.html`（自包含、可拖拽、大字号、配色沿 `index.css` token）。本 spec 与 demo 均不改任何生产代码。*
