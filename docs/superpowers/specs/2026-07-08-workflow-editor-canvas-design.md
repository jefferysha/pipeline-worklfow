# 设计文档：Workflow 编辑器画布（GOAL.md E8）

> 2026-07-08 · brainstorming 会话产出 · 对应 GOAL.md 清单 E 的 E8
> （唯一在 2026-07-07 四份实现计划里明确排除、留给后续独立计划的一项）

## 0. 背景与范围声明

`workflow-customization-engine` 计划（11 个任务，2026-07-08 已合并进 main）交付了 workflow
自定义引擎的完整数据/逻辑主线：`.pipeline/workflows/<name>.yaml` 定义格式、解析器
（`parse.ts`）、保存时校验（`validate.ts`，无环依赖 + inputs/outputs 引用 + transitions
可达性）、skill DAG 解锁判定（`skillDag.ts`）、step 级 guard 求值（`stepGuard.ts`）、
`pipeline transition`/`internal-skill-gate` 对非 default workflow 的真实接线、迁移工具
（`migrate-workflow`）、以及集成收尾时补的 `pipeline init --workflow <name>`（真加载校验
后把 change 摆到 workflow 的首个 step 上）。

这条主线故意没有交付的是**画布 UI 本身**——原计划收尾说明明确写"画布 UI 不在本计划内
……等这条主线落地、真有一个可读写的 workflow 文件格式之后再设计画布怎么读写它"。现在这条
主线已经落地（有 `loadWorkflow`/`validateWorkflow`/`parseWorkflow` 可读，且经过集成收尾
的 whole-branch review 独立核实过其正确性），本文档设计画布怎么读写它。

原始设计文档（`docs/superpowers/specs/2026-07-07-workflow-customization-and-dashboard-
workbench-design.md` §2.7）已经记录了一条关键决策："用户明确选择'真画布节点连线图'（否决
了工程量更小的手风琴表单方案）……可以引入专门的节点图编辑库（如 React Flow/xyflow 一类），
不需要从零造画布轮子"。本文档不重新讨论这条已经拍板的决策，只在此基础上把细节钉死到可以
直接进 writing-plans 的程度。

## 1. 本轮 brainstorming 澄清的三个问题（决策记录）

1. **范围深度**：全量两层图（而非"仅 step 拓扑 + 表单编辑 skill"的 MVP，也不是"只读可视化"）。
   逐字对应 GOAL.md E8 原句"step/skill 为可拖拽节点，depends_on 用拖线表达"。
2. **default workflow 不可编辑**：`default` 运行时完全走 kernel 硬编码的 flow engine
   （`transition.ts` 的 `workflow==='default'` 分支），从不读 `templates/workflows/
   default.yaml` 文件本身——编辑这个文件对实际运行行为零影响。为避免用户改了 default 却
   发现毫无效果的困惑，画布编辑器的 workflow 列表**不出现 default**，只能新建/编辑真正
   被 `loadWorkflow` 消费的自定义 workflow。
3. **两层切换方式**：同一画布钥入（双击 step 节点→画布平滑切换成该 step 内部的 skill DAG，
   面包屑退回顶层），而非侧边抽屉或独立路由——复用同一套画布组件/交互模式，只是切换
   nodes/edges 的数据源，不需要额外写一套并行的画布状态管理。

## 2. 架构

### 2.1 kernel：新增序列化函数

`packages/kernel/src/workflow/serialize.ts`（新文件，与 `parse.ts` 对称）：

```ts
export function serializeWorkflow(wf: WorkflowDef): string
```

`parseWorkflow`（已存在）是"YAML 文本 → WorkflowDef"；这是反向操作。**往返等价是这个函数
唯一的正确性判据**：`parseWorkflow(serializeWorkflow(wf))` 必须深度等于 `wf`（字段顺序、
缩进风格可以和手写的 `templates/workflows/default.yaml` 不完全一致，但语义必须逐字段
等价——测试用真实 fixture 做 parse→serialize→parse 往返断言，不只测 serialize 输出的
字符串字面量，避免测试锁死了一种缩进风格而不是锁死语义）。

写法上镜像 `parse.ts` 现有的分块序列化模式（steps 数组 → 每个 step 的 label/gate/skills/
inputs/outputs/guards/transitions 五个子块，空数组/null 值的字面量写法要和 `parse.ts`
的读入侧完全对称，否则圆不回来）。

### 2.2 server：新增 4 个端点（2 个路由，按方法分派）

复用现有写端点的鉴权链（Host 守卫 → token → Content-Type）与 `dedupeRoots`+`resolvePath`
的信任锚模式（同 `/api/loops/level`、`/api/afk/:name/cancel` 等）：

| 端点 | 方法 | 行为 |
|---|---|---|
| `/api/workflows` | GET | `?root=` 必填；扫 `<root>/.pipeline/workflows/*.yaml`，排除 `default.yaml`（即便它存在），返回 `{names: string[]}` |
| `/api/workflows/:name` | GET | 真读 + `loadWorkflow` 解析（含 §2.1 的校验——非法文件直接 500 + 错误详情，不返回半解析的残缺结构） |
| `/api/workflows/:name` | POST | body 是完整 `WorkflowDef` JSON；先 `validateWorkflow`（复用集成收尾时已经接给 `loadWorkflow` 的同一个校验函数——两处消费同一个真相源，不重复实现一遍规则），不过关 400 + `{errors: string[]}`；过关才 `serializeWorkflow` 并原子写入 `.pipeline/workflows/<name>.yaml`（不存在则创建、存在则覆盖，新建和编辑共用此端点，前端"新建"只是先弹 name 输入框再直接 POST 一个只有 `name` + 空 `steps` 的骨架） |
| `/api/workflows/:name` | DELETE | 真删 `.pipeline/workflows/<name>.yaml`；文件不存在返回 404，不做"是否有 change 正引用这个 workflow"的引用检查（同 §3 范围外的改名问题一样，追踪引用是更大的话题；前端删除前用一个确认弹窗提示"如果有 change 正引用这个 workflow，删除后其 transition/internal-skill-gate 会报'workflow 未找到'"，把决定权交给用户，不代为静默阻止或代为处理） |

`name` 参数校验（GET/POST/DELETE 三个端点一致）：复用现有 change-name 同款白名单正则
（`a-zA-Z0-9_-`），拒绝路径穿越；POST/DELETE 显式拒绝 `name === 'default'`（即便请求体
合法，也 400 拒绝创建/覆盖/删除 default.yaml，呼应决策 2；GET 允许读 default 是因为
"只读查看"不在决策 2 的禁止范围内，但前端列表页本身就不会把 default 列出来，这条端点层
拒绝只是纵深防线，不是主要防线）。

### 2.3 前端：`WorkflowEditorView.tsx`

新目录 `packages/dashboard-app/src/workflow/`：

- `WorkflowEditorView.tsx`——列表页：`GET /api/workflows` 拉名字列表 + "新建"输入框
  （校验同白名单正则 + 非 'default'）；点一个名字或新建成功后进入画布页。
- `WorkflowCanvas.tsx`——画布页，用 `@xyflow/react` 的 `<ReactFlow nodes edges onConnect
  onNodesChange onEdgesChange>`：
  - 顶层：`nodes` = steps（label 显示 `id` + `label` 字段），`edges` = transitions
    （label 显示 event 名，方向 from→to）。
  - 双击 step 节点 → `nodes`/`edges` 数据源切换成该 step 的 `skills`/`depends_on`
    （`WorkflowCanvas` 内部一个 `drillPath: string | null` state 决定当前渲染哪一层，
    面包屑组件按 `drillPath` 是否为 null 决定显示"‹ 返回顶层"）。
  - 新增节点：工具栏"+ step"/"+ skill"按钮（按当前层）→ 弹 id 输入框 → 追加一个默认位置
    的节点。**id 必须在当前层内唯一**（同一 workflow 内的 step id 之间、同一 step 内的
    skill id 之间）——重复直接拒绝并提示，不静默覆盖同名节点（`WorkflowDef` 用数组存储、
    不是用 id 做 map key，重复 id 不会立即崩，但会让 `transitions.to`/`depends_on` 的
    引用产生歧义，client 端在这里挡住比留到保存时 `validateWorkflow` 才报错更早、更好定位）。
  - 新增连线：拖拽节点的 handle 到另一个节点触发 `onConnect`（xyflow 原生事件）→ 顶层
    弹 event 名输入框追加一条 transition；skill 层直接追加一条 depends_on（无需额外输入，
    依赖关系本身不带标签）。**同一 step 内两条 transition 不能用同一个 event 名**（当前
    kernel `validateWorkflow` 没有这条规则——`transition.ts` 的 `step.transitions.find(t
    => t.event === event)` 只取第一个匹配，重复 event 名会让第二条静默失效，这是先于本
    设计就存在的潜在 kernel 缺口，本设计只在画布这一层加 client 端创建时拒绝，不在这轮
    顺带修 kernel 校验规则——那是 kernel 层的独立缺口，不属于"画布怎么读写 workflow"这个
    题目，若要修单独登记进 TEST-REALITY.md，不在本设计的实现范围内）。
  - 删除节点/连线：选中后 Delete 键或右键菜单，xyflow 原生 `onNodesDelete`/
    `onEdgesDelete` 回调里同步移除对应的 step/skill/transition/depends_on。
  - 节点选中侧栏：表单编辑该 step 的 `label`/`gate`/`guards`/`inputs`/`outputs`
    （guards 是"类型下拉+参数输入"的简单列表编辑器，不是画布节点——这些字段和图的拓扑
    结构无关，逐条对应原始设计文档 §2.4"guards 参数化不发明新逻辑"的既有决定）。
  - 保存按钮：整个当前 `WorkflowDef`（顶层 state 持有完整结构，两层视图只是同一份数据的
    不同投影）`POST` 给 §2.2 的写端点；后端校验不过关时把 `errors` 数组整块展示在画布上方，
    不清空用户已编辑的内容。
- 自动布局：`layout.ts`——一个几十行的确定性分层布局纯函数（按 step 数组顺序/skill 相对
  `depends_on` 的拓扑深度分列分行），每次打开画布或结构变化后重新算一遍。**不引入
  `@dagrejs/dagre` 等外部布局库**（图规模小，几个 step、每 step 几个 skill，简单分层布局
  够用，还能整个纯函数真单测锁定输出）。**不持久化节点坐标**——YAML schema 不新增和运行
  逻辑无关的展示字段，会话内的手动拖拽只影响当前这次打开的画布状态，下次打开重新自动布局
  （CONTRACT §1"手写窄解析器仅支持这一子集"的克制精神延伸到这个新格式上）。

### 2.4 i18n

新命名空间 `workflow_editor`（沿用既有 `afk`/`loops`/`skill_transfer` 三个命名空间的模式，
zh/en 双语，i18n.test.tsx 的 key 结构对齐测试会自动校验完整性）。

### 2.5 导航接线

`Nav.tsx` 的 `WORKBENCH_VIEWS` 从 `['loops', 'afk']` 扩成 `['loops', 'afk', 'workflows']`
（工作台下拉第 3 项），`App.tsx` 加 `view === 'workflows'` 分支渲染 `<WorkflowEditorView/>`。

## 3. 范围内 / 范围外

**范围内**：workflow 列表（新建/删除文件本体）、两层图的增删节点/连线、guards/inputs/
outputs 侧栏表单、保存时校验拒绝并展示错误、自动布局。

**范围外（本轮不做，留作后续小任务）**：
- 多选、复制粘贴、撤销/重做、minimap——画布的通用编辑体验打磨，不影响"能不能用画布建出
  一个合法 workflow"这条主线可用性。
- workflow 改名 / 节点（step、skill）改名——两者是同一类问题的不同尺度：改名都要求同步
  更新所有引用该名字的地方（workflow 改名要追问"已有 change 的 `workflow` 字段还指着
  旧名字"；节点改名要追问"其它 step 的 `transitions.to` / 其它 skill 的 `depends_on`
  还指着旧 id"），本轮都不做级联改名，删掉旧的、新建一个新名字/新 id 是替代路径。
- 持久化节点坐标——见 §2.3 自动布局小节的理由。
- 实时（编辑过程中）校验——只在保存时校验，编辑过程中允许暂时不合法的中间状态（如刚拖出
  一个还没连边的孤立节点），这是画布类编辑器的常见预期，也是最小实现。
- kernel `validateWorkflow` 补"同一 step 内 transitions 不能重复 event 名"这条规则——
  本设计的画布只在创建连线时 client 端拦一道（见 §2.3），不下沉进 kernel 校验函数；这是
  先于本设计存在的独立缺口（手写 workflow YAML 同样能触发），不属于"画布怎么读写
  workflow"这个题目范围，若要修应该是登记进 `docs/TEST-REALITY.md` 的独立小任务。

## 4. 测试方法论

延续本仓一贯的真实 e2e 收编门槛（GOAL 清单 C）：

- **`serializeWorkflow`**：真 parse→serialize→parse 往返等价断言（用 `templates/
  workflows/default.yaml` 之外真手写的多个 fixture，覆盖空 skills/多重 depends_on/多条
  transitions 等形状）+ 真文件写入（临时目录）。
- **4 个 server 端点**：真 HTTP 集成测试（同 `server.test.ts` 现有模式）——含鉴权 401/
  Host 403/信任锚 404、写入校验拒绝 400 + errors 数组内容、`name==='default'` 对 POST/
  DELETE 显式拒绝、真成功写入后真读回校验往返一致、DELETE 真删文件 + 删后 GET 404、
  DELETE 不存在的 name 返回 404。
- **画布双向绑定**（`WorkflowCanvas.test.tsx`）：不测 xyflow 库本身的拖拽物理效果（那是
  库自己的职责，原始设计文档 §6 已经点名"库本身的拖拽/连线行为不需要重新测试"），而是真
  render 组件后直接调用 xyflow 传给我们的 `onConnect`/`onNodesChange`/`onNodesDelete`/
  `onEdgesDelete` 回调（等同真触发这些交互的最终效果），断言组件内部维护的 `WorkflowDef`
  state 真的正确增删了对应的 step/skill/transition/depends_on，以及双击钥入/面包屑返回
  真的切换了 `nodes`/`edges` 的数据源。
- **`layout.ts`**：纯函数真单测，固定输入固定输出（分层算法本身是确定性的，不依赖任何
  外部库版本行为）。
- **i18n**：复用现有 `i18n.test.tsx` 的 key 结构对齐测试，新增 `workflow_editor`
  命名空间自动被其覆盖。

## 5. 与 GOAL.md 的关系

本设计落地后，GOAL.md E8 才可以真正勾选（目前如实标注为"故意不做，留给后续独立计划"）。
