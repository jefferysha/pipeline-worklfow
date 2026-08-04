# 已应用规格

## 变更摘要

将本 Change 的 `skill-invocation-evidence` delta 唯一应用到新建主规格，固定所有 Skill 的 canonical invocation 身份、状态机、Question/Decision、ArtifactBinding、隐私只读投影与失败关闭语义。

## 已应用需求

- source: `openspec/changes/task-planner-evidence/specs/skill-invocation-evidence/spec.md`
- target: `openspec/specs/skill-invocation-evidence/spec.md`
- result: `changed`
- requirements: added 8, modified 0, removed 0, renamed 0
- before digest: `absent`
- after digest: `sha256:4432dfe5c25a6b5e93aeb426b0340929733323e3df6608af538c98f781e47cc8`

## 交付证据

- 日期：2026-08-04
- Verify 隔离副本的官方 archive/apply 演练为 38 passed、0 failed。
- Ship 在真实工作区执行一次应用；主规格此前不存在，因此本次结果为 `changed`。
- 重跑约束：目标 requirement/scenario 已存在且字节一致时必须返回 `no-op`，不得重复追加。
