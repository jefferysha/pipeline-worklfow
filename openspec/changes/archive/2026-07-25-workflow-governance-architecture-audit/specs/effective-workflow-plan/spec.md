# Effective Workflow Plan Specification

## ADDED Requirements

### Requirement: Every Workflow SHALL compile into one effective execution plan

The kernel SHALL compile built-in and project-defined Workflows through the
same validation path into an immutable effective plan. The plan SHALL expose
the graph, step Skill policy, document policy, review policy, automation
eligibility, and projection metadata consumed by CLI, server, dashboard, and
transition application.

Runtime consumers SHALL NOT use a Workflow name such as `default` as a
capability test. A built-in name MAY remain a stable identity, but behavior
SHALL be selected through explicit plan capabilities.

#### Scenario: Default uses the shared compiler

- **WHEN** a default Change is initialized or resumed
- **THEN** its seven-phase Workflow is compiled through the same effective-plan
  compiler used for a custom Workflow
- **AND** its document, review, Skill, and transition invariants remain
  identical to the existing default contract.

#### Scenario: Custom Workflow uses the same transition application

- **WHEN** a project Workflow is compiled successfully
- **THEN** CLI and HTTP transition paths consume the same effective plan
- **AND** neither path can skip a plan-declared Skill, document, or review
  requirement.

#### Scenario: Consumer reconstructs a capability from the name

- **WHEN** a source change adds a new runtime branch that uses
  `workflow === default` to decide governance behavior outside an explicit
  compatibility/compiler module
- **THEN** the architecture check fails with the governing rule and location.

### Requirement: Track policy SHALL overlay rather than replace Workflow policy

A Track SHALL contribute routing, coverage, and automation eligibility without
removing the selected Workflow's graph, documents, Skills, gates, or
transitions. The neutral `free` Track SHALL add no domain coverage or domain
Skill matrix and SHALL still execute the complete selected effective plan.

#### Scenario: Free executes a governed short Workflow

- **GIVEN** a three-step Workflow declares a document governance profile
- **WHEN** it is selected with `track=free`
- **THEN** the three authored steps and declared documents are enforced
- **AND** no PM, frontend, or backend phases or Skills are injected.

#### Scenario: Simple remains lightweight

- **WHEN** the packaged `simple` Workflow is selected
- **THEN** its effective plan has no OpenSpec document policy by default
- **AND** its `change`, `verify`, `done`, and `escalated` graph remains intact.

### Requirement: Todo and UI projections SHALL derive from the effective plan

The server SHALL project actual step order, visits, gates, Skills, and document
requirements from the effective plan. Dashboard and native Todo consumers
SHALL render that projection and SHALL NOT substitute the default seven phases
for a custom or short Workflow.

#### Scenario: Three-step Workflow renders three primary Todo stages

- **WHEN** a Change uses a Workflow with `shape`, `implement`, and `verify`
- **THEN** its primary Todo and dashboard progress list those three steps
- **AND** document sub-items appear under their owning step
- **AND** no unowned default phase appears.

#### Scenario: Default retains seven primary Todo stages

- **WHEN** a Change uses the default Workflow
- **THEN** Open through Archive remain the seven primary Todo stages
- **AND** implementation tasks from the Change remain nested under their
  owning phases.

### Requirement: Effective plan compilation SHALL fail closed and remain bounded

Compilation SHALL reject unknown steps, transitions, gates, document
references, Skill dependencies, profile versions, and impossible combinations
with actionable errors. The plan SHALL be deep-frozen and compilation SHALL
not execute project text or external commands.

#### Scenario: Governance references a missing step

- **WHEN** a profile assigns a document to a step not present in the Workflow
- **THEN** compilation fails before the Workflow is saved or initialized
- **AND** the error names the profile field and missing step.

#### Scenario: Project YAML attempts executable content

- **WHEN** a Workflow/profile contains data outside the bounded schema
- **THEN** parsing rejects it as unknown/invalid data
- **AND** no field is sourced, evaluated, or executed.
