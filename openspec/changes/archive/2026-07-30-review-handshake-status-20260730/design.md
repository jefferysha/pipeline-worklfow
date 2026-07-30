# 设计

## Explore 结论

- Server 从 canonical receipt 与冻结 workflow plan 生成
  `not-requested | pending(event, requestedAt) | approved(event, requestedAt, acknowledgedAt)`。
- 状态进入现有 Change snapshot；HTTP/SSE 同源，不新增写端点或第二套轮询。
- Dashboard 在滚动升级期允许字段缺失并显示 unavailable；字段存在时严格解码，禁止从 raw
  `review_gate_*` 回退。
- 状态卡位于 Progress Drawer 当前阶段区、transition actions 之后；不进入 WorkflowCanvas、
  Toolbar 或已退役 Inbox。
- UI 只读，且不得因 receipt 未请求/待确认而禁用现有 Dashboard transition。

## 风险

- 直接暴露 `.pipeline.yaml` 字段会让客户端复制状态机逻辑或泄露无关审计信息。
- 多出口 Verify 必须保留 exact event，不能把 `verify-pass` 与 `verify-fail` 合并成模糊“已确认”。
- 历史 Change 可能没有完整 receipt 字段，必须以稳定的空态兼容。

## 契约边界

- 全空 receipt 才是 `not-requested`；非法半组、phase 漂移、非 review gate 或不可达 event 必须
  fail-loud。
- pending/approved 必须保留 exact event；approved 还必须保留 acknowledged time。
- 缺失可选字段只表示旧 runtime unavailable，不等同未请求。
- 不新增 capability、持久化字段、endpoint、authority、确认弹窗或第二套过期策略。

完整方案、上游固定证据、状态矩阵和 Grill 记录见
`docs/superpowers/specs/2026-07-30-review-handshake-status-design.md` 与
`docs/adr/2026-07-30-review-handshake-status-explore.md`。
