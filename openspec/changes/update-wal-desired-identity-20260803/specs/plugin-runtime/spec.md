# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Managed release SHALL 以可对账 WAL 串联宿主与 runtime

setup/update SHALL 在同一逐 scope 跨进程锁和 durable WAL 内串联宿主 mutation、候选解析、runtime 激活、Dashboard readiness 与 convergence evidence。宿主步骤的恢复 SHALL 依据 before inventory 与 desired postcondition 对账，而不是依据外部命令是否曾返回。旧版 pending WAL 若缺少足以证明 before/desired 的数据，SHALL 返回 indeterminate，MUST NOT 自动重放。native host desired 中用于证明 marketplace identity 的字段 SHALL 只包含稳定身份语义；若历史 desired 仅在嵌套 marketplace HEAD observation 上与重试 desired 不同，而 marketplace root/source/sourceType 及真正目标 HEAD、plugin root、plugin version 全部相同，系统 SHALL 将二者视为同一目标。任何非法 schema、未知键或真正身份/目标字段变化 SHALL 继续 fail closed。

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
