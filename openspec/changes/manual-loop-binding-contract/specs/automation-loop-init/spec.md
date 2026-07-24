# Automation Loop Initialization Delta

## ADDED Requirements

### Requirement: Explicit manual loop bindings SHALL be preserved

When `pipeline loops init` is invoked without a starter template, every
explicit `--workflow` and `--skill-bundle` value SHALL be written into the
canonical loop registry entry.

#### Scenario: Manual loop declares both bindings

- **GIVEN** a repository has Workflow `default` and skill profile `pm`
- **WHEN** the user runs manual loop initialization with
  `--workflow default --skill-bundle pm`
- **THEN** the resulting entry contains `workflow_id: default`
- **AND** it contains `skill_bundle_id: pm`
- **AND** CLI success does not mask an unwired loop.

#### Scenario: Manual loop omits bindings

- **WHEN** neither binding flag is supplied
- **THEN** the workflow field remains absent
- **AND** the skill profile remains canonically unwired.

### Requirement: Starter metadata SHALL be independent of binding persistence

Template id/version SHALL only be present for starter-template loops. Explicit
workflow/profile bindings SHALL be preserved regardless of whether template
metadata exists.

### Requirement: Simple terminal branches SHALL close the canonical run

The built-in `simple` Workflow SHALL mark a Change done and archived when
`verify-pass` enters `done` or `scope-expanded` enters `escalated`.

#### Scenario: Bounded simple task completes

- **WHEN** verification passes and the Workflow enters `done`
- **THEN** `phase_status` is `done`
- **AND** `archived` is `true`
- **AND** the Change no longer appears in active recovery candidates.

#### Scenario: Simple task expands into a default Change

- **WHEN** scope expansion enters `escalated`
- **THEN** the simple audit Change is canonically archived
- **AND** a new default Change may name it in `depends_on`
- **AND** the default Build guard does not deadlock on an unreachable archive
  phase.
