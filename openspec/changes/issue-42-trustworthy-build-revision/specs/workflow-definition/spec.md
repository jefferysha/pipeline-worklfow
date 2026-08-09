# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Custom Workflow SHALL inherit revision trust by field semantics

Workflow runtime MUST 根据 compiled IR 的 `build_sha` output/input 和标准 rollback action 注入 revision
lifecycle，不得只依赖 `build`、`verify`、`ship` 固定 step id。显式声明与继承项 MUST 去重。

#### Scenario: Arbitrary Build and Verify step ids

- **GIVEN** custom Workflow 的 step `implement` 输出 `build_sha`
- **AND** 目标 step `assure` 输入 `build_sha`
- **WHEN** `implement` 进入 `assure`
- **THEN** transition 自动运行 `freeze-build-sha`
- **AND** `assure` 的 success-like 出口自动运行 `build-head-unchanged`。

#### Scenario: Custom Verify rollback

- **GIVEN** `assure` 的一条出口含 `mark-verification-failed`
- **WHEN** 选择该出口
- **THEN** revision success guard 不阻断恢复
- **AND** action 清空旧 `build_sha`，下一次 Build 必须重新捕获。

#### Scenario: Explicit lifecycle declarations are duplicated

- **WHEN** custom Workflow 已显式声明与继承项结构相同的 guard/action
- **THEN** compiled transition 只求值/执行一次
- **AND** token capture 与 readiness 保持幂等。

#### Scenario: Unrelated custom workflow

- **WHEN** custom Workflow 不含 `build_sha` input/output
- **THEN** runtime 不注入 revision lifecycle
- **AND** 其 fingerprint 与合法 transition 行为保持既有语义。

### Requirement: Frozen workflow snapshots SHALL preserve the security invariant

运行时 MUST 对 frozen EffectiveWorkflowPlan 应用与版本无关的 #42 security invariant。旧 snapshot 中显式
存在的 `build-head-unchanged` MUST 使用新 fail-closed handler；语义化 output/input 的 snapshot MUST
获得相同 lifecycle policy，不要求原地重写 fingerprint。

#### Scenario: Historical frozen plan is resumed

- **WHEN** 合法历史 plan 在新 runtime 中恢复且 Verify-like step 输入 `build_sha`
- **THEN** revision trust 不因 definition 文件或 snapshot 版本较旧而绕过
- **AND** plan 文件与 fingerprint 不被原地修改。

