# ADR：在现有 build_sha 中保存归属绑定 token

## 背景

Verify 的现有 barrier 对空 revision 或能力缺失会跳过，并且裸 Git SHA / workspace fingerprint 无法证明
project、worktree 或当前 Build visit provenance。Issue #42 要求所有入口失败关闭，同时保持 state ABI、
custom Workflow、AFK 与 Dashboard 一致。

## 决策

保留 `build_sha` 字段和 `build-head-unchanged` guard 名称，但把字段值升级为
`build:v1:<kind>:<revision_hash>:<repository_hash>:<worktree_hash>`。Build action 必须通过受信 capability
捕获 token；Verify 既重算三个 hash，也通过 validated canonical transition head 证明 token 是进入当前
Verify visit 的 transition effect。

普通 custom Workflow 按 `build_sha` output→input 自动继承 capture action；带 `build_sha` input 的
step，其非 `mark-verification-failed` 出口自动继承 trust guard。所有失败面使用
`verify-build-revision-untrusted` 与 `return-to-build-and-capture-current-revision`。

## 备选方案

- 只把 `skipped` 改为 failed：不能证明 project/worktree/provenance，拒绝。
- 新增 state 字段或可变 sidecar：扩大 closed schema、N-1 和原子提交风险，拒绝。
- 仅靠 TransitionRecord 中的裸 `build_sha` effect：能挡普通 set，但复制 Change 或同 commit 的其他
  worktree 仍可冒充，拒绝。

## 后果

- 新 state 不增加字段，旧 reader 遇 token 会安全拒绝 Verify，而不是误通过或损坏 canonical state。
- 旧裸 SHA/旧 workspace baseline 必须回 Build 重建，不能 backfill。
- kernel 增加一个 revision trust 值对象/assessment seam；CLI、server、automation 和 Dashboard 只做
  capability 装配或投影，不复制判定。
- path 只参与本地 domain-separated hash，不进入 API、SSE、日志或 UI。
- custom Workflow 以字段语义而非固定 step 名获得保护；明确失败回退仍可恢复。

