# 设计

## Explore 结论

- `build_sha` 的 default 捕获在 `freeze-build-sha` action，Verify 判定在
  `build-head-unchanged` handler；两者由 CLI/server 共用的 `TransitionApplication` 在 canonical
  repository 锁内执行。当前空值通过、能力缺失 skipped 是精确 fail-open 根因。
- AFK 有独立 authoritative branch barrier 与 trusted verifier gate；它不应复用 host state token，
  但其 revision admission failure 必须映射为同一 stable blocker code/remediation。
- server snapshot 与 SSE 已共用 `readinessByTransition`；Dashboard 是严格 decoder，因此应扩展这一
  DTO，而不是在 UI 重算 revision trust。
- 采用 `build:v1:<kind>:<revision_hash>:<repository_hash>:<worktree_hash>` token，仍写入现有
  `build_sha` 字段，不增加 state schema。validated transition head 证明 token 是进入当前 Verify visit
  的唯一 `build_sha` effect，阻断普通 set/backfill/receipt/producer spoof。
- custom Workflow 以 `build_sha` output→input 和 `mark-verification-failed` action 识别 lifecycle，
  不依赖固定 step 名；无 Verify-like input 的 workflow 不适用。

## 稳定契约

- blocker code：`verify-build-revision-untrusted`。
- remediation：`return-to-build-and-capture-current-revision`。
- 只投影闭集 reason、`stateHash`、`revisionHash`；不得出现路径、prompt、credential 或 raw error。
- legacy 裸 SHA / workspace baseline 没有完整归属和 provenance，必须回 Build 真实重建，不提供 backfill。

## 并发与兼容

- actual transition 在 `WorkflowRunRepository.transact()` 锁内 assessment 后 commit，拒绝保持零 mutation。
- snapshot/SSE 若观察到 state digest 竞态，返回 `state-stale`，下一轮收敛。
- 新 token 对旧 runtime 是不可等于 HEAD 的值，因此旧 runtime 安全拒绝 Verify；closed state shape 不变。
- 同一输入重复捕获、assessment、readiness 必须幂等。

## 风险与控制

- token parser 或 identity probe 过宽：canonical grammar、domain-separated hash、physical root tests。
- custom rollback 被误拦：仅含标准 `mark-verification-failed` 的边豁免 success trust guard，并清空 token。
- adapter 漂移：kernel 导出 blocker 常量和 typed DTO，CLI/server/automation/Dashboard contract tests。
- 全矩阵过度重复：以 kernel table tests 为主，每个传输/模式只做代表性 conformance。

完整技术 RFC：`docs/superpowers/specs/2026-08-10-issue-42-trustworthy-build-revision-design.md`。
架构决策：`docs/adr/2026-08-10-issue-42-trustworthy-build-revision-explore.md`。
