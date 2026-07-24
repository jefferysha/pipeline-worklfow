## ADDED Requirements

### Requirement: Governed changes SHALL initialize an OpenSpec document ledger
The system SHALL create a versioned `.pipeline-documents.json` sidecar for every default workflow change and every custom workflow that declares `openspec_contract: required`. The ledger SHALL remain separate from `.pipeline.yaml`, SHALL use only project-relative document paths, and SHALL be published atomically under the change lock.

#### Scenario: Default change initializes the ledger
- **WHEN** a user creates a default workflow change
- **THEN** the change contains an initialized OpenSpec scaffold and a valid empty document ledger before the first phase can complete

#### Scenario: Legacy custom change remains compatible
- **WHEN** a user creates or reads a custom workflow that does not declare `openspec_contract: required`
- **THEN** no document-ledger requirement is imposed and its existing state-file/API behavior remains compatible

### Requirement: A workflow SHALL opt in to OpenSpec governance explicitly and structurally
The workflow schema SHALL accept the optional top-level field `openspec_contract: required`. A workflow that opts in SHALL contain the seven canonical phases in canonical order and SHALL expose the required forward, verify-failure return, and archive transitions. Invalid governed workflows SHALL fail parsing or validation with an actionable error rather than silently falling back to an unconstrained custom workflow.

#### Scenario: Valid governed workflow is accepted
- **WHEN** a custom workflow declares `openspec_contract: required` and defines the canonical phase graph
- **THEN** it can be saved, compiled, initialized, and enforced with the same document contract as default

#### Scenario: Incomplete governed workflow is rejected
- **WHEN** a custom workflow declares `openspec_contract: required` but removes, reorders, or disconnects a canonical phase
- **THEN** validation rejects it and identifies the missing or invalid phase/transition

### Requirement: Document records SHALL prove production provenance and current content
The `pipeline document record` command SHALL register a named document kind only when the target is a nonempty regular file within `openspec/` or `docs/`, the caller supplies a phase-appropriate producer, and the invocation history contains the required skill evidence. Each record SHALL contain its document kind, safe relative path, SHA-256 digest, producer, and registration timestamp. A kind is a single named evidence slot: re-registering changed or moved content SHALL replace the prior path/digest and invalidate stale read receipts instead of retaining an unrecoverable stale record.

#### Scenario: Skill-produced OpenSpec proposal is recorded
- **WHEN** the open phase has invoked the declared OpenSpec proposal skill and records the proposal document
- **THEN** the ledger stores the proposal path, current digest, producer, and timestamp

#### Scenario: Arbitrary producer claim is rejected
- **WHEN** a caller attempts to register a document with a producer that has no matching phase skill evidence
- **THEN** the command fails without altering the ledger and reports the required skill evidence

### Requirement: Later phases SHALL record exact-hash document reads
The `pipeline document read` command SHALL re-hash recorded documents and persist a receipt for the current phase only when the file still matches the recorded digest. Required phase exits SHALL reject missing, stale, or incomplete receipts. A changed document SHALL require re-registration and re-reading before a later phase can pass.

#### Scenario: Build receives its complete specification context
- **WHEN** a governed change enters the build exit check
- **THEN** it must have current read receipts for proposal, OpenSpec design, tasks, Superpowers design, ADR, delta spec, Superpowers plan, and plan

#### Scenario: Edited ADR invalidates a receipt
- **WHEN** an ADR is modified after a later phase has recorded its read receipt
- **THEN** the next check or transition fails until the ADR is re-recorded and re-read at its new digest

### Requirement: Check and transition SHALL enforce the phase evidence matrix
For governed changes, both `pipeline check` and transition application SHALL enforce the documented output and input matrix for open, explore, spec, build, verify, ship, and archive. The failure response SHALL identify the missing document kind, required producer/read phase, and the command needed to repair it. The enforcement SHALL run in both CLI and dashboard server paths.

#### Scenario: Spec cannot advance without delta spec and plan evidence
- **WHEN** a governed change runs `spec-complete` without registered delta spec, Superpowers plan, or plan
- **THEN** both CLI check and transition reject the attempt with document-evidence blockers

#### Scenario: Server transition cannot bypass document checks
- **WHEN** a dashboard API transition targets a governed change with incomplete document evidence
- **THEN** the server returns its existing compatible error shape and leaves the canonical run state unchanged

### Requirement: Evidence status SHALL be observable in the dashboard and health checks
The change snapshot SHALL include a read-only document-evidence projection with required records, current/stale status, producer, and phase read receipts. The dashboard SHALL present this projection next to a change's phase Todo without inventing completed artifacts. Doctor and the Codex adapter SHALL distinguish a skill merely present in a Claude plugin cache from a skill actually exposed to the Codex project target.

#### Scenario: Dashboard shows missing document evidence
- **WHEN** a governed change has not registered a required artifact for its current exit
- **THEN** the Dashboard labels the artifact as missing and names the phase that requires it

#### Scenario: Codex adapter exposes required Superpowers skills
- **WHEN** the Codex adapter is installed in a project with the Superpowers source available
- **THEN** the project skill directory contains conflict-safe links for the required Superpowers skills and doctor reports target discoverability accurately

### Requirement: Review confirmation SHALL persist an exact event receipt and never self-lock
The review gate SHALL represent a pending review as a canonical, project-scoped receipt containing the exact current phase and requested transition event. After the user has seen the artifacts and explicitly confirms, `pipeline review acknowledge` SHALL persist an approval receipt and clear only its matching short-lived marker projection. `pipeline transition` SHALL consume only that exact approved receipt. It SHALL not require an unavailable host-specific question event, shall not treat read-only inspection as a blocked write, and shall fail closed for unrelated or unconfirmed prompts. Direct marker deletion SHALL never be an approval mechanism.

#### Scenario: Explicit confirmation unlocks only the requested transition
- **WHEN** a review receipt for `verify-pass` is pending and the user explicitly confirms it
- **THEN** the confirmation hook or CLI acknowledgement persists approval for the current phase and `verify-pass`, clears only the matching marker projection, and the next authorized `verify-pass` transition can run

#### Scenario: A different event cannot reuse an approval
- **WHEN** a `verify-pass` receipt is approved and a caller attempts `verify-fail`
- **THEN** the transition is rejected because the approved receipt does not match the requested event

#### Scenario: Unrelated prompt does not unlock a review marker
- **WHEN** a review marker is active and the user submits an unrelated message
- **THEN** the marker remains active, no approval receipt is written, and mutation attempts remain blocked
