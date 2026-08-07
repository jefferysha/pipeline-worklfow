# 已应用规格

## 变更摘要

2026-08-07 在 Ship phase 将 `task-dag-scheduler` 的已验证增量规格应用为新的持久主规格。
该 capability 此前不存在主规格，因此结果为 `changed`；没有修改或复制 `task-plan-contract` 等无关主规格。

## 已应用需求

- source delta: `openspec/changes/task-dag-scheduler/specs/task-dag-scheduler/spec.md`
- target main spec: `openspec/specs/task-dag-scheduler/spec.md`
- source digest: `f9c42b7418f562d8fc7f6f9ef0faec63672a66021898e438fe3972d0e4af4d8e`
- before digest: `absent`
- after digest: `ca6c47d5f2dc225966339c6fe6a4d83f8f149cd8b4be547bf9dc1b6d150f4c55`
- result: `changed`
- effects: 新增确定性 wave 编译、失败/失效传播、durable operation、AFK admission、
  subordinate executor、`task-run/v1` API 与 Dashboard 消费闭环的 9 项 durable requirements。
- conflict resolution: 无；目标 capability 在应用前不存在，delta 全部为 `ADDED Requirements`。

## 交付证据

- `openspec validate task-dag-scheduler --type change --strict`: PASS
- `openspec validate --all --strict`: PASS，42 passed / 0 failed
- Verify 报告: `docs/superpowers/reports/2026-08-07-task-dag-scheduler-verify.md`
- 应用方式: 主线程逐项比对 requirement/scenario identity 后创建主规格；重复执行时若 digest 已为
  `ca6c47d5f2dc225966339c6fe6a4d83f8f149cd8b4be547bf9dc1b6d150f4c55`，必须保持 byte-preserving no-op。
