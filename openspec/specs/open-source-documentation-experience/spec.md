# Open-source Documentation Experience Specification

## ADDED Requirements

### Requirement: The repository SHALL provide a truthful open-source entry

The root `README.md` SHALL introduce Pipeline Lite in English and link to a
structurally equivalent Chinese `README.zh-CN.md`. Both documents SHALL explain
the product outcome, prerequisites, host-selected setup, first governed task,
execution modes, evidence and review model, adapter fidelity, Dashboard,
architecture/modules, documentation, support, security, contribution, and
license.

The README SHALL distinguish the `pipeline-lite` product name from the real
`pipeline-worklfow` repository identifier and SHALL NOT advertise an
unpublished npm-global installation, a unified version that does not exist,
identical host enforcement, public hosting, unsupported platform guarantees, or
timeless test/benchmark counts.

#### Scenario: New Codex user follows the quickstart

- **WHEN** a new user opens the root README
- **THEN** the primary setup path selects Codex explicitly with
  `pipeline setup --codex`
- **AND** it explains the one-time hook trust boundary and new-session behavior
- **AND** it gives a real command for runtime validation and opening the local
  Dashboard on its default loopback port.

#### Scenario: User needs Chinese documentation

- **WHEN** a reader follows the language link from the root README
- **THEN** `README.zh-CN.md` presents the same adoption, safety, navigation, and
  lifecycle sections
- **AND** all repository-relative links resolve from that file.

#### Scenario: Unsupported publication claim is considered

- **WHEN** the plugin and workspace package versions differ or no public
  package/site is configured
- **THEN** the README omits a misleading unified release badge and hosted URL
- **AND** source installation and the bundled local overview are described
  using their verified identities.

### Requirement: Canonical usage documentation SHALL cover public modules and tasks

The repository SHALL provide a navigable `docs/usage/` manual covering:

- installation, host selection, updates, repair, rollback, and uninstall;
- first task and explicit Change resume;
- discussion, simple, default, free, and custom routing;
- default phases, return edges, and review receipts;
- custom Workflows, Tracks, Skills, guards, and document contracts;
- OpenSpec, Superpowers, ADR, producer digests, and read receipts;
- Dashboard views, one-port runtime, local API, and status semantics;
- AFK, Docker prerequisites, loops, budgets, and autonomy levels;
- advanced channel, memory bridge, and Tap diagnostics;
- troubleshooting, security, contribution, architecture, and verification.

Each task guide SHALL state its goal, prerequisites, steps, expected result,
verification, common failures, and next action where applicable.

#### Scenario: User asks whether every task creates OpenSpec

- **WHEN** the reader opens the routing or evidence guide
- **THEN** it states that discussion creates no Change and packaged `simple`
  has no default OpenSpec contract
- **AND** default requires the full governed document chain
- **AND** custom/short Workflows generate and require only the documents in
  their declared contract.

#### Scenario: User investigates a waiting task

- **WHEN** the reader opens the Dashboard or troubleshooting guide
- **THEN** the guide distinguishes phase work, review waiting, AFK queue/running,
  and blocked/failure states
- **AND** it gives read-only diagnostic commands before any repair action.

#### Scenario: User configures an advanced tool

- **WHEN** the reader opens the channel/memory/Tap guide
- **THEN** it labels Channel as advanced compatibility tooling, memory as a
  read-only bridge, and Tap as explicit opt-in tracing
- **AND** it warns that captured prompts, headers, tokens, and CA material are
  sensitive local data.

### Requirement: The Dashboard SHALL expose a bundled read-only overview

The existing Dashboard SPA SHALL expose `overview` through
`/?view=overview`. The Pipeline brand control SHALL navigate to this view with
an accessible name and current-page state. `overview` SHALL NOT become a sixth
operational `PRIMARY_VIEWS` item and SHALL NOT replace Progress as the default.

The overview SHALL render before project/onboarding gating and SHALL remain
readable with zero projects, loading or failed snapshots, and a disconnected
event stream. It SHALL not call mutation endpoints or require project state.

#### Scenario: First-time user has no registered project

- **WHEN** the Dashboard snapshot reports zero projects and the URL requests
  `?view=overview`
- **THEN** the complete overview renders instead of project onboarding
- **AND** installation, workflow, evidence, documentation, and community links
  remain available.

#### Scenario: Operator enters through the brand

- **WHEN** an operator activates the brand control from any operational view
- **THEN** the URL changes to `view=overview`
- **AND** the brand exposes `aria-current="page"`
- **AND** the five operational rail destinations remain present and can return
  the operator to their existing workflow surfaces.

#### Scenario: Dashboard opens without an overview deep link

- **WHEN** no valid stored or linked view is present
- **THEN** the application still opens Progress
- **AND** no existing project/root/change deep-link behavior changes.

### Requirement: The overview SHALL explain modes, evidence, and modules without overclaiming

The overview SHALL present:

- Pipeline Lite's local-first value and exact setup command;
- discussion/simple/default/free/custom execution outcomes;
- the seven-phase default graph including return edges and review exits;
- the evidence chain from Skill visit through document digest/read receipt,
  review receipt, and transition;
- CLI, state/workflows, Dashboard, adapters/hooks, AFK/loops, and advanced
  diagnostics;
- adapter fidelity tiers and optional prerequisites;
- links to canonical usage, support, security, contribution, license, and the
  public repository.

It SHALL use static translated summaries backed by current sources and SHALL
not fetch remote marketing data, invent live project status, or embed a second
documentation renderer.

#### Scenario: User compares execution modes

- **WHEN** the mode section is rendered
- **THEN** each mode identifies its step shape, intended scope, and document
  behavior
- **AND** Free is not described as bypassing the selected Workflow's gates.

#### Scenario: User views the default workflow on a narrow screen

- **WHEN** the viewport is 320 pixels wide
- **THEN** all seven phases and review/return semantics remain visible in a
  vertical or wrapped reading order
- **AND** the page has no horizontal document overflow.

### Requirement: The open-source experience SHALL be accessible and bilingual

The overview SHALL use the existing `zh`/`en` localization authority with exact
key parity. It SHALL use semantic headings, native links/buttons, visible
focus, safe external-link attributes, a text equivalent for visual flows, and
non-essential motion that honors reduced-motion preferences.

#### Scenario: Language is switched

- **WHEN** the user switches between Chinese and English while on Overview
- **THEN** every product string changes without a raw translation key
- **AND** the current route and theme remain unchanged.

#### Scenario: Keyboard-only user navigates the page

- **WHEN** the user traverses the brand, calls to action, documentation links,
  and shell controls using Tab, Shift+Tab, Enter, and Space
- **THEN** focus order follows the visual reading order
- **AND** every focused control has a visible indication
- **AND** no interaction traps focus or requires a pointer.

#### Scenario: Reduced motion is enabled

- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** no meaning or content depends on animation
- **AND** ornamental transitions are removed or effectively instantaneous.

### Requirement: Documentation claims and links SHALL be verified

The repository SHALL provide a deterministic documentation check that fails
when canonical README/usage links are missing or when bounded claims introduced
by this Change drift from their current truth sources. The check SHALL cover at
least:

- the documented Node.js minimum;
- exact setup/update/runtime/dashboard command families;
- the production Dashboard port;
- the five operational views and separate overview;
- default and simple workflow step shapes;
- README language/community links.

The check SHALL NOT duplicate the full runtime parser or hard-code volatile
test counts as product truth.

#### Scenario: A documented file is renamed

- **WHEN** a canonical README or usage link points to a missing repository file
- **THEN** the documentation check fails with the source document and target.

#### Scenario: Production port drifts

- **WHEN** the documented default port differs from the server's current
  exported default
- **THEN** the documentation check fails before delivery.

#### Scenario: Operational navigation is changed

- **WHEN** the documented five operational views differ from
  `PRIMARY_VIEWS`
- **THEN** focused tests or the documentation check fail
- **AND** Overview is still verified as a separate brand-level view.

### Requirement: The repository SHALL expose maintainable community guidance

The repository SHALL provide contribution, conduct, support, and security
documents with real repository-relative or GitHub-owned actions. Security
guidance SHALL request private reporting for vulnerabilities, prohibit secrets
in public Issues, and avoid an invented response SLA.

#### Scenario: User wants to report a normal defect

- **WHEN** the reader opens `SUPPORT.md`
- **THEN** they are directed to a reproducible GitHub Issue with sensitive data
  removed
- **AND** troubleshooting and discussion paths are distinguished.

#### Scenario: Researcher finds a vulnerability

- **WHEN** the reader opens `SECURITY.md`
- **THEN** they are directed to GitHub's private vulnerability reporting path
  when available
- **AND** told not to disclose exploit details, credentials, prompts, tokens, or
  local traces in a public Issue.
