# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Custom Workflow SHALL inherit revision trust by field semantics

Workflow runtime MUST 根据 compiled IR 的 `build_sha` output/input 和 effective rollback action 注入
revision lifecycle，不得只依赖 `build`、`verify`、`ship` 固定 step id。declared step/edge、
document-governed fixed 与 semantic guard/action MUST 按单条 edge 合并并去重。

#### Scenario: Arbitrary Build and Verify step ids

- **GIVEN** custom Workflow 的 step `implement` 输出 `build_sha`
- **AND** 目标 step `assure` 输入 `build_sha`
- **WHEN** `implement` 进入 `assure`
- **THEN** transition 自动运行 `freeze-build-sha`
- **AND** `assure` 的 success-like 出口自动运行 `build-head-unchanged`。

#### Scenario: Custom Verify rollback removes an explicit revision guard

- **GIVEN** `assure` 的 step 或 rollback edge 显式声明 `build-head-unchanged`
- **AND** 该 edge 的 effective actions 含 `mark-verification-failed`
- **WHEN** 选择该 rollback edge
- **THEN** revision success guard 不求值也不阻断恢复
- **AND** action 清空旧 `build_sha`、重置 review 状态，下一次 Build 必须重新捕获。

#### Scenario: Custom Verify rollback preserves unrelated guards

- **GIVEN** rollback edge 同时具有 revision guard 与权限、文档、review 或未知自定义 guard
- **WHEN** runtime 计算 effective lifecycle
- **THEN** 只移除结构等价的 `build-head-unchanged`
- **AND** 所有非 revision guard 继续按既有顺序求值。

#### Scenario: Explicit lifecycle declarations are duplicated

- **WHEN** custom Workflow 已显式声明与 fixed/semantic 继承项结构相同的 guard/action
- **THEN** compiled transition 只求值/执行一次
- **AND** token capture、actual transition 与 readiness 保持幂等。

#### Scenario: Unrelated custom workflow

- **WHEN** custom Workflow 不含 `build_sha` input/output
- **THEN** runtime 不注入 revision lifecycle
- **AND** 其 fingerprint 与合法 transition 行为保持既有语义。

### Requirement: Custom check and review SHALL enforce the same edge-aware revision invariant

plain custom `tenon check` MUST 在保留既有 step guard 行为的同时，对当前 Verify-like step 的
非 rollback 出口合并并去重 revision guard；它 MUST NOT 因本规则执行任意非 revision edge guard。
custom `review request --event` MUST 按该 exact event 的 edge-aware lifecycle 求值，不得丢弃 event。

#### Scenario: Arbitrary Verify-like step has a success exit

- **GIVEN** 当前 arbitrary-id step 输入 `build_sha`
- **AND** 至少一条非 rollback 出口未显式声明 revision guard
- **WHEN** 运行 plain `tenon check`
- **THEN** runtime 仍自动求值一次 `build-head-unchanged`
- **AND** 缺失、无 provenance、stale 或 mismatched revision 使 check fail closed。

#### Scenario: Verify-like step has only rollback exits

- **GIVEN** 当前 Verify-like step 的所有出口 effective actions 均含 `mark-verification-failed`
- **WHEN** 运行 plain `tenon check`
- **THEN** 不要求新的 forward revision proof
- **AND** 既有非 revision step guards 仍然生效。

#### Scenario: Review request targets a success event

- **WHEN** custom `review request` 指向 success-like event
- **THEN** preflight 求值该 edge 的 revision guard
- **AND** 不可信 revision 不创建 pending review 或 acknowledge receipt。

#### Scenario: Review request targets a rollback event

- **WHEN** custom `review request` 指向 rollback event
- **THEN** preflight 不借用 success-like edge 的 revision guard
- **AND** 合法恢复 receipt 可创建，后续 rollback 不需要新的 forward proof。

### Requirement: Frozen workflow snapshots SHALL preserve the security invariant

运行时 MUST 对 frozen EffectiveWorkflowPlan 应用与版本无关的 revision security invariant。旧 snapshot
中显式存在的 `build-head-unchanged` MUST 使用新 fail-closed handler；语义化 output/input/action 的
snapshot MUST 获得相同 edge-aware lifecycle policy，不要求原地重写 fingerprint。

#### Scenario: Historical frozen plan is resumed

- **WHEN** 合法历史 plan 在新 runtime 中恢复且 Verify-like step 输入 `build_sha`
- **THEN** revision trust 不因 definition 文件或 snapshot 版本较旧而绕过
- **AND** plan 文件与 fingerprint 不被原地修改。

#### Scenario: Frozen plan has explicit rollback guard

- **GIVEN** frozen plan 的 rollback edge 或 source step 显式带有 `build-head-unchanged`
- **WHEN** 新 runtime 计算 rollback readiness 或执行 transition
- **THEN** rollback 保持 ready 并在 transition 中清理旧 token
- **AND** 同一 plan 的 success edge 仍 fail closed。
