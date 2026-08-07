# 设计

## Explore 结论

拆分与互动策略作为两个顶层、版本化、闭集配置进入 Workflow IR；新 Run 以 V3 snapshot 和新版 fingerprint 冻结。有效权限按动作取平台安全、Skill contract、项目/track、Workflow ceiling 与精确 Run grant 的交集；任一层缺失或漂移均拒绝。AFK 只是执行方式，不能扩大授权。Dashboard 只通过完整 definition API 编辑同一共享契约。

完整研究、设计和决策见：

- `docs/superpowers/specs/2026-08-03-workflow-decomposition-policy-codebase-research.md`
- `docs/superpowers/specs/2026-08-03-workflow-decomposition-policy-design.md`
- `docs/adr/2026-08-03-workflow-decomposition-policy-explore.md`

## 风险

- 新字段改变 workflow fingerprint，需要保持旧定义兼容。
- auto-safe 不能被误解为授权创建外部 PR、分支或生产副作用。
- Dashboard 非法写入不得留下半发布定义或覆盖当前合法配置。

## 已冻结方向

- 顶层 `decomposition` 与 `interaction` 保持正交，legacy 缺省为 `off + interactive`。
- 复用现有完整 Workflow definition POST 的 compiler/lock/atomic publication 安全边界。
- continuous 仅作为精确 session grant，不能升级 frozen ceiling，也不能替代 AFK admission。
- Dashboard 编辑器整份提交 Workflow definition，让 shared compiler、registry lock 与 atomic publication 保持唯一写入边界。
- v1 strategy 固定为 `balanced|breadth-first|depth-first`；auto_when 固定为 `independent-work-items|cross-component-boundary|context-budget-risk`；ask_when 固定为 `ambiguous-requirements|hard-boundary|missing-authorization|limit-exceeded`；limits 为 max_items 1..32、max_depth 0..4。
- stable bootstrap/cache-root 产品修复归属前序 PR2；PR3 只整合该基线并用正式 stable runtime 取得自身治理证据，不重复源码、测试或 capability delta。
