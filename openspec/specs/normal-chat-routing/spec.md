# Normal-chat workflow routing

## Requirements

### Requirement: normal chat preserves effective Track workflow bindings

For every enabled effective Track, the router's generated data contract SHALL carry the Track's
validated default workflow along with its id, label, priority, and routing pattern.

#### Scenario: custom Track is routed

- **WHEN** a project contains a routable custom Track whose default workflow is `pet-adoption`
- **AND WHEN** a new user prompt routes to that project
- **THEN** the normal-chat dispatch exposes `pet-adoption` as the recommended workflow for that
  Track rather than substituting `default`.

### Requirement: custom choices require explicit selection before Change creation

For a new objective in a project that has a custom routable Track or a non-default workflow
binding, the router SHALL mark its dispatch as selection-required and include valid candidate
Track/workflow pairs.

#### Scenario: user chooses between default and custom paths

- **WHEN** a prompt can be served by the recommended custom path and a built-in/default path
- **THEN** the root pipeline skill asks the user which pair to use before running `pipeline init`
- **AND THEN** the new Change stores the selected pair through the canonical CLI/API path.

### Requirement: clean projects preserve default routing

A project whose effective routable Tracks are all built-in and bound to `default` SHALL continue
to dispatch the winning Track and default workflow without a selection question.

### Requirement: cache incompatibility fails closed

The hook SHALL reject a cache that lacks the workflow binding required by its current schema and
regenerate it on the cold path; it SHALL not guess or silently fall back to an old value.

### Requirement: Every Workflow SHALL have a neutral executable entry

The system SHALL expose a built-in `free` Track whose Workflow binding allows
every valid Workflow. The Track SHALL be available after setup and update
without a project-authored Track file.

The `free` Track SHALL add no PM, frontend, or backend coverage profile or skill
matrix. It SHALL not be automation-eligible and SHALL not participate in
content-based routing. The selected Workflow's own steps, skills, gates,
OpenSpec contract, documents, and transitions SHALL remain fully enforced.

#### Scenario: A project Workflow is executed without a domain Track overlay

- **GIVEN** a project defines Workflow `release-train`
- **WHEN** a user selects `track=free` and `workflow=release-train`
- **THEN** the canonical Change stores that exact pair
- **AND** execution follows only `release-train`'s declared graph and governance
- **AND** no PM/frontend/backend profile is injected.

#### Scenario: A future Workflow is automatically eligible

- **WHEN** a valid Workflow is added after installation
- **THEN** `free` may bind it without creating or updating a Track definition.

#### Scenario: Free executes the default Workflow to completion

- **GIVEN** a Change binds `track=free` and `workflow=default`
- **WHEN** each phase driver executes from Open through Archive
- **THEN** every phase has an explicit neutral instruction path
- **AND** OpenSpec, Superpowers documents, tasks, frozen verification, applied
  spec, review receipts, and archive gates remain enforced
- **AND** PM PRD and engineering double-review/PR URL fields are not required.

### Requirement: Discussion and free execution SHALL remain distinct

The existing `chat` identity SHALL continue to represent non-executing
discussion in normal conversation. A request to explain or discuss SHALL not
create a Change merely because the `free` Track exists.

#### Scenario: An explanation remains ordinary chat

- **WHEN** a user asks why a pipeline gate exists
- **THEN** the hook suppresses workflow execution
- **AND** neither `chat` nor `free` creates a Change.

### Requirement: Manual candidates SHALL be independent from routable scorers

The router's versioned data contract SHALL carry whether an effective Track is
eligible for content scoring. A non-routable Track MAY be exposed as a bounded
manual candidate, but SHALL never enter the score loop or win by score.

An explicit free-mode phrase SHALL be treated as a direct user choice rather
than as a routing score. If the exact Workflow is not yet selected, the root
pipeline skill SHALL validate and obtain an exact legal `free / workflow` pair
before Change creation.

#### Scenario: Free is visible but never auto-selected

- **GIVEN** a normal implementation prompt does not explicitly request free mode
- **WHEN** routing scores enabled Tracks
- **THEN** `free` has no score and cannot win
- **AND** the applicable routable Track remains the recommendation.

#### Scenario: Explicit free mode creates a free Change

- **WHEN** a user explicitly says to use free mode for a new objective
- **THEN** the dispatch recommends `track=free`
- **AND** the root skill validates the selected Workflow before `pipeline init`.

### Requirement: Router schema migration SHALL fail closed

A cache created before routability was part of the row schema SHALL be rejected
and regenerated. Project-controlled cache bytes SHALL remain bounded, data-only,
and never be sourced or evaluated as shell.

#### Scenario: An old cache cannot make free routable

- **WHEN** the hook reads a prior cache schema with no routability field
- **THEN** it discards the cache and regenerates the current schema
- **AND** it does not infer a default routability value.

#### Scenario: A builtin changes without a project Track edit

- **WHEN** a plugin release changes an effective builtin Track while
  `.pipeline/tracks.yaml` remains byte-identical
- **THEN** the release-owned router contract revision changes
- **AND** the hook compares that revision by content on every cache load
- **AND** the prior cache is regenerated even when its mtime is newer than
  the plugin files.

### Requirement: Custom Workflow archive terminals SHALL close canonical state

A custom Workflow that reaches a terminal step named `archive` SHALL support
the reserved `archived` completion event after that step's guards, skill DAG,
and document evidence pass. Completion SHALL set `phase_status=done`,
`archived=true`, and `archived_at` without requiring a cyclic transition in
the user-authored Workflow graph.

#### Scenario: Terminal archive no longer remains active forever

- **WHEN** a custom Workflow reaches `archive` with `transitions: []`
- **AND** its declared archive skills, guards, and document reads are complete
- **THEN** `pipeline transition <change> archived` completes the canonical run
- **AND** the Change is no longer returned as an active recovery candidate.
