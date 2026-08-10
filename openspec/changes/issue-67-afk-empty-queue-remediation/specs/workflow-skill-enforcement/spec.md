# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: AFK preparation SHALL fail closed when phase Skill content is unavailable

default AFK coordinate SHALL capture the frozen effective Skill capability and bind workflow, manifest,
and track inputs to the existing TOCTOU digest. Preparation SHALL use the unified explicit profile
projection. A missing, invalid, or changed phase Skill SHALL produce the existing structured failure
reason, SHALL NOT create a sandbox, activate a run, or charge execution, and SHALL NOT be reclassified
as an empty queue.

The CLI round SHALL validate active-loop wiring before scanning the queue. When wiring is valid and the
fresh ready scan is empty, the round SHALL return `status=empty`; `tenon afk run` SHALL exit `0`, print
the empty-queue message, and make no Docker call. A Docker-unavailable candidate SHALL return
`status=docker-unavailable` and exit `1`; policy, capability, or Skill wiring failure SHALL return
`status=configuration-error` (or its existing structured fail-closed classification) and exit non-zero.

#### Scenario: Profile 存在但 phase Skill 缺失

- **GIVEN** default AFK admission 的 profile 合法且 profile Skills 均可定位
- **BUT** 当前 frozen phase requirement 的 Skill 内容不可定位
- **WHEN** execution preparation 构造 bundle
- **THEN** preparation 以 `skill-bundle-skill-not-found` 拒绝
- **AND** 不发布一个缺少 phase slot 的空或部分 snapshot。

#### Scenario: Empty queue succeeds after hermetic wiring

- **GIVEN** active-loop wiring and the frozen phase Skill content are valid
- **AND** the fresh ready scan contains no `phase=build` and `automation=queued` candidate
- **WHEN** an operator invokes `tenon afk run`
- **THEN** the CLI returns exit `0`
- **AND** prints the empty-ready-queue message
- **AND** does not call Docker or create a sandbox/run record

#### Scenario: Candidate with Docker unavailable remains a failure

- **GIVEN** active-loop wiring is valid
- **AND** the fresh ready scan contains at least one ready candidate
- **AND** Docker is unavailable
- **WHEN** an operator invokes `tenon afk run`
- **THEN** the CLI returns exit `1`
- **AND** exposes `status=docker-unavailable` (including the ready candidates)
- **AND** does not print a successful empty-queue result

#### Scenario: Missing phase Skill remains fail-closed

- **GIVEN** an active loop requires a frozen phase Skill that cannot be located
- **WHEN** an operator invokes `tenon afk run`
- **THEN** the CLI returns a non-zero configuration/wiring failure
- **AND** does not classify the round as `empty`
- **AND** does not create a sandbox, charge execution, or weaken phase Skill enforcement
