# 已应用规格

## 变更摘要

在 Ship 唯一真实应用边界，将经 Verify 通过的 `canonical-state-version-status` delta
持久应用为新的主规格。目标此前不存在，因此本次结果为 `changed`；未覆盖或拼接任何无关主规格。

## 已应用需求

- Source delta:
  `openspec/changes/canonical-state-version-status-20260730/specs/canonical-state-version-status/spec.md`
- Target:
  `openspec/specs/canonical-state-version-status/spec.md`
- Before digest: `absent`
- After digest: `sha256:79d109346bcf7ee270e9b0d6a07698914887af87d77eeade7c675b1c0fc20636`
- Result: `changed`
- Applied: 4 个 `ADDED` requirements，覆盖 kernel future-version typed fail-closed、Server
  bounded compatibility projection、Dashboard 双语升级后刷新路径和真实边界/浏览器验证。
- Conflict resolution: 无；目标主规格此前不存在。重新执行时以 requirement/scenario identity
  对比当前主规格，结果必须保持 `no-op`，不得重复追加。

## 交付证据

- Applied at: 2026-07-30
- Frozen build SHA:
  `7d96ac84af1196c1059e633c84c6937b47c6cddf`
- Delta digest:
  `sha256:e4e3f6ca680b7fe7d5fb931e750acb92f8287c3c49dc788f34755d01980c8192`
- Main spec strict validation:
  `npx openspec validate canonical-state-version-status --strict` → PASS
- Verification report:
  `docs/superpowers/reports/2026-07-30-canonical-state-version-status-20260730-verify.md`
