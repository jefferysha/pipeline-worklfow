# Repository Architecture Compliance Specification

## Requirements

### Requirement: Objective Agent Rules SHALL be checked in CI

The repository SHALL provide a deterministic architecture check that cites the
governing `AGENTS.md` or `.agent-rules` clause and fails for:

- production files above their responsibility-specific hard limit;
- frontend lower-layer imports from feature or shell layers;
- cross-workspace deep imports outside public package exports;
- configured domain-layer imports of Node/protocol/infrastructure APIs;
- explicit production `any`, non-null assertions, and configured unchecked
  boundary casts;
- historical Skill-cache enumeration;
- Workflow-name capability reconstruction outside explicit
  compiler/compatibility modules.

The checker SHALL use exact, reviewed exceptions only for generated,
configuration, schema, fixture, test snapshot, or protocol files. It SHALL NOT
accept a floating violation baseline.

#### Scenario: Oversized controller is introduced

- **WHEN** a production HTTP controller exceeds 400 lines and is not an exact
  rule-owned exception
- **THEN** `npm run check:architecture` fails with the file, measured size,
  limit, and BACKEND rule citation.

#### Scenario: Translation resource exceeds component limits

- **WHEN** an exact translation configuration resource exceeds 400 lines
- **THEN** the checker applies its documented configuration exception
- **AND** ordinary component files do not inherit that exception.

#### Scenario: Shared imports a feature

- **WHEN** a file under dashboard `shared`, `lib`, or lower model ownership
  imports from `inbox`, `workbench`, `progress`, `afk`, or `shell`
- **THEN** the check fails with the FRONTEND dependency rule.

### Requirement: Backend adapters SHALL decode DTOs and call application boundaries

HTTP, CLI, and hooks SHALL restrict themselves to input/auth validation, DTO
conversion, application use-case invocation, and public error/exit mapping.
External values SHALL enter as `unknown` and be narrowed before domain
compilation or state mutation. Adapters SHALL NOT implement private persistence
parsers or cross-aggregate write protocols.

#### Scenario: Malformed Workflow request reaches the server

- **WHEN** a request body is not a valid Workflow DTO
- **THEN** a boundary decoder rejects it using the existing compatible client
  error shape
- **AND** no domain compile/save or state write occurs.

#### Scenario: Loop command reads Change state

- **WHEN** a loop command needs a Change-state projection
- **THEN** it uses the kernel/application repository or codec contract
- **AND** it does not parse `.pipeline.yaml` privately.

### Requirement: Frontend boundaries SHALL follow the declared dependency direction

Dashboard dependencies SHALL flow from App/shell to feature views to
model/state to API, with shared/lib/i18n available downward. Neutral evidence,
decision, and icon primitives SHALL live at the lowest stable ownership level.
API protocol parsing SHALL remain in bounded-context client modules exported
through a stable client facade.

#### Scenario: Feature views share evidence projection

- **WHEN** Inbox, Progress, and Task Detail need the same evidence chips
- **THEN** they import a neutral model projection
- **AND** model/shared code does not import Inbox.

#### Scenario: API returns malformed JSON

- **WHEN** a dashboard endpoint returns a structurally invalid response
- **THEN** the API client decoder maps it to the existing typed failure path
- **AND** no component receives an asserted domain shape.

### Requirement: Oversized production modules SHALL be decomposed by responsibility

Every current hard-limit production violation SHALL be split into cohesive
modules with stable public facades and focused tests. Empty forwarding shells,
generated line shuffling, or a broad exception SHALL not count as
decomposition.

#### Scenario: Server route composition is decomposed

- **WHEN** server routes are split by bounded context
- **THEN** shared Host/token/content-type/root protections execute for every
  write route
- **AND** existing status codes, response DTOs, SSE behavior, and tests remain
  compatible.

#### Scenario: Frontend page is decomposed

- **WHEN** a page or component is split
- **THEN** loading, empty, error, disabled, success, keyboard, responsive,
  theme, and i18n behavior remain covered at risk-appropriate levels.

### Requirement: Generated and installed assets SHALL track verified source

Schema/profile changes SHALL be represented consistently in source, tracked
CLI/server bundles, dashboard types, Skills, templates, tests, and immutable
release payloads. Bundle/freshness/install checks SHALL fail before activation
when any required projection is stale or a mandatory Skill is missing.

#### Scenario: Source supports a profile but bundle is stale

- **WHEN** the tracked CLI or server bundle does not contain the current
  profile behavior
- **THEN** freshness or bundle verification fails
- **AND** setup/update cannot activate that candidate.
