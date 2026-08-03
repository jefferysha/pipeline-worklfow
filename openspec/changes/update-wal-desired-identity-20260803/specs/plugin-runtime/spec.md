# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Managed release SHALL 以可对账 WAL 串联宿主与 runtime

setup/update SHALL 在同一逐 scope 跨进程锁和 durable WAL 内串联宿主 mutation、候选解析、runtime 激活、Dashboard readiness 与 convergence evidence。宿主步骤的恢复 SHALL 依据 before inventory 与 desired postcondition 对账，而不是依据外部命令是否曾返回。旧版 pending WAL 若缺少足以证明 before/desired 的数据，SHALL 返回 indeterminate，MUST NOT 自动重放。native host desired 中用于证明 marketplace identity 的字段 SHALL 只包含稳定身份语义；若历史 desired 仅在嵌套 marketplace HEAD observation 上与重试 desired 不同，而 marketplace root/source/sourceType 及真正目标 HEAD、plugin root、plugin version 全部相同，系统 SHALL 将二者视为同一目标。任何非法 schema、未知键或真正身份/目标字段变化 SHALL 继续 fail closed。

#### Scenario: 进程在宿主 mutation 返回后崩溃

- **GIVEN** WAL 已持久化步骤的 before inventory 与 desired postcondition
- **WHEN** 恢复观察到 desired state 已成立
- **THEN** 步骤被补记为 completed
- **AND** 后续候选解析从当前权威 inventory 继续
- **AND** 宿主 mutation 命令不再执行。

#### Scenario: 旧 WAL 无法证明安全重试

- **WHEN** pending host step 只有 `started` 而没有 before/desired 对账数据
- **THEN** runtime 返回可诊断的 indeterminate
- **AND** 不改变宿主 inventory、active release、launcher 或 Dashboard。

#### Scenario: Marketplace 已达到旧 WAL 的同一目标

- **GIVEN** pending WAL 记录 marketplace identity 的旧 observation HEAD 和目标 HEAD B
- **AND** 重试 desired 的目标仍为 B，root/source/sourceType 均未变化
- **WHEN** 权威 inventory 已位于 B
- **THEN** 系统补记该宿主步骤 completed
- **AND** 不再次执行 marketplace mutation。

#### Scenario: 真正目标或身份发生变化

- **GIVEN** pending WAL 与重试 desired 的目标 HEAD、plugin version、plugin root、marketplace root/source/sourceType 任一不同
- **WHEN** 系统尝试恢复事务
- **THEN** 返回 indeterminate 并保留 WAL
- **AND** 不执行宿主 mutation 或 runtime 激活。

#### Scenario: 嵌套 marketplace HEAD 非 canonical

- **GIVEN** pending 或 completed WAL 的嵌套 marketplace HEAD 既不是 `null`，也不是 40 位小写 Git OID
- **WHEN** 系统解析 native desired identity
- **THEN** 将该 desired 判为非法且不等价
- **AND** 不执行宿主 mutation 或 runtime 激活。

#### Scenario: 真实 native 接线跨进程恢复

- **GIVEN** durable WAL 保存旧 observation HEAD，重启后的 native desired 保持同一目标与稳定身份
- **AND** 当前权威 inventory 已满足目标
- **WHEN** `desiredNativeHostPostcondition` 经 `runManagedHostCommand` 注入通用 managed host runner 并恢复事务
- **THEN** pending 与 completed 两种 checkpoint 都完成且 mutation 执行次数为零
- **AND** 移除 comparator forwarding 时该回归测试失败。
