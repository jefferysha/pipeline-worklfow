# 提案

## Why

当前 Verify 成功路径没有把可信、与当前项目及 worktree 绑定的 build revision 作为不可绕过的前置条件，缺失或错误归属的 revision 可能让验证结论脱离真实构建。该缺陷属于 GitHub #42 的 P0 / Wave 0 基础信任问题，并阻塞后续修复追踪器。

## What Changes

- 将缺失、null、歧义、陈旧或绑定到其他项目/worktree 的 build revision 统一视为 Verify 的 typed hard blocker；旧裸 SHA 不获迁移授权，只能回 Build 重建。
- 让交互式 transition、AFK admission、server/SSE 与 Dashboard 暴露一致的 blocker code 和安全修复含义。
- 保留有效 revision 的既有成功与重试幂等路径，并补齐单元、集成、admission 与负向回归证据。
- 非目标：不通过 ledger 手改、backfill、producer spoof 或无关 receipt 制造 revision；不重定义 #47 将建立的完整修复交互契约；不发布或合并版本。

## Capabilities

### New Capabilities

- `trustworthy-build-revision`：在既有 `build_sha` ABI 中保存绑定 revision/repository/worktree 的 typed token，并由当前 canonical transition provenance 为 Verify 及所有投影面提供统一信任判定。

### Modified Capabilities

- `workspace-verification-integrity`：Build baseline 从裸 SHA/fingerprint 升级为隐私安全 token，保留 in-place 内容指纹语义。
- `workflow-definition`：default 与 arbitrary-step custom Workflow 通过同一 `build_sha` output/input 生命周期不变量保护 Verify-like success。

## Impact

涉及 kernel token/guard/action/transition-readiness、CLI transition 与 Review candidate、automation verifier admission/settlement、server HTTP/snapshot/SSE、Dashboard Progress/AFK 展示，以及受控 bundle、contract/spec 与测试同步。公共扩展固定为 `verify-build-revision-untrusted`；不新增依赖或 state 字段。transition 在现有 repository 锁内以 validated head 证明 provenance，snapshot 竞态时返回 `state-stale` 而非 ready。

## Triage

- 分类：defect。
- 影响与紧急度：P0 信任边界；未绑定真实构建也可能接受 Verify，目标接受数为 0。
- 验收信号：#42 的 Acceptance criteria、Measurement and observability 及 Required cross-mode conformance 全部有可复现证据。
- 所有权：本 Change、分支 `codex/issue-42-trustworthy-build-revision`、独立 worktree。
- 关联：父 roadmap #41；无前置 blocker；是 #47 的语义 blocker。
