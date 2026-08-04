# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 通用 SkillInvocation 身份

系统 MUST 为所有 Skill 提供统一 Invocation 协议，并绑定 Project、WorkflowDefinition、PipelineRun、StepVisit、可选 TaskPlanRevision/WorkItem 与 attempt；Task Planner 不得拥有私有证据通道。

#### Scenario: 精确绑定成功

- **WHEN** started event 的冗余 run/step/visit/item/attempt 身份全部一致
- **THEN** repository 接受事件并返回稳定 invocation ID

#### Scenario: 错误绑定失败关闭

- **WHEN** 任一 identity 缺失、跨 Change/visit/item/attempt 或 fingerprint 不一致
- **THEN** 不追加事件且返回结构化 binding error

### Requirement: 唯一且可恢复的调用状态机

每个 Invocation MUST 恰有一个 started 和最多一个 terminal；相同重放幂等、冲突重放拒绝，中断不得推断 completed。

#### Scenario: 进程中断

- **WHEN** InvocationStarted 后进程退出且没有 terminal
- **THEN** 投影为 incomplete，并仅能在 ownership recovery 后追加 interrupted

#### Scenario: 冲突 terminal

- **WHEN** 已 completed 的 invocation 再写 failed 或不同 completed digest
- **THEN** ledger 标为冲突并失败关闭

### Requirement: 调用前输入与调用后输出证明

Invocation MUST 记录版本化 input/output schema、字段分类、bounded digest、validator verdict 与 trusted adapter proof，而不是原始 Prompt 或输出正文。

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
- **THEN** 保存 option ID 或自由文本分类/keyed digest，不保存原文

#### Scenario: 不存在的问题

- **WHEN** DecisionEvent 引用未记录或不同 invocation 的 question
- **THEN** 决策被拒绝且 invocation 不能满足提问契约

### Requirement: 推荐默认决策证明

未展示例行问题时，DecisionEvent MUST 证明原 question key、冻结 InteractionPolicy rule、推荐 option、理由和 mode；hard-gate 永不允许默认。

#### Scenario: 合法默认

- **WHEN** frozen policy 精确允许该 routine question 的默认 option 且无硬边界
- **THEN** 保存 recommended-default 决策并标记 shown=false

#### Scenario: hard confirmation

- **WHEN** question requiredness=hard-gate 或 policy identity 漂移
- **THEN** default decision 被拒绝并产生 blocker

### Requirement: ArtifactBinding 与 validator

只有 completed invocation 才能绑定当前 digest 的 artifact；文档引用 canonical document record，其他 artifact 使用结构化 intent/commit binding。

#### Scenario: 中断绑定

- **WHEN** binding intent 已写但 artifact commit 或 terminal 缺失
- **THEN** 投影为 orphan intent 且不算成功产物

#### Scenario: digest 漂移

- **WHEN** 文件 digest 与 binding intent 不同
- **THEN** binding 失败且旧产物不满足 validator

### Requirement: 严格 append-only repository

repository MUST 在 Change lock 下使用 closed JSONL codec、bounded read、append+fsync；坏行使写面 degraded/fail-closed。

#### Scenario: 并发和幂等

- **WHEN** 两个进程并发写同 invocation 的相同事件
- **THEN** 只产生一个有效事实；不同事件按状态机串行验证

### Requirement: 隐私最小化只读 API

server MUST 提供稳定只读投影，并排除 transcript path、绝对 Skill path、host session/turn、raw prompt/answer/output、内部 digest 与 credentials。

#### Scenario: Dashboard 查询

- **WHEN** 请求某 Run/WorkItem 的 Invocation
- **THEN** 返回 Skill/status/time、subject、字段级 input/output verdict、question/decision、artifact 和 validator 状态

#### Scenario: 未知或损坏证据

- **WHEN** ledger incomplete/corrupt 或 DTO 含未来 enum
- **THEN** API 返回结构化 incomplete/corrupt/unknown，不把它显示为成功
