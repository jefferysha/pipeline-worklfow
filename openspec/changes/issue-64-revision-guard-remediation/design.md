# 设计

## 初始假设

- 需求归类：P0 defect / serial gate；上游为 roadmap #41、原问题 #42、remediation #64。
- 起点固定为 `d58df7a0ecbb155d54d81e782150bf68567cb617` 上的候选 `f508fab726c62c10d4312fdd7d29f513d774dc66`，新分支为 `codex/issue-64-revision-guard-remediation`。
- 修复应继续以 kernel 的 effective lifecycle 为单一真相；CLI/server/automation/dashboard adapter 不复制 revision 业务规则。
- rollback 的识别依据应是 `mark-verification-failed` 的 effective action 语义，而不是硬编码 step/event 名称；Explore 将验证 step、edge、fixed 与 semantic guard 的去除边界。
- 实现由且仅由一个 `luna_worker` 执行；根代理冻结范围、审查、判级、验收、Review、PR 与 CI。

## 风险

- 过度过滤 `build-head-unchanged` 可能误放 Verify success 出口；必须按 edge 的 effective rollback 语义过滤，而不是按 step 全局删除。
- `check` 没有用户选择的 event；多出口 custom step 必须评估所有需要 fail-closed 的非 rollback 出口，同时不能让 rollback 出口制造假阻断或重复 assessor 调用。
- 两个 fixture 的修订若只改期望码，可能掩盖 review-request/transition 的 mutation；必须继续断言 canonical state/history 不变。
- verification report 的 ledger 登记依赖当前 host/phase receipt；禁止 backfill、旧 receipt 或 producer spoof。
- #64 Review hard cap 为 2；E2E 不计 Review，稳定候选只运行一次完整门。

## Explore 结论

- 采用 edge-aware effective lifecycle：按单条 compiled edge 合并 declared、fixed 与 semantic guards/actions；effective actions 含 `mark-verification-failed` 时只移除等价的 `build-head-unchanged`，保留其他 guard。
- actual transition 与 readiness 共用同一 kernel helper。plain custom `check` 只补齐非 rollback 出口的 revision invariant 并去重求值；custom review request 把已有 exact event 传入内部 check。
- TransitionApplication/RunRepository 继续独占 mutation；readiness/check 保持纯评估。冻结 plan、canonical schema、typed blocker DTO、隐私 hash、无 `build_sha` workflow 与非 revision edge-guard 预览语义均不改变。
- server snapshot/SSE 与 Dashboard 通过 success blocked/rollback ready 成对测试证明共享投影；Automation 保留 authoritative barrier 负例。只有测试发现旁路才修改 adapter 生产代码。
- 定向 Build readiness 依次覆盖 kernel lifecycle、CLI check/review、两处旧 fixture、server/automation/dashboard 与受控 bundle freshness；稳定候选只跑一次完整门。
- 因旧 #42 Change 永久保留为失败审计且不得作为可变交付对象，#64 自身的三个 delta spec 承接 #42 尚未 apply 的完整 durable requirements，并追加本次 edge-aware remediation；归档只作用于 #64。

完整取舍和风险边界见 `docs/superpowers/specs/2026-08-10-issue-64-revision-guard-remediation-design.md` 与 `docs/adr/2026-08-10-issue-64-revision-guard-remediation-explore.md`。
