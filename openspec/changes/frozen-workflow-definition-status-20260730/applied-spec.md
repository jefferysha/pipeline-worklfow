# Applied Spec Receipt

> Change：`frozen-workflow-definition-status-20260730`
> 应用日期：`2026-07-30`
> Producer：`openspec-apply-change`

## 应用结果

| Delta | Main spec | Before SHA-256 | After SHA-256 | Result |
| --- | --- | --- | --- | --- |
| `openspec/changes/frozen-workflow-definition-status-20260730/specs/frozen-workflow-definition-status/spec.md` | `openspec/specs/frozen-workflow-definition-status/spec.md` | `missing` | `de9460a96480cf6bc4388e6e27a1f38c9e45a99bbeb9713d2b33572fdb0724d7` | `changed` |
| `openspec/changes/frozen-workflow-definition-status-20260730/specs/orchestration-graph/spec.md` | `openspec/specs/orchestration-graph/spec.md` | `missing` | `02c85d0651875be8169d3f53832ea320044f40d7de2b5acca776bb8c4345226b` | `changed` |

## 来源校验

- `frozen-workflow-definition-status` delta SHA-256：
  `3ac378d642517036ccd087688131de53770e60d7c2ab423bfe76c750a7e43338`
- `orchestration-graph` delta SHA-256：
  `f684090f6d7ec354995df53f6989eede01744a4adc9b4123353b04daac59f138`

## 效果

- 新增 frozen/current workflow definition 的持久诊断规格，明确诊断不得改变冻结执行语义。
- 新增只读编排图契约、Dashboard 交互、中英文、无障碍、错误语义、资源预算和回滚边界。
- 两个目标在应用前均不存在，没有与既有 requirement 或 scenario 发生冲突。
- `npx openspec validate frozen-workflow-definition-status --strict` 与
  `npx openspec validate orchestration-graph --strict` 均通过。
- 重复应用时若目标 digest 保持上述值，应判定为 `no-op`，不得重复追加 requirement。
