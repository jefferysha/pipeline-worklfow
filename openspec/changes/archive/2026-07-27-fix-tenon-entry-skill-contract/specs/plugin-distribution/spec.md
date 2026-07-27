# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 原生安装 SHALL 暴露唯一且可调用的根入口 Skill

每个原生 Tenon 候选 SHALL 从产品身份真相源读取根入口 Skill id，并在激活前证明
`skills/<entrySkill>/SKILL.md` 存在、frontmatter 名称匹配且完整 Codex 引用等于
`<plugin>:<entrySkill>`。Doctor、安装器、静态 adapter 和发布检查 SHALL 消费同一身份投影，
不得各自维护入口字符串。

#### Scenario: 新用户完成 Codex 安装

- **WHEN** `tenon setup --codex` 激活一个已验证候选
- **THEN** Selected Skill Root 包含产品身份声明的根入口
- **AND** `tenon doctor` 不报告入口缺失
- **AND** 项目目录不创建第二份同名 Skill 投影。

#### Scenario: 候选缺少根入口

- **WHEN** 候选缺失根入口文件或 frontmatter 名称与产品身份不一致
- **THEN** 候选验证和发布检查失败
- **AND** 既有 active release、launcher 与 Dashboard 保持不变。

### Requirement: 宿主插件登记 SHALL 在 Skill 执行前收敛为唯一工作流身份

原生 setup/update SHALL 以宿主插件 inventory 为登记权威。若宿主仍启用一个会与 Tenon 注册同类
Skill/hook 的冲突工作流插件，诊断 SHALL fail closed，并只通过宿主官方插件管理器完成卸载或
禁用；Tenon SHALL NOT 直接删除或改写宿主私有 cache。收敛完成后必须要求新宿主会话加载新的
Skill/hook 集合。

#### Scenario: 已卸载插件的 hook 仍会参与新会话

- **GIVEN** 宿主 inventory 或配置仍启用一个冲突工作流插件身份
- **WHEN** 用户运行 setup 或 doctor
- **THEN** 结果明确指出冲突的宿主登记而不是把它误报为 Tenon Skill 缺失
- **AND** 修复动作使用宿主插件管理命令
- **AND** 不直接操作 cache 内容。

#### Scenario: 宿主 inventory 已唯一

- **WHEN** 只有 `tenon@tenon` 负责 Tenon 的 Skill 与 hook
- **THEN** setup 可继续验证并发布 managed runtime
- **AND** 新会话只加载当前 Tenon 的入口和阶段 Skill。

### Requirement: 宿主 mutation SHALL 通过期望状态对账恢复

原生 setup/update 的每个宿主 mutation 步骤 SHALL 在执行外部命令前，向 durable WAL 写入规范化
before inventory、desired postcondition 与 replay policy。恢复 SHALL 先读取宿主权威 inventory：
已满足 desired 时 SHALL 只补提交步骤；仍精确等于 before 时 MAY 执行命令；任何第三状态 SHALL
fail closed。系统 MUST NOT 仅因步骤处于 `started` 就盲目重放非幂等命令。

#### Scenario: 命令成功后 completed journal 写入失败

- **GIVEN** 宿主命令已经把 inventory 变成 desired state
- **AND** 进程在持久化 completed checkpoint 前终止
- **WHEN** 相同 setup/update 事务恢复
- **THEN** 系统重新观察 inventory 并直接提交该步骤
- **AND** 不再次调用宿主 mutation 命令。

#### Scenario: 恢复时观察到第三状态

- **GIVEN** WAL 记录 before A 与 desired B
- **WHEN** 权威 inventory 为既非 A 也不满足 B 的状态 C
- **THEN** 事务返回 indeterminate 并保留诊断证据
- **AND** 不执行 mutation、runtime 激活或补偿猜测。

### Requirement: Requirements-changed SHALL 允许 Spec 诚实更新 ADR

当 Build 或 Verify 发现已批准的架构语义需要变化并通过 `requirements-changed` 回到 Spec 时，
document contract SHALL 允许当前 `tenon-spec` 在实际 Skill 证据下重新登记 proposal、OpenSpec
design、tasks、Superpowers design 与 ADR 的新 digest。旧 producer 与旧 read receipt SHALL 保留
在 append-only history，但 MUST NOT 被当作新 digest 的证据。更新后所有后续 phase SHALL 重新读取
精确版本。

#### Scenario: Verify 发现新的事务不变量

- **GIVEN** Change 已有 Explore 阶段登记的 ADR
- **WHEN** `requirements-changed` 回到 Spec 并修订 ADR
- **THEN** `tenon-spec` 可用当前 phase 的真实 Skill evidence 重登记该 ADR
- **AND** 旧摘要的 read receipts 不再满足后续 phase
- **AND** 未调用 `tenon-spec`、使用 `--backfill` 或手改 ledger 均被拒绝。
