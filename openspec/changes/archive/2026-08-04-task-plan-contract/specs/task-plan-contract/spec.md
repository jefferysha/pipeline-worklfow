# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 版本化且稳定的 TaskPlan 身份

系统 MUST 提供 `task-plan/v1`、TaskPlanRevision、TaskGroup 与 WorkItem 闭集契约；所有实体 ID 必须由创建方生成并持久化，标题、排序和分组变化不得重算 ID。

#### Scenario: 重排保持身份

- **WHEN** 同一 revision lineage 中的 WorkItem 仅调整标题、顺序或所属展示组
- **THEN** WorkItem ID 保持不变且 codec round-trip 深等价

#### Scenario: 不可信 JSON 的非法或未来契约失败关闭

- **WHEN** 有原始字节上限的不可信 JSON 输入包含未知字段、未来 schema、重复 ID、控制字符或超过预算的数据
- **THEN** decoder 返回有界结构化错误且不生成任何新 ID

#### Scenario: typed object 按 schema 有界快照

- **WHEN** 调用方直接传入 typed JavaScript object，且该对象同时携带大量额外 string、symbol、non-enumerable 属性或未知 accessor
- **THEN** decoder/validator/read-model 只按固定 allow-list 读取 enumerable own data descriptors 与有上限的数组索引，不调用 own-key enumeration，不读取或复制额外属性；schema-owned accessor 或非法已知字段仍失败关闭

#### Scenario: 额外属性需要闭集诊断

- **WHEN** 调用方要求额外属性产生 `unknown_field` 诊断
- **THEN** 调用方必须提交受原始 UTF-8 byte 上限约束的 JSON，系统不得通过枚举任意 typed object 的全部 own keys 来证明闭集

#### Scenario: revision lineage 身份不复用

- **WHEN** 发布的新 revision ID 与同一 plan lineage 的 current 或任一历史 immutable revision 相同
- **THEN** store 拒绝发布且 current pointer 保持不变

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

系统 MUST 在 Change lock 下先验证完整 committed lineage 与有界历史，再发布 immutable revision、原子替换 current pointer；current 是唯一提交点。单个 revision 原始 UTF-8 MUST 不超过 1,048,577 bytes；revision 目录最多枚举 256 个 entry、最多读取 256 个 revision-like 文件，累计读取的 revision 原始 UTF-8 最多 16,777,216 bytes。准备发布的 target 若尚不存在，其一个目录 entry、一次读取和实际原始字节 MUST 在任何写入前计入预算；若同名 target 已存在且内容完全相同，则只按已存在文件计数一次。

#### Scenario: current 发布前中断

- **WHEN** immutable revision 已写入但 current 替换失败
- **THEN** reader 继续返回旧 current，孤儿 revision 不成为当前计划

#### Scenario: projection 失败

- **WHEN** current 已提交但 tasks.md 重建失败
- **THEN** canonical reader 返回新 revision 并报告 projection pending/drift

#### Scenario: target 会越过历史预算

- **WHEN** 现有可信历史仍在预算内，但加入准备发布的 target 后会超过 entry、read 或累计 UTF-8 byte 上限
- **THEN** store 以稳定的 `TaskPlanRevisionConflictError` 拒绝发布，target immutable 不得出现且 current pointer 逐字节不变

#### Scenario: 已有历史损坏或超出预算

- **WHEN** 任一发布调用发现 committed lineage 不连续、revision number 或 ID 重复、文件名与内容不一致，或已有目录超过任一读取预算
- **THEN** store 以 `TaskPlanStateCorruptError` 失败关闭，不发布 target、不替换 current，也不自动重写历史

#### Scenario: 幂等重试仍验证 lineage

- **WHEN** 调用方重发与 current 逐字节相同的 revision 以修复 projection
- **THEN** store 在重建 projection 前仍完整验证 committed lineage 和历史预算；current 自身的 revision ID 不被误判为复用，但任何既有损坏仍失败关闭

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

#### Scenario: projection 不改变调用方输入

- **WHEN** 调用方以仍可编辑的 draft revision 生成只读 DTO
- **THEN** 返回 DTO 被递归冻结，但输入 revision 及其 catalogs、groups、items 与嵌套数组的 descriptor 和 frozen 状态保持不变

#### Scenario: 排序跨 locale 确定

- **WHEN** revision 含混合大小写或非 ASCII 的 ID、path 与 resource key，且在不同默认 ICU locale 的宿主验证
- **THEN** coverage、dependencies、resources 与 issues 使用相同 ordinal 顺序并生成逐字节稳定结果
