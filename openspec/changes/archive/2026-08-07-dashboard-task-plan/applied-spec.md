# 已应用规格

## 变更摘要

2026-08-07 在 Ship 阶段将 `dashboard-task-plan` 的唯一 delta 应用到新建的持久 main spec。
目标此前不存在，因此本次结果为 `changed`；未覆盖或修改任何无关 capability。

## 已应用需求

- source：`openspec/changes/dashboard-task-plan/specs/dashboard-task-plan/spec.md`
  - SHA-256：`ffad455995eb5adf5c64cc892cee242605da2905cb3149dc4d80b18634d03b2d`
- target：`openspec/specs/dashboard-task-plan/spec.md`
  - before：`missing`
  - after SHA-256：`0ceb8762d78ba91a3eb580dcf665ef75868367d0d949219b2fb11263b48306b6`
  - result：`changed`
- effects：新增 8 个 durable requirements，覆盖治理层级、覆盖/依赖/波次、Skill/Question/Decision、
  Workflow policy、AFK admission/operations、异步/未知状态、zh/en 与桌面键盘/布局验收。
- conflict resolution：无；目标 capability 不存在，没有可冲突的既有 requirement 或 scenario。

## 交付证据

- Verify 隔离副本演练：8 added，`openspec validate --all --strict` 为 42 passed、0 failed；
  真实主规格在 Verify 中保持未写入。
- Ship 真实应用后：`openspec change validate dashboard-task-plan --strict` 与
  `openspec spec validate dashboard-task-plan --strict` 均通过；`openspec validate --all --strict`
  为 43 passed、0 failed。
- 幂等复核：按同一 source/target requirement 与 scenario 身份再次比较，main spec 已完整包含全部
  delta，重复应用结果为 `no-op`，target bytes 和 after digest 保持不变。
