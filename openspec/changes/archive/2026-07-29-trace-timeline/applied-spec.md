# 已应用规格

## 变更摘要

2026-07-29 在 Ship 的唯一真实应用边界，将已通过第三轮冻结验证的 Trace Timeline delta 应用为
新的主规格。目标此前不存在，因此本次结果为 `changed`；未覆盖或改写其他 capability。

## 已应用需求

- source：`openspec/changes/trace-timeline/specs/trace-timeline/spec.md`
  - SHA-256：`9121c3d5acbccfdcdc39ef950c1e9049b12e635efc1677e9d41fc4d728f20014`
- target：`openspec/specs/trace-timeline/spec.md`
  - before：`missing`
  - after SHA-256：`e98d29da83f104399375dbd8cffb6b4843041f7c1816de68db4fae9f9ac143d1`
  - result：`changed`
- effects：新增 6 条 requirement，覆盖有界 TraceStore 窗口、metadata-only server API、诚实
  outcome/usage、HTTP 错误语义、Dashboard 筛选时间线，以及状态/i18n/键盘交互。
- conflicts：无。目标 capability 首次创建；delta 未包含修改、删除或重命名操作。

## 交付证据

- `openspec validate trace-timeline --type spec --strict --no-interactive`：PASS。
- Verify 仓外演练已证明 archive 后同一主规格 strict validation 通过；真实应用只发生于本 Ship。
- 重复应用判定：目标 requirement/scenario identity 与 delta 一致时保持 byte-preserving no-op，
  不重复追加。
