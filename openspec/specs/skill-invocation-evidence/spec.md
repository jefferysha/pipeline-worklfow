# skill-invocation-evidence Specification

## Purpose

定义所有 Skill 调用的 canonical 身份、生命周期、提问与决策、产物绑定、隐私投影和失败关闭契约。

## Requirements

### Requirement: 通用 SkillInvocation 身份

系统 MUST 为所有 Skill 提供统一 Invocation 协议，并绑定 Project、WorkflowDefinition、PipelineRun、StepVisit、可选 TaskPlanRevision/WorkItem 与 attempt；Task Planner 不得拥有私有证据通道。

生产写入 MUST 通过受信任 application command，并由 repository 无条件读取 canonical state；公开 API 不得允许调用者替换 Project、Run、StepVisit、TaskPlanRevision、WorkItem 或 attempt binding。

#### Scenario: 精确绑定成功

- **WHEN** started event 的冗余 run/step/visit/item/attempt 身份全部一致
- **THEN** repository 接受事件并返回稳定 invocation ID

#### Scenario: 错误绑定失败关闭

- **WHEN** 任一 identity 缺失、跨 Change/visit/item/attempt 或 fingerprint 不一致
- **THEN** 不追加事件且返回结构化 binding error

#### Scenario: 调用者尝试覆盖 canonical binding

- **WHEN** producer 提交自带的 Project、Run、StepVisit、WorkItem 或 attempt context
- **THEN** application command 忽略或拒绝该上下文，并只按当前 canonical state 校验

#### Scenario: 生产 Skill 生命周期

- **WHEN** Codex document producer、native/Task Planner 或 AFK runner 真实开始并结束一次 Skill 调用
- **THEN** 对应生产 adapter MUST 经受信任 command 持久化同一 invocation 的 started、terminal 与适用的 question、decision、artifact 事实

### Requirement: 唯一且可恢复的调用状态机

每个 Invocation MUST 恰有一个 started 和最多一个 terminal；相同重放幂等、冲突重放拒绝，中断不得推断 completed。

repository MUST 在任何 append 前验证 ledger 中所有 invocation 的 aggregate，并在新事实会超过 event、byte、invocation、question 或 artifact budget 时拒绝写入。

#### Scenario: 进程中断

- **WHEN** InvocationStarted 后进程退出且没有 terminal
- **THEN** 投影为 incomplete，并仅能在 ownership recovery 后追加 interrupted

#### Scenario: 冲突 terminal

- **WHEN** 已 completed 的 invocation 再写 failed 或不同 completed digest
- **THEN** ledger 标为冲突并失败关闭

### Requirement: 调用前输入与调用后输出证明

Invocation MUST 记录版本化 input/output schema、字段分类、bounded digest、validator verdict 与 trusted adapter proof，而不是原始 Prompt 或输出正文。

字段、question/answer 与 validator verdict MUST 来自受信任 producer receipt；terminal verifier 必须核对 started Skill/schema/input 与当前 aggregate，不得只验证孤立 terminal event。

#### Scenario: trusted Codex 完成

- **WHEN** 现有 transcript verifier 证明精确 session/turn/worktree/ABI、完整 Skill 内容与成功 output
- **THEN** adapter 可提交 completed proof

#### Scenario: 仅有 history 字符串

- **WHEN** 只有 `Skill:` 或 `CodexSkillRead:` compatibility 行
- **THEN** v1 repository 不得据此铸造 completed invocation

### Requirement: QuestionEvent 证明实际提问

QuestionEvent MUST 绑定 invocation 与版本化 question key/schema/options、requiredness、shown 状态和时间。

#### Scenario: 用户实际回答

- **WHEN** question 已 shown 且 DecisionEvent 引用同一 question/invocation/visit
- **THEN** 保存至少一个 option ID 或自由文本分类/keyed digest，不保存原文；空回答不得满足任何 question，尤其不得满足 hard-gate

#### Scenario: 不存在的问题

- **WHEN** DecisionEvent 引用未记录或不同 invocation 的 question
- **THEN** 决策被拒绝且 invocation 不能满足提问契约

### Requirement: 推荐默认决策证明

未展示例行问题时，DecisionEvent MUST 证明原 question key/schema、精确 subject、冻结 InteractionPolicy rule、推荐 option、理由和 mode；repository 必须把匹配 QuestionEvent 与当前 aggregate 交给 policy verifier，hard-gate 永不允许默认。

#### Scenario: 合法默认

- **WHEN** frozen policy 精确允许该 routine question 的默认 option 且无硬边界
- **THEN** 保存 recommended-default 决策并标记 shown=false

#### Scenario: hard confirmation

- **WHEN** question requiredness=hard-gate 或 policy identity 漂移
- **THEN** default decision 被拒绝并产生 blocker

### Requirement: ArtifactBinding 与 validator

系统 MUST 只允许 completed invocation 绑定当前 digest 的 artifact；文档引用 canonical document record，文件使用安全项目相对路径，其他 artifact 使用 bounded opaque ref。Intent 必须在公开前通过 ref 隐私校验并引用唯一 declared output；commit validator 必须与受信任执行结果精确匹配且达到契约要求的 verdict。

#### Scenario: 中断绑定

- **WHEN** binding intent 已写但 artifact commit 或 terminal 缺失
- **THEN** 投影为 orphan intent 且不算成功产物

#### Scenario: digest 漂移

- **WHEN** 文件 digest 与 binding intent 不同
- **THEN** binding 失败且旧产物不满足 validator

### Requirement: 严格 append-only repository

repository MUST 在 Change lock 下使用 closed JSONL codec、bounded read、append+fsync；坏行使写面 degraded/fail-closed。

repository 的普通有界读取入口 MUST 继续拒绝任意 symlink/path alias。只有调用方仍持有已打开目录，并提供与该目录已验证 dev/ino 精确相等的 anchored-directory capability 时，读取器 MAY 接受该目录的可遍历 FD alias；leaf MUST 使用 no-follow 语义，且父目录身份/realpath 与 leaf 身份/元数据 MUST 在读取窗口内保持稳定。任一身份不符、alias/realpath/leaf 变化或无法验证 MUST 失败关闭。

#### Scenario: 并发和幂等

- **WHEN** 两个进程并发写同 invocation 的相同事件
- **THEN** 只产生一个有效事实；不同事件按状态机串行验证

#### Scenario: 普通路径别名仍被拒绝

- **WHEN** 调用方通过普通 repository/文件读取入口传入 symlink parent 或其他路径别名
- **THEN** 读取失败，且不得返回 ledger 内容

#### Scenario: 已验证目录 FD alias 在 Linux 可读

- **WHEN** server 仍持有以 `O_DIRECTORY | O_NOFOLLOW` 打开的 Change 目录，`fstat` 身份与 Change anchor 相等，并通过可遍历 FD alias 读取
- **THEN** repository 使用同一 dev/ino capability 读取非 symlink 普通 leaf，并保持既有 evidence 投影与空 ledger 语义

#### Scenario: 身份或读取窗口变化失败关闭

- **WHEN** anchored capability 的 dev/ino 错误，或 parent alias、realpath、leaf 身份/大小/mtime/ctime 在读前、读中或读后变化
- **THEN** 读取失败且不得把变化前后任一内容返回为有效 evidence

### Requirement: 隐私最小化只读 API

server MUST 提供稳定只读投影，并排除 transcript path、绝对 Skill path、host session/turn、raw prompt/answer/output、内部 digest 与 credentials。

Dashboard MUST 展示 privacy-safe 的字段 classification/validator、free-text-present/classification、artifact validator，以及 loading/empty/error/completed/incomplete/failed/interrupted 状态；client decoder 必须拒绝冗余 run identity 冲突。Change path forbidden/symlink 必须稳定保留 403，仅真实不存在映射 404。

#### Scenario: Dashboard 查询

- **WHEN** 请求某 Run/WorkItem 的 Invocation
- **THEN** 返回 Skill/status/time、subject、字段级 input/output verdict、question/decision、artifact 和 validator 状态

#### Scenario: 未知或损坏证据

- **WHEN** ledger incomplete/corrupt 或 DTO 含未来 enum
- **THEN** API 返回结构化 incomplete/corrupt/unknown，不把它显示为成功
