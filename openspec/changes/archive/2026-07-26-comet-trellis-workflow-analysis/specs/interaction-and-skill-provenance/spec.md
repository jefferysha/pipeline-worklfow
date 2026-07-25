# Interaction and Skill Provenance Delta

## MODIFIED Requirements

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

#### Scenario: Rejection wins over a continue token

- **WHEN** the user says not to continue the current Change and includes the word
  `继续` while naming another objective
- **THEN** rejection and new-objective precedence prevent current-Change
  approval and resume.

#### Scenario: Ambiguous reply does not clear the marker

- **GIVEN** more than one pending target could match a reply
- **WHEN** the reply does not identify one target
- **THEN** no approval receipt is created
- **AND** the pending interaction remains intact.

### Requirement: Skill evidence SHALL bind to the selected plugin identity

Codex Skill-read evidence SHALL be accepted only when the completed read
targets the exact packaged `skills/<safe-id>/SKILL.md` beneath a
process-provided Selected Skill Root, the active immutable managed release, or
the physically executing verified direct-development hook root.

The transcript session MAY have started in another worktree of the same
repository only when the completed tool call explicitly declares the governed
worktree as its working directory and both worktrees resolve to the same Git
common directory. A missing explicit working directory, another repository, a
project-global duplicate projection, a user-global path, a malformed path, or
an unselected historical cache SHALL NOT produce evidence.

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

## ADDED Requirements

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
