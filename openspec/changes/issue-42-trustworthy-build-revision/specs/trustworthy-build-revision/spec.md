# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Build SHALL capture a project and worktree bound revision token

Tenon MUST 在 Build 出口由运行时 capability 捕获当前真实 revision，并把 revision、repository 与
worktree 的 domain-separated SHA-256 编码为 canonical `build:v1` token。token MUST 写入既有
`build_sha` 字段，并由同一次 canonical transition 的 immutable TransitionRecord effect 证明来源。

#### Scenario: Git-isolated Build captures a token

- **GIVEN** `isolation` 为 `branch` 或 `worktree`
- **AND** 当前 Git object ID、repository identity 与 worktree identity 均可证明
- **WHEN** Build 进入声明 `build_sha` input 的 Verify-like step
- **THEN** `build_sha` 是绑定三类 identity 的 canonical `build:v1:git` token
- **AND** transition record 含唯一、同值的 `build_sha` effect。

#### Scenario: In-place Build captures a token

- **GIVEN** `isolation=in-place`
- **AND** 当前 implementation workspace fingerprint 与 repository/worktree identity 均可证明
- **WHEN** Build 完成
- **THEN** `build_sha` 是 canonical `build:v1:workspace` token
- **AND** token 的 revision hash 由现有排除策略下的 workspace baseline 派生。

#### Scenario: Capture capability is unavailable

- **WHEN** revision、repository 或 worktree identity 任一能力缺失、为空、非法或求值失败
- **THEN** Build transition 返回 typed blocker
- **AND** canonical state、TransitionRecord、history 与 receipt 均不变。

### Requirement: Verify success SHALL require a trustworthy current Build revision

任何 Verify-like success edge MUST 解析 token、核对当前 isolation、重算 revision/repository/worktree
hash，并验证 canonical current 与进入本次 Verify visit 的 transition head provenance。任一证明缺失
MUST 拒绝，不得 skipped 或降级放行。

#### Scenario: Revision is missing or null

- **WHEN** `build_sha` 为空或字面 `null`
- **THEN** Verify success 被 `verify-build-revision-untrusted` 拒绝
- **AND** reason 分别为 `missing` 或 `null`。

#### Scenario: Revision is ambiguous or malformed

- **WHEN** `build_sha` 含多个候选，或不符合 canonical token grammar
- **THEN** Verify success 被拒绝
- **AND** reason 为 `ambiguous` 或 `malformed`。

#### Scenario: Revision is stale

- **GIVEN** token provenance 有效
- **WHEN** 当前 Git object ID 或 workspace fingerprint 与 token 的 revision hash 不同
- **THEN** Verify success 被拒绝
- **AND** reason 为 `revision-stale`。

#### Scenario: Revision belongs to another project

- **WHEN** 当前 repository identity hash 与 token 不同
- **THEN** Verify success 被拒绝
- **AND** reason 为 `project-mismatch`。

#### Scenario: Revision belongs to another worktree

- **WHEN** repository 相同但当前 worktree identity hash 与 token 不同
- **THEN** Verify success 被拒绝
- **AND** reason 为 `worktree-mismatch`。

#### Scenario: Revision lacks canonical provenance

- **WHEN** token 由普通 state set、backfill、producer 声明或无关 receipt 提供
- **OR** validated transition head 未以唯一 effect 把同一 token 写入当前 Verify visit
- **THEN** Verify success 被 `provenance-missing` 或 `provenance-mismatch` 拒绝。

#### Scenario: Valid revision succeeds idempotently

- **GIVEN** token、当前三类 identity、canonical state 与 transition provenance 全部一致
- **WHEN** guard 或 readiness 被重复求值
- **THEN** 每次结果均为 ready
- **AND** 不写入新 state、record 或 receipt。

### Requirement: All projections SHALL expose one stable blocker contract

CLI、transition HTTP、snapshot/SSE、AFK settlement 与 Dashboard MUST 使用 code
`verify-build-revision-untrusted` 和 remediation
`return-to-build-and-capture-current-revision`。blocker MUST 包含闭集 reason，并在可得时包含
`stateHash` 与 `revisionHash`。

#### Scenario: Interactive transition is rejected

- **WHEN** CLI 或 server transition 遇到不可信 revision
- **THEN** 两者输出相同 code、reason、remediation 与 hash 语义
- **AND** HTTP 使用非成功状态，CLI 使用非零退出。

#### Scenario: Snapshot is streamed

- **WHEN** server snapshot 与 SSE 投影同一 blocked Change
- **THEN** `readinessByTransition` 中的 blocker 深等价
- **AND** Dashboard strict decoder 接受并展示同一安全修复。

#### Scenario: Evaluation cannot complete

- **WHEN** assessment capability 缺失或 evaluator 抛错
- **THEN** actual transition 与 readiness 都返回同一 hard blocker
- **AND** 不得生成 `ready=true` 或成功 transition。

### Requirement: AFK verification admission SHALL reject an untrusted revision

AFK MUST 继续以 authoritative branch barrier 和 boundary-verified verifier result 为 revision 事实。
缺失、非法 barrier 或 verifier subject revision 漂移 MUST 在 merge/settlement 前映射为同一 blocker
code，并进入 paused 而非 merged。

#### Scenario: AFK has no authoritative revision

- **WHEN** AFK verification admission 没有 canonical Git object ID，或值非法/歧义
- **THEN** admission 返回 `verify-build-revision-untrusted`
- **AND** L3 不执行 merge。

#### Scenario: AFK verifier reports another revision

- **WHEN** trusted verifier result 的 workflow/attempt/change 正确，但 revision 不等于 authoritative barrier
- **THEN** settlement reason 与 `automation_cause` 为 `verify-build-revision-untrusted`
- **AND** Dashboard 显示同一 remediation。

#### Scenario: AFK valid revision proceeds

- **WHEN** authoritative barrier、boundary-verified result 与所有既有 policy/binding checks 一致
- **THEN** #42 guard 不改变既有 authorized 路径
- **AND** 重试同一事实得到相同判定。

### Requirement: Rejection observability SHALL be privacy safe

Guard/rejection observability MUST 只发 stable code、closed reason、remediation、state/revision hashes 与
必要的 workflow coordinates，不得发绝对路径、prompt、credential、token value 或 raw exception。

#### Scenario: A rejection event is inspected

- **WHEN** CLI log、HTTP body、SSE blocker 或 AFK RunRecord 记录 revision rejection
- **THEN** 事件可按 code/reason/stateHash/revisionHash 聚合
- **AND** 递归字段和值检查不含 prompt、credential、绝对路径或原始 token。

### Requirement: Revision trust SHALL apply across supported modes

同一不变量 MUST 适用于 interactive/AFK、default/custom Workflow 以及 built-in/free/custom track 中
声明了 Verify-like `build_sha` input 的路径。没有该 input 的 Workflow 单元 MAY 不适用。

#### Scenario: Track changes

- **WHEN** 同一 default 或 custom transition 分别使用 built-in、free 与 custom track
- **THEN** revision trust guard 的结果不因 track id 而被绕过。

#### Scenario: Workflow has no Verify revision input

- **WHEN** 一个短 Workflow 从未声明 `build_sha` input
- **THEN** #42 不自动制造不存在的 Verify phase
- **AND** 该 Workflow 的既有合法边保持不变。
