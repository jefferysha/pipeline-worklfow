# 设计文档：Workflow 自定义引擎 + Dashboard 工作台（Skill 编辑器 / AFK 工作台 / Loop 设置）

> 2026-07-07 · brainstorming 会话产出 · 对应 GOAL.md「终态 v2.0」

## 0. 阶段声明（读者必须先知道这件事）

**从这份设计开始，"与老仓 workflow-plugin 字节级行为等价"不再是约束。** GOAL.md 的 v1.0
终态（完整 TS 重写 + golden-oracle 逐字等价）已经达成并收官，那是上一阶段的目的。这份文档
定义的是下一阶段：把 pipeline-worklfow 从"一个行为等价于特定老仓的固定工作流工具"，演进为
"骨架可自定义、skill 编排可自定义的工作流引擎"，同时给 dashboard 补三块此前完全没有 UI 的
能力（skill 编辑升级、AFK 工作台、loop 设置）。

golden-oracle（`tools/oracle/run.sh`）作为历史证据链保留，但不再是新功能的验收门槛——它比对
的是"默认 workflow 预设"，自定义 workflow 天然没有可比对的老仓对照物。

## 1. 整体导航

顶部导航保持现状 3 项不变（收件箱 / 看板 / 设置）。新增一个"工作台"分组，下辖：
- Workflow 编辑器（本文档 §2）
- Skill 编辑器升级（本文档 §3，实际上是"设置→技能矩阵"里"编辑"交互的升级，入口位置不变）
- AFK 工作台（本文档 §4，取代/升级现在"高级/调试"折叠面板里的只读 AFK 泳道）
- Loop 设置（本文档 §5，全新，现在 100% 命令行）

## 2. Workflow 自定义引擎

### 2.1 核心概念：workflow 定义文件

新增 `.pipeline/workflows/<name>.yaml`（相对项目根，具体存放路径待实现阶段与现有 `openspec/`
目录结构核对一致性）。7 相位变成**内置默认 workflow**（`name: default`），而非写死在类型系统里。

```yaml
name: default
steps:
  - id: open
    label: 立项
    skills: []
  - id: explore
    label: 调研
    gate: review              # 复核门语义保留，从硬编码变成字段（值域：null | review | confirm）。
                               # 注意这是 step 级别的门，跟"interaction"门是两回事——interaction
                               # 门是 skill 级别的（某个交互式 skill 自己要求确认，如
                               # superpowers:brainstorming），继续走现有 interactive-skill-gate.sh
                               # 机制，不受本次改动影响，也不进 step 的 gate 字段值域。
    skills:
      - id: superpowers:brainstorming
      - id: grill-with-docs
      - id: opsx:explore
        depends_on: [superpowers:brainstorming, grill-with-docs]
    inputs: []
    outputs:
      - field: design_doc
        type: file_path
  - id: build
    label: 实现
    inputs:
      - field: design_doc
        type: file_path
      - field: plan
        type: file_path
    outputs:
      - field: build_sha
        type: string
    guards:
      - type: tasks-at-least
        n: 3
    skills:
      - id: superpowers:test-driven-development
  # verify / ship / archive 同构
```

### 2.2 state 文件改动（`.pipeline.yaml`）

新增两个字段，取代写死类型的 `phase` 枚举：

```yaml
workflow: default        # 引用哪个 workflow 定义；缺省 "default"（内置 7 步）
current_step: explore    # 值域从"引用的 workflow 里查"，不是编译期常量
```

核心字段（name/track/created_at/updated_at/archived/workflow/current_step）保持固定、任何
workflow 都有；design_doc/plan/build_sha 这类字段完全由引用的 workflow 里各 step 的
`outputs` 声明动态派生，不再是 kernel 里写死的固定字段表。

### 2.3 Skill 编排：DAG 依赖（`depends_on`），而非分组

**已否决的方案**：把 skill 塞进"parallel 组 / serial 组"的线性队列。问题：真实依赖经常不是
分层的（C 依赖 A 和 B，D 只依赖 A 这种交叉关系，线性分组表达不出来，会被迫过度串行化）。

**采用方案**：每个 skill 自己声明 `depends_on`（依赖的其他 skill id 列表）。无 `depends_on`
= 无依赖，可立即调用（多个无依赖 skill 天然并行）。有 `depends_on` 就等对应的都完成。这是
主流工作流引擎的标准做法（GitHub Actions `needs:` / Airflow 同构），enforcement 逻辑反而
更简单——不需要维护"当前解锁到第几组"的状态指针，只要查"`depends_on` 里的名字是否都已经
在当前 step 的历史里出现过"，纯集合判断。

**约束**（保证可实现、可校验）：
- `depends_on` 只能引用**同一个 step 内**的 skill id，不能跨 step（跨 step 的顺序交给
  step 本身的 `gate`/`guards` 机制，不与 skill 级依赖耦合）。
- workflow **保存时**（不是运行时）必须校验：① 无循环依赖；② 每个 `inputs` 声明的字段必须
  对应同一 workflow 里某个**更早** step 的 `outputs`，否则拒绝保存并报错指出具体哪个引用
  无效。
- skill 级别**不设**输入输出（讨论后达成一致，见 §2.6 决策记录）。

### 2.4 Guards：复用现有规则库，参数化而非发明新逻辑

现有 guard 规则里有几个不是"字段非空"这么简单的真实逻辑判断（`tasks-at-least(3)` /
`coverage` / `automation-queued` / `depends-archived`）。这些**保留为一组固定的、代码实现好
的可选用 guard 类型**——不允许用户自己写判定逻辑（无限灵活也无限风险），只把"这个 step 用
哪几个、参数是多少"变成数据：

```yaml
guards:
  - type: tasks-at-least
    n: 3
  - type: nonempty-output   # outputs 声明的通用版本，取代原来一个个具体规则名
```

### 2.5 Hook 侧改动（gate.sh 为主）

现状：`gate.sh` 只判断"复核门 marker 新不新鲜"，完全不检查 skill 是否按声明的依赖顺序完成
——mandatory_skills 目前只是记录用途（skill-tracker.sh），不是硬拦截。

新增能力（这是真正新增的硬拦截逻辑，不只是数据格式变化）：
1. 读 `.pipeline.yaml` 的 `workflow` + `current_step`。
2. 去对应 workflow 文件里查这个 step 的 skill 依赖图定义。
3. 扫 `.pipeline-history.jsonl`：找到"最近一次进入当前 step"的时间点（对应的 transition
   事件），只统计这之后的 skill 完成记录（避免把上一个 step 里调用过的同名 skill 也算数）。
4. 对被拦截的 skill 调用，算出它的 `depends_on` 是否都已在第 3 步的记录里满足。
5. 未满足 → veto（exit 2），stderr 指出还差哪个依赖没完成。

workflow 文件本身仍是扁平 YAML，bash（grep/awk）可以解出 `depends_on` 这类简单键值/数组，
不需要引入解释器，保持热路径纯 bash 的硬规则（CONTRACT §5.4）。

### 2.6 决策记录（brainstorming 过程中明确否决/确认的选项，避免实现阶段重新纠结）

- ❌ 否决：skill 级别的 inputs/outputs（结论：skill 之间共享同一 agent 会话上下文，天然能
  看到彼此产出，不需要正式数据传递协议；`depends_on` 的顺序约束已经解决真正要紧的事）。
- ❌ 否决：完全数据驱动、任意步数/任意命名、跑在老仓对照之上的方案（因为已经声明放弃老仓
  行为等价，这条本身不再是否决理由，但仍否决"两套 schema 并存"——见下条）。
- ❌ 否决：新 workflow 概念和旧 `.pipeline.yaml` 固定字段表并存两套不一致设计。**采用**：
  state 文件、字段定义、yaml 格式必须是同一套自洽设计（用户明确指令）。
- ✅ 确认：旧格式在跑的 change 走一次性迁移工具（类比现有 `pipeline import`），不做运行时
  双格式兼容。

### 2.7 编辑器 UI：节点连线画布

用户明确选择"真画布节点连线图"（否决了工程量更小的手风琴表单方案）。step 和 skill 都是
可拖拽节点，`depends_on` 关系用鼠标拖一条连线表达。技术选型：`packages/dashboard-app` 不受
"零第三方依赖"硬规则约束（那条规则只管 kernel/cli，dashboard-app 本来就用 React/Vite 等
依赖），可以引入专门的节点图编辑库（如 React Flow/xyflow 一类），不需要从零造画布轮子。

## 3. Skill 编辑器升级

现状（iteration-33 刚落地）：设置→技能矩阵里，"编辑"打开一个原地文本框（逗号分隔手打
skill token）。

新设计：点"编辑"弹出对话框，双栏穿梭框——左栏是全部已注册 skill（可搜索，来源
`.claude/skills/*/SKILL.md`，14 个），右栏是当前格子已选的 skill，两栏之间可拖拽移动，
右栏内可拖拽排序。保存路径复用现有 `POST /api/config/mandatory-skills` 端点（B5 token
鉴权 + manifest.yaml 手术式写回 + kernel 回读校验），只是前端交互从文本框换成穿梭框，
后端契约不变。

## 4. AFK 工作台

现状：`GET /api/afk/snapshot` 数据已经很丰富（scheduler 状态 + 6 条泳道 queued/running/
merged/failed/conflict/paused，每条含 attempts/last_error/sandbox/worktree/
preserved_path），但只在"高级/调试"折叠面板里以纯文字列表呈现，没有操作能力（触发/取消/
看日志全部只能命令行）。

新设计：列表 + 详情侧栏。左边紧凑列表（change 名 + 状态 + 简要耗时），点一行右边展开详情
面板：完整日志 tail、sandbox/worktree 路径、可执行操作按钮（取消 / 重试 / 人工合并——按
当前状态显示对应可用操作）。需要新增的后端能力：
- 日志 tail 的读取端点（当前只有事后聚合数据，没有实时/近实时日志流接口）
- 取消/重试/合并的写端点（当前 `pipeline afk` 全部命令行操作，无 HTTP 对应）

## 5. Loop 设置

现状：loops 治理（registry/enforce/budget/graduation）100% 命令行，dashboard 上零 UI
（"高级"面板里的"loops 治理"一行是历史遗留占位，写"待对应程序数据端接线"）。

新设计：单表视图。一行一个已注册 loop，列 = 分级（L1/L2/L3）/ 就绪分（0-100）/ 预算余量 /
状态，点行展开详情（7 维 drift 明细、enforce 历史判定、升降档操作按钮）。需要新增的后端
能力：一个聚合读端点（把 registry + drift + budget + graduation 现状拼一份 snapshot，
类比 `/api/afk/snapshot` 的做法）+ 升降档动作对应的写端点（复用 B5 鉴权模式）。

## 6. 测试方法论

延续本项目一贯的硬规则（GOAL.md 清单 C）：**无伪测试，真实 e2e 为收编门槛**，mock 只作快速
回归。具体到本次四块工作：

- **Workflow 引擎**：真建临时 change + 真 workflow 定义文件 → 真调 `gate.sh` 子进程验证
  `depends_on` 解锁顺序（含混合 parallel/serial 场景）、真验证保存时环检测/inputs-outputs
  引用校验真的拒绝非法 workflow、真跑一次迁移工具验证旧格式 change 正确转换。参考现有
  `packages/cli/src/workflow-skill-orchestration.integration.test.ts` 的真子进程驱动模式。
- **三个 dashboard 新 UI**：复用现有 `SettingsView.test.tsx`/`server.test.ts` 的真 HTTP +
  真 jsdom render 模式——新写端点要有真 HTTP 集成测试，新前端交互（穿梭框拖拽、画布连线、
  AFK 操作按钮）要有真 fireEvent 驱动的 render 测试，不能只测组件是否挂载。
- **画布编辑器**（如采用 React Flow 一类库）：库本身的拖拽/连线行为不需要重新测试，但"保存
  的 workflow 数据是否正确反映画布上的连线状态"这个双向绑定需要真测试覆盖。

## 7. 范围外 / 待实现阶段细化的问题

以下问题设计阶段已经点名，但细节留给 writing-plans 阶段展开，不在此处展开是因为答案依赖
具体代码结构，写多了容易和实现脱节：

- workflow 定义文件的确切存放路径与 `openspec/` 现有目录结构的关系
- 节点画布编辑器的具体交互细节（连线删除、多选、画布缩放/平移等）
- AFK 工作台日志 tail 端点是轮询还是复用现有 SSE `/api/stream` 机制
- 旧 `.pipeline.yaml` → 新 schema 的一次性迁移工具的具体字段映射规则
- 4 块工作是否真的完全并行实现，还是 workflow 引擎（风险最高、改动面最广）作为其余三块
  的前置依赖单独先行——这是 writing-plans 阶段需要给出的排期判断，不是设计阶段的问题
