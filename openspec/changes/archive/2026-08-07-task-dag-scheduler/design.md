# 设计

## Explore 结论

kernel 纯领域服务根据显式 `depends_on` 与规范化 write claims 推导确定性执行波次；父子分组不参与依赖计算。automation 作为 subordinate TaskPlan executor 复用现有 pre-claim admission、prepared context、验证、取消与 owner CAS；AFK admission 同时检查冻结计划、有效互动策略、证据、授权和 hard confirmation。server 公开 `GET /api/task-runs/:change` 与 `POST /api/task-runs/:change/operations`，Dashboard AFK 视图只消费稳定 DTO 与 server-authorized operations，不在客户端复制调度规则。

完整研究、设计和决策见：

- `docs/superpowers/specs/2026-08-03-task-dag-scheduler-codebase-research.md`
- `docs/superpowers/specs/2026-08-03-task-dag-scheduler-design.md`
- `docs/adr/2026-08-03-task-dag-scheduler-explore.md`

## 风险

- 路径或资源 claim 规范化错误会导致不安全并行。
- 重试与上游失效传播可能形成不可恢复状态。

## 已冻结方向

- Change 保持外层 lifecycle/merge owner，WorkItem 不创建第二套 Change 状态机。
- 合法且可比较的写冲突按稳定 WorkItem ID 序列化；畸形或含糊 claim 阻断。
- recommended-defaults 只处理冻结策略已授权的例行决定；review 和硬边界继续失败关闭。
- Dashboard 覆盖 loading、empty、error、blocked、running、invalidated 与 completed 状态，新增文本接入 zh/en，操作支持键盘与明确的 pending/error 反馈。
