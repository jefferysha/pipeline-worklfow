# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Frozen baselines SHALL be encoded as bound revision tokens

`build_sha` MUST 保留为兼容字段名，但新 Build MUST 保存 `build:v1` token，而不是裸 Git SHA 或裸
`workspace:sha256`。token MUST 在不暴露物理路径的情况下绑定 baseline、repository 与 worktree。

#### Scenario: Legacy bare baseline reaches Verify

- **WHEN** `build_sha` 是旧裸 Git SHA 或旧裸 workspace baseline
- **THEN** 新 runtime 将其视为 `malformed` untrusted revision
- **AND** remediation 是回到 Build 真实重建和捕获，不提供 backfill。

#### Scenario: In-place control evidence changes after capture

- **GIVEN** token 的 revision component 来自现有 implementation workspace fingerprint
- **WHEN** Verify 只写 `.pipeline/`、OpenSpec、文档或 verifier cache
- **THEN** 重算的 revision hash 保持一致
- **AND** repository/worktree binding 仍被独立核对。

#### Scenario: Implementation content changes after capture

- **WHEN** 现有 fingerprint policy 纳入的源码、配置、mode、目录或 symlink target 漂移
- **THEN** token assessment 返回 `revision-stale`。

### Requirement: Repository and worktree identity hashing SHALL be deterministic and private

identity probe MUST 使用物理 Git common directory 与当前 worktree top-level/Git directory，拒绝不完整、
非物理或无法证明的 identity，并对 repository/worktree 使用不同 domain separator。

#### Scenario: Sibling worktree is assessed

- **GIVEN** 两个 worktree 共享 Git common directory
- **WHEN** 在 sibling worktree 重算 token
- **THEN** repository hash 相同
- **AND** worktree hash 不同。

#### Scenario: Repository clone is assessed

- **WHEN** 相同 commit 存在于另一物理 repository clone
- **THEN** repository hash 不同
- **AND** Verify 返回 `project-mismatch`。

#### Scenario: Identity is exposed through an API

- **WHEN** blocker 被投影到 CLI/API/SSE/Dashboard
- **THEN** 只包含 SHA-256 摘要
- **AND** 不包含 Git common directory、top-level 或 Git directory 原文。

### Requirement: Revision preflight SHALL be observational until an authorized transition

check、exact-event review preflight、readiness、snapshot/SSE 与 Dashboard projection MUST 是纯评估；
只有获授权 actual transition MAY 写 canonical state、TransitionRecord、history 或 receipt。rollback 的
state mutation MUST 由同一次 transition 的 `mark-verification-failed` action 完成。

#### Scenario: Untrusted review request is rejected

- **WHEN** revision token 缺 provenance 或与 current transition head 不一致
- **THEN** review request 返回 typed blocker 与非零退出
- **AND** state/current/history/TransitionRecord 与 pending review receipt 前后不变。

#### Scenario: Trusted receipt precedes later corruption

- **GIVEN** success-like review receipt 在可信 token 状态创建
- **WHEN** 后续 canonical `build_sha` 被置空、改写或失配
- **THEN** actual success transition 重新求值并 fail closed
- **AND** 旧 receipt 不覆盖 current revision proof。

#### Scenario: Authorized rollback clears the old token

- **GIVEN** rollback 的非 revision guards 与 review receipt 有效
- **WHEN** actual rollback transition 成功
- **THEN** `mark-verification-failed` 清空 `build_sha` 并重置 review 状态
- **AND** 下一次 forward Verify admission 必须由新 Build transition 重新捕获 provenance。
