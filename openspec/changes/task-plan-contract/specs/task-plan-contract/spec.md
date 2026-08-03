# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 版本化且稳定的 TaskPlan 身份

系统 MUST 提供 `task-plan/v1`、TaskPlanRevision、TaskGroup 与 WorkItem 闭集契约；所有实体 ID 必须由创建方生成并持久化，标题、排序和分组变化不得重算 ID。

#### Scenario: 重排保持身份

- **WHEN** 同一 revision lineage 中的 WorkItem 仅调整标题、顺序或所属展示组
- **THEN** WorkItem ID 保持不变且 codec round-trip 深等价

#### Scenario: 非法或未来契约失败关闭

- **WHEN** 输入包含未知字段、未来 schema、重复 ID、控制字符或超过预算的数据
- **THEN** decoder 返回有界结构化错误且不生成任何新 ID

### Requirement: 显式覆盖、归属与依赖

系统 MUST 以显式 requirement/acceptance catalog 为全集，并校验 WorkItem 引用、唯一归属、组树与精确 `depends_on`。

#### Scenario: 完整覆盖通过

- **WHEN** catalog 的每个 requirement 和 acceptance 均被至少一个 WorkItem 的有效 ref 覆盖
- **THEN** 覆盖摘要为 complete 并列出确定性映射

#### Scenario: 缺口与循环被拒绝

- **WHEN** 存在未覆盖 catalog、未知 ref、重复归属、组环、自依赖、缺失依赖或 WorkItem 环
- **THEN** validator 返回稳定排序 issue 且 revision 不可冻结

### Requirement: 分组不产生执行依赖

TaskGroup MUST 仅表达展示与所有权树，不得隐式创建 WorkItem 依赖。

#### Scenario: 同组项目可并行

- **WHEN** 两个同组 WorkItem 没有显式 depends_on 且资源不冲突
- **THEN** read model 不产生二者之间的依赖边

### Requirement: 资源、输出与 validators

WorkItem MUST 声明闭集的 read/write resource claims、expected outputs 与 allow-listed versioned validators；不得携带任意 shell 命令。

#### Scenario: 无序写冲突

- **WHEN** 两个不可达 WorkItem 对同一规范化资源声明 write
- **THEN** validator 返回 resource-write-conflict

#### Scenario: 有序写入可序列化

- **WHEN** 两个 writer 由显式依赖确定先后
- **THEN** validator 标记 serialized 而非冲突

### Requirement: 原子 revision store

系统 MUST 在 Change lock 下先发布 immutable revision，再原子替换 current pointer；current 是唯一提交点。

#### Scenario: current 发布前中断

- **WHEN** immutable revision 已写入但 current 替换失败
- **THEN** reader 继续返回旧 current，孤儿 revision 不成为当前计划

#### Scenario: projection 失败

- **WHEN** current 已提交但 tasks.md 重建失败
- **THEN** canonical reader 返回新 revision 并报告 projection pending/drift

### Requirement: legacy tasks.md 不伪造语义

没有 canonical current 时，系统 MUST 仅保留 legacy 阶段、文本、完成态和顺序，并将不可证明字段标为 unknown，`schedulable=false`。

#### Scenario: legacy 读取

- **WHEN** 仓库只有 tasks.md checkbox
- **THEN** 依赖、覆盖、资源、输出和 validators 保持空/unknown，后续证据与 AFK 不得绑定其 display ID

### Requirement: 稳定只读 DTO 与 API

kernel MUST 导出 `TaskPlanReadModelV1`，server MUST 提供受信 root/change 解析的只读端点，且不得暴露 canonical 绝对路径。

#### Scenario: Dashboard 消费

- **WHEN** 客户端请求存在的 canonical plan
- **THEN** 返回版本、revision、validation/completeness、groups/items、coverage、dependency/resource diagnostics 和 projection status

### Requirement: 长生命周期 receipt discovery

Codex adapter MUST 在 4096 metadata-entry 预算内发现超过 128 个合法 transcript 后的精确 host-session evidence，同时保留最新 32 全文候选、字节预算和全部身份/ABI 检查。

#### Scenario: 129 个历史 transcript

- **WHEN** 精确当前 session Skill read 位于 129 个合法历史 transcript 之后
- **THEN** 完整 reconcile 只追加该当前 phase 的 `CodexSkillRead`

#### Scenario: 证据不完整或错绑

- **WHEN** output 不完整、session/turn/worktree/ABI 不匹配或文件读取中被替换
- **THEN** 不产生完成态证据且 document gate 继续拒绝
