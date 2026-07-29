# 设计

## 初始假设

已验证：`DocumentRecord` 保存 producer、recordedAt 与 digest-bound reads；server 现有 snapshot 仅丢失这些字段。选择在现有 evidence item 增加可选时间线字段，经 snapshot 和前端 decoder 逐层映射；仅 current digest/current visit 的读取可显示为 readAt。

## 风险

- 时间线不得把未通过 digest 校验的旧回执误呈现为当前证据。
- Dashboard 不能泄漏宿主绝对路径或不必要的 ledger 内部字段。
- 新增 snapshot 字段必须经 decoder 验证，并在空回执、失败和加载状态下保持可用。

## 待验证问题

- 以 `docs/superpowers/specs/2026-07-29-document-evidence-timeline-design.md` 的最小 DTO 和兼容策略进入 Spec。
