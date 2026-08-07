# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 从显式事实推导确定性波次

系统 MUST 仅从 validated frozen TaskPlan 的 `depends_on` 和规范化 resource write claims 推导执行波次；不得接受手写 wave 作为真相。

#### Scenario: 可并行项目

- **WHEN** 两个 ready WorkItem 无依赖且写资源不重叠
- **THEN** 它们进入同一波次并按稳定 ID 排序

#### Scenario: group 不成边

- **WHEN** WorkItem 仅存在父子/同组关系
- **THEN** scheduler 不产生依赖边

### Requirement: 环与资源冲突失败关闭

编译器 MUST 检测依赖环、缺失目标与含糊 resource claim；合法可比较写冲突按稳定 ID 序列化。

#### Scenario: 循环计划

- **WHEN** WorkItem graph 有环
- **THEN** plan run 为 invalid-plan 且零 admission

#### Scenario: 可比较写冲突

- **WHEN** 同波 ready items 写同一 exact normalized resource
- **THEN** 编译器生成确定性先后并在 DTO 解释原因

### Requirement: 上游失败与失效传播

上游 terminal failure MUST 阻断 descendants；上游重试产生的新 output/input digest MUST 使基于旧 digest 的 descendants 与 integration verdict 变为 invalidated。

#### Scenario: 上游失败

- **WHEN** WorkItem A failed 且 B depends_on A
- **THEN** B 为 blocked-upstream 且不得 claim

#### Scenario: 成功重试

- **WHEN** A 的 attempt n+1 成功且输出 digest 改变
- **THEN** 已消费 n 输出的 descendants 标记 invalidated 并重新计算 readiness

### Requirement: durable retry cancel resume

retry、cancel、resume MUST 追加 durable attempt/operation facts，不得重写历史；取消沿用 marker-before-kill 与 owner CAS。

#### Scenario: retry

- **WHEN** server-authorized retry 针对 retryable failed item
- **THEN** 创建 attempt n+1 并保留 attempt n 与失效关系

#### Scenario: restart resume

- **WHEN** 进程重启后恢复同一 frozen revision
- **THEN** 仅从 durable facts 重算 derived readiness，不改变 plan

### Requirement: Parent 与集成 validator 推导完成

Parent/TaskGroup 完成 MUST 由所有 owned descendants 成功和跨任务 integration validators 通过共同推导，不得直接写 completed。

#### Scenario: 子任务全成功但集成失败

- **WHEN** 所有 children succeeded 而 integration validator failed
- **THEN** parent/run 为 failed 或 blocked，不得显示 completed

### Requirement: AFK admission 只消费冻结有效计划

AFK MUST 绑定 exact TaskPlan revision/fingerprint、InteractionPolicy/effective permission、Skill evidence 与 hard-confirmation facts，并在 pre-claim 权威复核。

#### Scenario: recommended-default routine decision

- **WHEN** frozen policy 允许例行调度选择且 PR2 DecisionEvent 完整
- **THEN** admission 可继续

#### Scenario: hard boundary 或证据缺失

- **WHEN** 缺权限、缺证据、policy 漂移或 hard confirmation 未完成
- **THEN** fail-closed blocker 且零 WorkItem claim

### Requirement: subordinate executor 保留 Change ownership

TaskPlan executor MUST 复用现有 Change admission/preparation/verification/cancel/CAS，并不得独立发布 Change terminal state。

#### Scenario: WorkItems 完成

- **WHEN** 所有 WorkItems 和 integration validators 成功
- **THEN** executor 返回成功 outcome，由外层 Change lifecycle 决定 terminal/merge

### Requirement: 稳定可解释 DTO 与操作 API

server MUST 返回 `task-run/v1`，包含 plan identity、admission、ordered waves、attempts、claims、blockers/remediation、invalidation、validators 与 server-authorized operations。

`GET /api/task-runs/:change` MUST 以注册 root 为信任锚返回只读 DTO；`POST /api/task-runs/:change/operations` MUST 只接受 `retry|cancel|resume`、目标 WorkItem（运行级 resume 可省略）、expected run revision/state 和 root，并维持既有 Host、token、content-type、权限与路径校验顺序。

#### Scenario: blocker 查询

- **WHEN** WorkItem 因上游失败、资源、权限或 hard confirmation 阻断
- **THEN** DTO 返回稳定 code、safe detail 与解除方法，不让客户端重算

#### Scenario: 并发操作冲突

- **WHEN** retry/cancel/resume 的 expected identity/state 已过期
- **THEN** 写端点返回 conflict/stale 且不修改 owner state

### Requirement: Dashboard 消费闭环

Dashboard MUST 通过统一 API client 消费 `task-run/v1`，展示 plan identity、admission、执行波次与并行度、attempt、validator、失效链、blocker/remediation 与 server-authorized operations；客户端不得重新推导 readiness、波次或权限。

#### Scenario: 加载空态与失败

- **WHEN** task run 正在加载、不存在、被阻断或请求失败
- **THEN** 视图分别提供稳定 loading、empty、blocked/remediation 与 error/retry 状态，不把缺数据显示成成功

#### Scenario: 中英文与键盘操作

- **WHEN** 用户切换 zh/en 或只用键盘触发允许的 retry/cancel/resume
- **THEN** 所有新增可见文本正确本地化，焦点与 pending/成功/失败反馈可感知，未授权操作保持禁用并解释原因

#### Scenario: 服务端真相更新

- **WHEN** mutation 成功或返回 stale/conflict
- **THEN** Dashboard 重新获取 `task-run/v1`，展示服务端最新 allowed operations 与 blocker，不在本地猜测下一状态
