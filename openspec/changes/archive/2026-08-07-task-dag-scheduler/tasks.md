# 任务

## 立项

- [x] 确认 DAG 调度、资源冲突、AFK admission 与状态传播范围。

## 调研

- [x] 调研 AFK admission、runner lifecycle、CAS 与取消恢复语义。 (explore)

## 规格

- [x] 冻结波次、状态传播、AFK admission、操作、blocker DTO 与外层所有权。 (spec)

## 实现

- [x] 以 tracer bullet 打通 DAG compiler、subordinate executor 与 task-run API。 (build)
- [x] 实现资源序列化、失败/重试失效传播和 parent/integration 完成推导。 (build)
- [x] 实现 AFK authoritative admission、attempt journal 与 retry/cancel/resume。 (build)
- [x] 完成 Dashboard task-run/v1 消费闭环、zh/en、loading/empty/error/blocked 状态与键盘操作。 (build)

## 验证

- [x] 验证环、冲突、稳定波次、失败/失效、parent validators 与公平性。 (verify)
- [x] 验证 AFK/default evidence、hard blockers、并发操作、取消和恢复。 (verify)
- [x] 验证 client/server DTO、i18n、状态组件与真实桌面浏览器 retry/cancel/resume 路径。 (verify)

## 交付

- [x] 更新运行时契约并创建 base=main 的独立非草稿 PR #36；CI run 31213931358 全绿。 (ship)

## 归档

- [x] 归档 Change 并记录调度兼容结论；主规格 digest 与 applied-spec receipt 一致且无活跃子 Change。 (archive)
