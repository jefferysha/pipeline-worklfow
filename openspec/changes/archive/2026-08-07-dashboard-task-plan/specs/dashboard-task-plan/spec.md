# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 完整治理层级可追溯

Dashboard MUST 让用户从 Project -> PipelineRun -> StepVisit -> TaskPlanRevision -> TaskGroup/WorkItem -> SkillInvocation 导航，且上下文和稳定 ID 可见。

#### Scenario: 从 Run 打开 WorkItem

- **WHEN** 用户在 Progress 的 TaskPlan 列表选择 WorkItem
- **THEN** 详情显示 revision/group/item/attempt/step visit 与返回原列表的焦点路径

### Requirement: 计划覆盖、依赖与波次

TaskPlan 视图 MUST 显示 requirement/acceptance 覆盖、显式 depends_on、有界 execution waves、resource conflicts 与 canonical/legacy completeness；不得绘制无界图或在前端重算调度。

#### Scenario: 大型计划

- **WHEN** plan 有 100+ WorkItems
- **THEN** 用户可用筛选列表和有界波次定位缺口/冲突，页面无无界 canvas

#### Scenario: legacy 计划

- **WHEN** API 返回 source=legacy/schedulable=false
- **THEN** UI 明确关系 unknown，不显示伪造依赖或波次

### Requirement: Skill 调用、问题与默认决策

WorkItem 详情 MUST 显示 Skill 输入/输出字段 verdict、artifacts、validators、QuestionEvent 的需要原因/是否展示/响应状态，以及 DecisionEvent 的未提问原因、冻结策略、默认值与理由。

#### Scenario: 推荐默认

- **WHEN** question shown=false 且 decision mode=recommended-default
- **THEN** UI 显示原问题 key、策略来源、采用 option 和理由，不暗示用户回答过

#### Scenario: 隐私边界

- **WHEN** DTO 不含 raw prompt/answer/output
- **THEN** UI 仅展示允许的结构化摘要且不尝试恢复或请求原文

### Requirement: Workflow 策略配置

Workbench MUST 用两个独立 fieldset 配置 decomposition 与 interaction，并显示 current/frozen fingerprint、effective grants 与 drift。

#### Scenario: 正交编辑

- **WHEN** 用户只修改 decomposition
- **THEN** interaction 表单值与提交 payload 保持不变

#### Scenario: 非法或 stale 保存

- **WHEN** server 返回 validation/conflict
- **THEN** draft 保留、错误聚焦并提供 reload/retry，不覆盖较新 definition

### Requirement: AFK admission 与运行操作

AFK MUST 显示 admission、当前 wave、running/waiting/hard-blocked/invalidated、retry/cancel/resume 与 server-authorized operation availability。

#### Scenario: hard blocker

- **WHEN** admission blocker 是缺权限或 hard confirmation
- **THEN** UI 使用明确 hard-blocked 语义、原因和解除方法，不显示为普通等待

#### Scenario: stale 操作

- **WHEN** retry/cancel/resume 返回 conflict/stale
- **THEN** UI 保留状态、刷新并解释需要重新确认当前 run

### Requirement: 完整异步与未知状态

每个新增 read panel MUST 支持 loading、ready、empty、filtered-empty、stale、error、unknown；mutation MUST 支持 idle、submitting、success、validation-error、conflict、failed。

#### Scenario: stale snapshot

- **WHEN** stream 断开但已有缓存
- **THEN** 旧数据保留并显示 stale banner 与 reconnect/retry

#### Scenario: future enum

- **WHEN** API 返回 decoder 可保留的未知状态值
- **THEN** UI 显示 unknown 文本与原安全值，不把它映射成 success

### Requirement: zh/en 与非颜色状态表达

所有新文案 MUST 有 zh/en，并用文字和 icon/shape 表达状态；颜色只作补充。

#### Scenario: 切换语言

- **WHEN** 用户在任意 TaskPlan/AFK/policy 状态切换 zh/en
- **THEN** 可见标签、空错态、blocker 与 remediation 完整切换且状态不丢失

### Requirement: 桌面键盘与布局验收

UI MUST 在 1024、1280、1440、1920px 桌面宽度无 document 横向溢出；所有控件可按逻辑 Tab 顺序访问，关闭详情后焦点回调用行，reduced motion 不丢状态。

#### Scenario: 1024px 键盘路径

- **WHEN** 仅键盘完成过滤、打开 WorkItem、检查 blocker、关闭详情
- **THEN** 焦点始终可见且回到原 WorkItem 行

#### Scenario: 单一浏览器 owner

- **WHEN** 执行真实浏览器验收
- **THEN** 所有 viewport/state/keyboard 检查复用一个项目专用长期 browser owner/session
