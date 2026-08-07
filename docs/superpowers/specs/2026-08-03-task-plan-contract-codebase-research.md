# TaskPlan v1 代码库研究

范围：`task-plan-contract` 的 backend Explore 隔离研究。本文只描述当前代码事实、待 Spec 验证的假设和建议；不把未提交 worktree 改动或 legacy Markdown 推断当作 canonical 证据。

## 结论摘要

1. 最合适的限界上下文是 `packages/kernel/src/task-plan/`：TaskPlan/TaskPlanRevision/TaskGroup/WorkItem、纯 validator、JSON codec、legacy Markdown adapter 与稳定 read model 均在这里；文件锁、原子发布和具体路径只能位于 `packages/kernel/src/state/` 基础设施层。现有 `packages/kernel/src/state/tasks.ts` 是 **Change 级** 24 字段兼容 task，不是 `tasks.md` WorkItem，不能扩充或改名复用。
2. canonical WorkItem ID 必须是创建时生成并持久化的 opaque ID，不能来自文本、数组序号、Markdown 行号或父组路径。现有图投影的 `task:<stage>:<index>` 会随重排变化，只适合 legacy display；新 DTO 必须直接使用 `WorkItem.id`。
3. `tasks.md` 兼容应单向、显式分级：canonical v1 存在时由它生成 Markdown 投影；canonical v1 不存在时只生成 `legacy` read model，依赖、requirement/acceptance、resource、output、validator 均保持空且标记 unknown/incomplete，绝不补造。
4. PR1 不应把 AFK、互动模式、权限或默认决策塞进 WorkItem。后续应用层以“冻结 TaskPlanRevision + Workflow/Run policy + Skill evidence”求交集并判 admission；TaskPlan 只描述工作、依赖、资源、输出和 validator 声明。
5. 当前 receipt 前置缺陷是 fallback discovery 在 128 个合法 JSONL 时提前失败；worktree-local 修复把 transcript 计数上限与已有 4096 metadata-entry 预算对齐，同时仍只选最新 32 个、保留 512 MiB 单文件/总量和 inode/mtime/ctime 检查。测试还应补一条完整 `reconcileCodexSkillEvidence` 回归，而不只测试候选枚举。

## 一、现状事实

### 1. `tasks.md` 是当前 Todo 源，但 parser/guard 语义并不统一

- 项目宪法把 `tasks.md` 定义为七阶段持续演进的唯一 Todo 源，出口只检查截至当前 phase 的任务，未来任务继续展示（`templates/workflow.md:23-24`）；公共合同也明确无阶段标题的历史文件只有 Build 执行全清单兼容语义（`docs/CONTRACT.md:179-180`）。
- 初始化只创建 `proposal.md`、`design.md`、`tasks.md`，Task scaffold 根据冻结 workflow steps 生成标题和 checkbox（`packages/kernel/src/state/default-openspec-scaffold.ts:20-43`；`packages/kernel/src/documents/document-template-renderer.ts:142-150`）。目前没有 TaskPlan JSON 或 WorkItem repository。
- 展示 parser 接受缩进、`-/*/+`、`x/X`，按可识别阶段标题分组；没有阶段标题时先落到当前 phase（`packages/kernel/src/workflow/todo-projection.ts:100-130`）。它只产出 `{text, completed}`（`packages/kernel/src/workflow/todo-projection.ts:20-23`）。
- legacy Build gate 则刻意把无阶段标题的整个清单算到 Build（`packages/kernel/src/workflow/todo-projection.ts:172-205`）。
- `tasks-at-least` 仍用更窄的历史正则：只计列首 `- [ ]` 或小写 `- [x]`，不计大写 X、缩进或其他 bullet（`packages/kernel/src/flow/guard.ts:200-205`）。Default guard 和 custom workflow handler 都复用它（`packages/kernel/src/flow/guard.ts:342-347`；`packages/kernel/src/workflow/guard-handlers.ts:59-69`）。

**事实影响：** 同一 Markdown 行可能在 Dashboard 中显示为任务，但不计入 `tasks-at-least`。TaskPlan v1 可以统一新 canonical 语义，但不能顺手改变 legacy guard regex；应让 legacy adapter 同时保留 `display items` 与 `historical guard count` 两种明确结果，兼容测试再决定迁移时点。

### 2. 当前 Todo 是 read projection，不是任务聚合

- `projectPipelineTodo` 以 workflow stages + Markdown +额外文档项生成阶段状态和任务列表，不写回任何状态（`packages/kernel/src/workflow/todo-projection.ts:133-169`）。
- Server 对 `tasks.md` 使用 256 KiB 上限、`O_NOFOLLOW|O_NONBLOCK`、普通文件检查、change dir/leaf realpath containment 与读前后 inode/version fence；异常时省略展示源（`packages/server/src/snapshotTasks.ts:16-17`、`39-89`）。
- Snapshot 把 Markdown Todo 和 document ledger 合成一个投影（`packages/server/src/snapshot.ts:147-160`、`248-280`）。`[document] <kind>` 是合成状态，不是可调度 WorkItem。
- 现有 DTO 只有 stage `id/label/status` 和 item `text/completed`（`packages/server/src/types.ts:30-57`；Dashboard 镜像为 `packages/dashboard-app/src/types.ts:63-78`），decoder 也只接受这两个 item 字段（`packages/dashboard-app/src/api/snapshotDecoder.ts:28-50`）。
- SSE fingerprint 独立观察 canonical state、`tasks.md` 和 document ledger（`packages/server/src/snapshot.ts:335-378`），说明当前三者本来就是不同一致性来源。

**事实影响：** 新 TaskPlan DTO 不应直接替换现有 `todo` 的 rolling-compatible 形状。PR1 应导出独立、稳定、只读 `TaskPlanReadModelV1`；后续 server/Dashboard PR 再增加 optional 字段或新端点。Document evidence 必须用显式 `origin: document-evidence` 合成，不能伪装成 WorkItem。

### 3. `CanonicalTask` 是 Change，不是 WorkItem

- `packages/kernel/src/state/tasks.ts` 的注释和字段表明确它投影的是 legacy Tenon `task.json` 24 字段，`id/name/title` 都取 Change 名，`status` 取 phase，`subtasks` 取 Change 的 `depends_on`（`packages/kernel/src/state/tasks.ts:134-160`、`179-211`）。
- 其依赖匹配允许 `NN-NN-slug` 与短名互相按后缀匹配（`packages/kernel/src/state/tasks.ts:72-80`），并遍历 active/archive Change 目录构造 Change 树（`packages/kernel/src/state/tasks.ts:249-272`）。

**事实影响：** WorkItem `depends_on` 必须只做精确 opaque-ID 匹配；不得复用 `normalizeDeps` 的 CSV/null 兼容或 `taskNameMatches` 的宽松后缀规则。否则 `wi-a`、`01-wi-a` 可能错误合并。建议在公共出口保留现有 `CanonicalTask` ABI，同时新增清晰命名的 TaskPlan exports。

### 4. 当前“稳定 task ID”并不稳定

- Orchestration graph 当前把 Markdown item ID 构造为 `task:<stage>:<index>`（`packages/server/src/orchestrationGraph.ts:168-183`）；插入或移动 checkbox 会改变后续 ID。
- WorkflowRun 创建使用持久化的 opaque `runId`，普通调用默认 `randomUUID`，测试可以注入确定性 generator；注释明确禁止用 Change 名、路径或时间戳冒充稳定 ID（`packages/kernel/src/state/workflow-run-repository.ts:51-57`、`82-90`）。
- Verification 在 workflow IR 缺少独立 action/verifier ID 时使用“冻结 workflow digest + 声明坐标”寻址，而不是发明不稳定 ID（`packages/kernel/src/verification/types.ts:11-13`、`24-52`）。

**事实影响：** canonical `task_plan_id/revision_id/group_id/work_item_id/validator_id` 应为创建时生成、codec 原样保存的 opaque ID；更新标题、分组和顺序不得重算。legacy-only item 最多提供带 `identity_quality: legacy-derived` 的确定性 display key，不能被 PR2 evidence 或 PR4 scheduler 当 canonical WorkItem ID。

### 5. 可复用的 codec、validator 和发布原语

- Run revision codec 先按闭集规范化写入对象，避免 `JSON.stringify` 静默丢掉 `undefined`；读取时区分 future version 与 corrupt、拒绝未知顶层字段、校验 digest 和嵌套闭集（`packages/kernel/src/state/run-revision-codec.ts:347-379`、`396-455`）。
- `verification/evidence-composer` 已有更适合 TaskPlan 的确定性 validation result 模式：显式资源上限、稳定 `{code,path}`、错误数 overflow、unknown-field 拒绝、普通对象/数组 snapshot、防 getter/Proxy/toJSON、UTF-8 byte 和控制字符检查（`packages/kernel/src/verification/evidence-composer.ts:1-58`、`71-143`、`164-219`）。
- `VerificationResult` validator 证明了外部输入应先 read-once 复制、再校验并深冻结，且项目相对路径要拒绝绝对路径、NUL、`.`/`..` 和空段（`packages/kernel/src/verification/validate.ts:1-34`、`142-180`）。
- 文件发布已有两种不同语义：`atomicLinkPublish` 用于 immutable no-replace，`atomicReplaceFile` 用于 mutable current pointer（`packages/kernel/src/state/atomic-publish.ts:1-15`、`21-39`）。跨进程互斥使用 change-scoped mkdir lock（`packages/kernel/src/state/lock.ts:1-21`、`171-191`）。
- canonical state 的现有提交次序是先发布 immutable revision、再原子 replace current；projection 在 canonical commit 后 best-effort 更新，并把失败显式返回为 pending（`packages/kernel/src/state/run-revision-store.ts:242-266`；`packages/kernel/src/state/store.ts:268-292`）。

**事实影响：** TaskPlan codec/validator 可复用模式，不能直接依赖 state codec 的 `PipelineState` 形状。若 PR1 包含 repository，建议 `.pipeline-task-plan/revisions/<revision>-<id>.json` + `current.json`：在同一 Change lock 下先 no-replace immutable revision，再 replace current 作为唯一提交点，最后 best-effort 投影 `tasks.md`。投影必须携带 revision/digest 标记并可报告 pending/drift；新 reader 有 current 后绝不回退被手改的 Markdown。若 PR1 只交付 contract/codec，则 repository 明确留到后续，避免半套双写。

## 二、推荐的 DDD 包边界

```text
packages/kernel/src/task-plan/
  types.ts                 # 领域对象和值对象；零 Node/FS/CLI/HTTP
  ids.ts                   # opaque ID 词法与构造结果，不生成随机数
  validate.ts              # 收集式确定性不变量/coverage/DAG/conflict issue
  codec.ts                 # task-plan/v1 JSON 闭集 decode/encode
  legacy-markdown.ts       # tasks.md -> legacy read model；绝不补造关系
  projection.ts            # canonical plan -> Markdown / stable readonly DTO
  index.ts                 # 最小具名出口

packages/kernel/src/state/
  task-plan-store.ts       # 仅在 PR1 确实要求持久化时：lock/CAS/immutable/current/projection
```

### 聚合与不变量建议

- `TaskPlanRevision` 是提交/冻结单位；保存 `schema_version: 1`、`task_plan_id`、`revision`、`revision_id`、可选 `previous_revision_id`、归属坐标、groups/items 以及精确内容 digest。Codec 不得在 decode 时生成 ID。
- `TaskGroup` 只表达展示/所有权树；`parent_group_id` 或 `child_group_ids` 不产生执行边。每个 WorkItem 必须恰好属于一个 group；group parent 必须存在、不得自指/成环。
- `WorkItem.depends_on` 是唯一执行依赖源，只引用同 revision 的精确 WorkItem ID；拒绝 self、missing、duplicate 和 cycle。父子组绝不自动追加 dependency。
- requirement/acceptance coverage 要有显式“应覆盖全集”。当前 OpenSpec 只有标题，没有稳定 requirement/scenario ID parser；因此 v1 要么把 expected refs 作为 validation context/plan catalog，要么只做语法与重复检查，不能声称外部 OpenSpec 覆盖完整。
- resource claim 应是 closed union + canonical key，而非自由 shell/glob。至少区分 read/write；冲突分析以规范化后的 write key 和 WorkItem 可达关系为输入。沿依赖有序的两个 writer 不应与无序并行 writer 混为同一错误。
- expected output 必须是稳定类型的声明（例如 artifact kind + project-relative path/ref），复用严格相对路径规则。validator 应引用具名、版本化、允许列表中的声明 ID/种类，不在 TaskPlan 里放任意 shell 命令。
- validator 返回有界、结构化、稳定排序的 issues（建议 `severity/code/path/related_ids`），而不是当前 workflow validator 的中文字符串数组。排序键固定为 `severity -> code -> path -> related_ids`，使 codec、API、Dashboard 和测试可复现。
- 通过 decode/validate 的对象要复制并递归 freeze；输入预算至少覆盖总 bytes、groups、items、每项 deps/refs/claims/outputs/validators、字符串 bytes 和最大 issues。

## 三、legacy `tasks.md` 兼容策略

### 推荐双轨读取

1. **存在有效 TaskPlan current：** TaskPlan 是唯一 canonical source；`tasks.md` 是带 plan revision/digest 的兼容 projection。新 guard/read DTO 读 TaskPlan，不因 Markdown 缺失或旧投影篡改而回退。投影异常显示 `pending/drift`，由官方修复命令重建。
2. **不存在 TaskPlan current：** 使用现有 Markdown 规则生成 `source: legacy` read model；保留阶段、文本、完成态和原始顺序。所有无法证明的字段保持 `[]`/`unknown`，并返回 completeness flags，例如 `dependencies: unknown`、`coverage: unknown`、`resources: unknown`、`validators: unknown`。
3. **显式 materialize：** 只有官方迁移命令在 Change lock 下创建持久 opaque IDs。它可保留文本/完成态/阶段，但不得从标题层级猜 dependency、从措辞猜 requirement/acceptance、从路径词猜 resource/output。迁移应幂等、可预览、可失败恢复。

### 不推荐方案

- 用 `stage + index`：重排即换身份；现有图已暴露此限制（`packages/server/src/orchestrationGraph.ts:168-183`）。
- 用 checkbox 文本 hash：改文案即换身份，重复文本冲突，也会把内容 identity 与实体 identity 混为一体。
- 让 Markdown 与 JSON 双向自由编辑：跨文件无原子事务，且 document ledger 对 `tasks.md` digest 有独立治理，必然出现 canonical/ledger/projection 三方漂移。
- 把 document synthesized Todo 变成 WorkItem：它来自 document policy 状态（`packages/server/src/snapshot.ts:147-160`），没有任务作者、依赖或资源声明。

## 四、receipt discovery 前置修复边界

### Worktree-local 事实

- 当前未提交 diff 把 `MAX_DISCOVERED_TRANSCRIPTS` 从 128 调为已有 `MAX_DISCOVERY_ENTRIES` 4096；metadata walk 仍先累计 entries，超预算失败关闭（`packages/cli/src/codexTranscriptDiscovery.ts:5-22`、`100-129`）。
- 仍只选按 mtime 最新的 32 个候选，总计不超过 512 MiB，单文件不超过 512 MiB（`packages/cli/src/codexTranscriptDiscovery.ts:5-8`、`137-145`）。
- 每个候选仍要求普通非 symlink 文件、sessions root containment，并记录 dev/inode/size/mtime/ctime；打开与读后再次核对（`packages/cli/src/codexTranscriptDiscovery.ts:38-65`、`159-199`）。
- fallback 仍要求 trusted Skill path、精确 bound host session、当前/latest turn、完整 invocation/output ABI、项目/同 Git common-dir sibling worktree 和成功输出；任一 malformed/I/O/replacement 都整体返回空证据（`packages/cli/src/codexTranscriptEvidence.ts:271-315`、`335-389`、`437-485`）。
- 新测试证明 129 个历史合法 transcript 后仍返回最新 32 个且当前文件排第一（`packages/cli/src/codexSkillReceipt.test.ts:2357-2374`）。

### 安全判断与补测建议

- 调整是“修复错误 fail-closed 阈值”，不是扩大被接受证据的语义：4096 entry、512 MiB、32 selected、session/turn/project/ABI/file-identity 门均未改变。
- 4096 transcripts 实际还受目录 entry 计数约束；因此不会绕过 metadata budget。I/O 最坏情况仍以 metadata stat/realpath + 32 个完整 transcript 读取为主。
- 现有新增测试只覆盖 discovery helper。应再补一条 `reconcileCodexSkillEvidence`/`discoverCompletedCodexSkillReads` 集成回归：129+ transcript、最新文件绑定 exact host session/current turn、真实 trusted Skill read +完整成功 envelope，断言只追加当前 phase 的 `CodexSkillRead`；同时保留第 129 个为 malformed/oversized/empty-latest/replaced 的 fail-closed 对照。
- mtime 相同的候选当前只按 mtime 排序（`packages/cli/src/codexTranscriptDiscovery.ts:139-143`）；如果 exact bound session 位于同 mtime 的第 33+ 个文件，选择顺序依赖目录遍历。Spec 应决定加稳定 secondary key，或在 entry budget 内先匹配 `session_meta.payload.id` 再应用 32 个全文读取预算。

## 五、跨堆叠 PR 冲突风险

1. **PR2 绑定风险：** PR2 要绑定 `TaskPlanRevision/WorkItem/StepVisit`，但当前仓库没有 StepVisit aggregate。PR1 必须冻结可引用的 revision/item identity；不要让 PR2 反向修改 TaskPlan ID 语义。
2. **PR3 策略污染风险：** interaction/decomposition/权限属于冻结 WorkflowRun policy，不属于 WorkItem。塞进 TaskPlan 会导致相同工作因模式变化而换 digest，并让 AFK 配置扩大任务权限。
3. **PR4 调度重复风险：** PR1 validator 负责结构合法性和确定性诊断；PR4 scheduler 负责 wave、运行态、失效传播。不要在 PR1 预实现 queue/retry/cancel，也不要让 PR4 重写 cycle/resource 规范化。
4. **PR5 DTO 漂移风险：** 当前 server/Dashboard 手抄 snapshot DTO。PR1 read model 必须是纯 kernel 合同；PR5 要通过 server adapter 显式转换并 decoder 严校验，前端不得重新计算 coverage/wave/conflict。
5. **既有 guard 风险：** 将新 parser 直接替换 `taskCount` 会改变历史大写 X/缩进/bullet 行的门禁结果。必须以 fixture 固定旧语义，单独设计迁移开关或只对 canonical TaskPlan 启用新 validator。

## 六、建议的 PR1 最小交付边界

- 新增纯 kernel `task-plan` domain/types/codec/validator/legacy adapter/read-model，具名从 `@tenon/kernel` 导出。
- 覆盖：closed schema/future version、opaque stable IDs、重复/缺失归属、父组环、dependency self/missing/duplicate/cycle、requirement/acceptance coverage、resource normalization/conflict、outputs/validators、确定性 issues、预算、legacy 不补造、round-trip/freeze。
- 保持 `state/tasks.ts`、现有 `todo` DTO、workflow guard 与 Dashboard 行为兼容；如本 PR 无真实 repository，就在合同中明确 canonical persistence 尚未接线，避免声称 `tasks.md` 已经降为 projection。
- receipt discovery 修复独立保留为最小 CLI 改动并补端到端回归，不让它与 TaskPlan domain 共用 commit/类型。

## 开放问题

1. Requirement/Acceptance 的权威 ref 从哪里来：在 TaskPlan 内显式声明 expected ref catalog，还是本 Change 同时定义 OpenSpec requirement/scenario 稳定 ID 方案？没有这个全集，无法诚实判“覆盖完整”。
2. PR1 是否必须落地 TaskPlan repository/current pointer，还是只交付 model+codec+validator+projection？若要持久化，`tasks.md` 的官方编辑/record Skill 与 document ledger 如何在 canonical-first、projection-pending 窗口中恢复？
3. `resource claim` v1 的命名空间和相交规则是什么：只支持精确 project-relative path，还是支持 glob/逻辑资源；有依赖顺序的两个 writer算合法序列化还是 validation conflict？
4. Validator v1 是只允许具名声明引用，还是允许受控 command validator？若允许命令，谁负责许可、版本冻结和 evidence binding，如何确保 TaskPlan 本身不授予执行权限？
5. legacy-derived display key 是否需要跨文本编辑保持稳定？如果需要，只能通过显式 materialize 持久化 opaque IDs；若不 materialize，应禁止 PR2/PR4 对 legacy item 建证据或调度绑定。
