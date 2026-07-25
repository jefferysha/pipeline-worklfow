# Interaction and Skill Provenance Specification

## Purpose

Define contextual user-intent handling, action-effect gates, continuous
authority boundaries, and trustworthy Skill-read provenance.

## Requirements

### Requirement: Prompt intent SHALL have one source-only classification contract

Resume, new-objective, Workflow-selection, one-turn approval, continuous
authorization, revocation, rejection, and constraint phrases SHALL be classified
by one shared source-only contract used by router, breadcrumb, confirmation, and
review hooks. The classifier SHALL bind an approval to the unique current pending
question, Change, phase, and event rather than requiring one fixed reply string.
Deterministic rejection, revocation, and scope-constraint rules SHALL take
precedence over approval phrases.

Callers MAY apply different authorized actions to the same classified decision,
but SHALL NOT maintain divergent phrase vocabularies. Low-confidence or
conflicting input SHALL remain pending and request one minimal clarification; it
SHALL NOT fabricate approval.

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

#### Scenario: Natural reply approves the unique pending recommendation

- **GIVEN** exactly one current pending question has a recommended option
- **WHEN** the user replies `可以`, `按推荐`, or `继续，按照你的推荐`
- **THEN** the classifier approves only that option for the exact pending target
- **AND** the user is not required to repeat a magic phrase
- **AND** no continuous or cross-Change authority is fabricated.

#### Scenario: Mixed approval preserves its constraint

- **GIVEN** one current pending implementation question
- **WHEN** the user says `继续，但先别改代码`
- **THEN** the decision contains approval plus a `no-code-write` constraint
- **AND** only actions compatible with that constraint may proceed.

#### Scenario: Ambiguous reply does not clear the marker

- **GIVEN** more than one pending target could match a reply
- **WHEN** the reply does not identify one target
- **THEN** no approval receipt is created
- **AND** the pending interaction remains intact.

### Requirement: Skill evidence SHALL bind to the selected plugin identity

Codex Skill-read evidence SHALL be accepted only when the completed read
targets the exact packaged `skills/<safe-id>/SKILL.md` beneath a
process-provided selected host root, the active immutable managed release, or
the physically executing verified direct-development hook root.

The hook SHALL NOT enumerate historical host-cache versions. Project-global,
user-global, symlinked, mismatched, malformed, or unselected cache paths SHALL
not produce Skill evidence.

The transcript session MAY have started in another worktree of the same
repository only when the completed tool call explicitly declares the governed
worktree as its working directory and both worktrees resolve to the same Git
common directory. A missing explicit working directory, another repository, a
project-global duplicate projection, a user-global path, a malformed path, or
an unselected historical cache SHALL NOT produce evidence.

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

#### Scenario: Explicit sibling worktree command proves the selected Skill read

- **GIVEN** the host transcript session began in worktree A
- **AND** a completed bounded read explicitly used worktree B as its working
  directory
- **AND** A and B share the same Git common directory
- **AND** the target is beneath the process-provided Selected Skill Root
- **THEN** the current Change in worktree B may record that Skill evidence.

#### Scenario: Implicit sibling worktree read remains rejected

- **GIVEN** the transcript session began in worktree A
- **WHEN** a tool reads a Skill while omitting an explicit working directory for
  governed worktree B
- **THEN** no evidence is appended even if A and B share a repository.

#### Scenario: Another repository cannot borrow evidence

- **WHEN** the declared tool working directory and governed project do not share
  one Git common directory
- **THEN** the read is rejected as evidence.

### Requirement: Pending-interaction enforcement SHALL classify action effects

The interaction gate SHALL classify a requested tool action as `read-only`,
`human-question`, `reversible-local-write`, `canonical-state-transition`,
`external-side-effect`, `destructive-or-costly`, or `unknown`.

Known read-only inspection and human-question actions SHALL remain available
while a pending interaction or review exists. State transitions, external
effects, destructive or costly actions SHALL retain their exact authorization
requirements. Unknown actions SHALL fail closed. A shell command SHALL be
read-only only when every parsed command is in a strict read-only allowlist and
contains no redirection, substitution, backgrounding, or unclassified segment.

#### Scenario: Repository inspection continues while a decision is pending

- **GIVEN** a fresh pending interaction marker
- **WHEN** the agent runs `rg`, `git diff`, `pipeline status`, or another
  declared read-only inspection
- **THEN** the gate allows the inspection without clearing the marker.

#### Scenario: A write disguised in a shell chain is blocked

- **GIVEN** a fresh pending interaction marker
- **WHEN** a shell action combines a read command with redirection, command
  substitution, or an unclassified command
- **THEN** the whole action is classified non-read-only and remains blocked.

#### Scenario: Canonical transition still requires its receipt

- **GIVEN** a pending review for one exact event
- **WHEN** a caller attempts a canonical state transition
- **THEN** the action remains blocked until the matching approval receipt exists
- **AND** read-only inspection remains available.

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
