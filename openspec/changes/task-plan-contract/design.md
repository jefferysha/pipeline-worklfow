# 设计

## Explore 结论

以独立 kernel TaskPlan bounded context 表达稳定 opaque WorkItem ID、TaskGroup 与显式依赖，并提供 Change-lock 下的 immutable revision/current store。`tasks.md` 只作为单向兼容投影；legacy 输入不推导依赖、覆盖、资源、输出或 validators，且不可调度。

治理前置缺陷采用最小安全修复：保留 4096 个目录元数据条目预算、512 MiB 单文件/总量预算、最新 32 个候选、精确 host-session/worktree 绑定与 inode/mtime 防替换，只让合法 transcript 数量预算与既有元数据预算对齐。`max_output_tokens` 仅在 inline tool-program 中是正安全整数字面量时被接受；pragma 继续拒绝，nested result 的完整 Skill 字节与 `exit_code=0` 仍是完成态必要条件。

完整研究、设计和决策见：

- `docs/superpowers/specs/2026-08-03-task-plan-contract-codebase-research.md`
- `docs/superpowers/specs/2026-08-03-task-plan-contract-design.md`
- `docs/adr/2026-08-03-task-plan-contract-explore.md`

## 风险

- 新旧 `tasks.md` 的单一真相源切换可能产生双写漂移。
- 过度严格的覆盖校验可能阻断历史 Change。
- 放宽 transcript 候选计数若弱化其他预算，会扩大冷路径 I/O 或证据混淆风险。

## 已冻结方向

- TaskPlan 与 Change 级 CanonicalTask 分离；store 位于 state 基础设施层。
- requirement/acceptance catalog 显式进入 revision，资源 v1 仅支持精确规范化 key。
- revision ID 在同一 plan lineage 中永不复用；current 与 immutable history 共同构成唯一性边界。
- revision store 的公开上限为单 revision 1,048,577 bytes、目录 256 entries、256 次 revision-like read、累计 16,777,216 bytes；若 target 尚不存在，必须先把它的 entry/read/实际 bytes 加入预算再写 immutable。target 导致越界是 typed conflict，已有历史越界或损坏是 typed corrupt，二者均保持 current 与 target 零进展。
- 逐字节相同的 current 重试仅用于 projection 恢复，不是 lineage 校验旁路；所有 publish 调用必须先验证 committed history，再决定发布或重建投影。
- read-model projection 是无副作用纯转换，不冻结或改写调用方输入；所有稳定排序使用 locale-independent ordinal comparator。
- AFK/互动/授权不进入 WorkItem；后续按 frozen TaskPlan + policy + evidence 求交。
- receipt discovery 与 `max_output_tokens` 行为作为既有 `codex-skill-receipt-current-turn` Modified Capability 登记并补完整 reconcile 回归，门禁和文件身份约束保持不变。
