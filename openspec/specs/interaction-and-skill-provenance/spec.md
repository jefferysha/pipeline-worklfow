# Interaction and Skill Provenance Specification

## Requirements

### Requirement: Prompt intent SHALL have one source-only classification contract

Resume, new-objective, Workflow-selection, one-turn approval, continuous
authorization, and revocation phrases SHALL be classified by one shared
source-only contract used by router, breadcrumb, and confirmation hooks.
Callers MAY apply different authorized actions to the same classified data,
but SHALL NOT maintain divergent phrase vocabularies.

#### Scenario: Bare continue resumes with no pending receipt

- **WHEN** the user says `继续` and exactly one eligible Change exists with no
  pending interaction or review
- **THEN** routing may resume that Change
- **AND** no approval or continuous authority is fabricated.

#### Scenario: Bare continue approves the exact pending interaction

- **WHEN** the selected Change has an exact current pending interaction or
  review and the user says `继续`
- **THEN** the hook records/clears only the authorized matching receipt or
  marker
- **AND** the retried write can proceed
- **AND** no other Change or event is approved.

#### Scenario: New objective contains the word continue

- **WHEN** the user says not to continue and names a new objective
- **THEN** new-objective rejection precedence prevents old-Change resume and
  approval.

### Requirement: Skill evidence SHALL bind to the selected plugin identity

Codex Skill-read evidence SHALL be accepted only when the completed read
targets the exact packaged `skills/<safe-id>/SKILL.md` beneath a
process-provided selected host root, the active immutable managed release, or
the physically executing verified direct-development hook root.

The hook SHALL NOT enumerate historical host-cache versions. Project-global,
user-global, symlinked, mismatched, malformed, or unselected cache paths SHALL
not produce Skill evidence.

#### Scenario: Current selected cache proves a Skill read

- **GIVEN** the stable bootstrap supplies the exact selected Codex plugin root
- **WHEN** the host transcript proves a completed bounded read of its packaged
  Skill file
- **THEN** the current Change may record `CodexSkillRead` evidence for that
  Skill and current step visit.

#### Scenario: Historical cache contains the same Skill

- **WHEN** Codex reads a Skill from an older unselected cache directory
- **THEN** no evidence is appended
- **AND** a required producer or step DAG remains blocked.

#### Scenario: Skill path escapes through a symlink

- **WHEN** the lexical Skill path is under a trusted root but its real path
  escapes or differs from the expected packaged file
- **THEN** the read is rejected as evidence.

### Requirement: Every Workflow SHALL enforce current-visit Skill policy

The effective plan SHALL apply the same current-step-visit Skill DAG algorithm
to default and custom Workflows. Only the exact orchestration entry Skill
`pipeline` MAY be exempt because it selects or recovers the Change before
step execution. Previous visits, other steps, other Changes, or mere Skill
installation SHALL not satisfy an exit.

#### Scenario: Default step omits a mandatory Skill

- **WHEN** a default phase attempts to exit without current-visit evidence for
  a plan-declared mandatory Skill
- **THEN** CLI and HTTP transitions fail with the same incomplete-Skill reason.

#### Scenario: Verify loops back to Build

- **WHEN** a Change re-enters Build after Verify failure
- **THEN** the previous Build visit's Skill receipts do not satisfy the new
  visit
- **AND** declared Build Skills must complete again.

### Requirement: Continuous authority SHALL remain Change-bound and non-expansive

Continuous authority SHALL permit delegated review acknowledgement only after
real Skill, document, read, guard, and review-request evidence exists for the
exact live Change. It SHALL not cross Changes, grant external publication
authority, bypass security/scope decisions, or survive explicit revocation.

#### Scenario: Delegated review lacks evidence

- **WHEN** a continuously authorized Change requests delegated acknowledgement
  before its phase evidence or guard passes
- **THEN** acknowledgement fails and no transition receipt is created.
