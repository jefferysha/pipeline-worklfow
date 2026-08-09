# Domain Context

## Build revision trust

- **Trustworthy build revision**：由 Tenon 在 Build 出口读取当前真实 revision，并同时绑定当前
  repository、worktree 与 canonical Build→Verify transition provenance 的不可伪造候选；用户填写的
  SHA、ledger 行或 receipt 本身不构成该事实。
- **Build revision token**：保存在兼容字段 `build_sha` 中的 `build:v1` token。token 只包含带域分隔的
  revision、repository、worktree SHA-256，不暴露绝对路径、prompt、credential 或其他原始内容。
- **Revision provenance**：当前 canonical transition head 必须证明同一次进入当前 Verify visit 的
  transition 确实写入了该 token。普通 `tenon set`、backfill、producer 声明或无关 receipt 均不能建立
  provenance。
- **Fail-closed blocker**：无法完整求值、缺失或不可信时统一返回
  `verify-build-revision-untrusted`，并要求回到 Build 重新构建和捕获；不得补写历史证据。
