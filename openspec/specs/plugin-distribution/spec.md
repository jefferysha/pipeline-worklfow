# Single Plugin Distribution Specification

## Requirements

### Requirement: One release contains the complete pipeline product

Every published Pipeline Lite plugin release SHALL contain its CLI, seven-phase workflow, OpenSpec
document contract, mandatory skills, hooks, dashboard, AFK/tap/channel subsystems, templates, and
registered adapters. Selecting a host SHALL select installation ownership and SHALL NOT remove
other packaged product capabilities.

#### Scenario: A clean Codex user installs the plugin

- **WHEN** the user installs the release and runs `pipeline setup --codex`
- **THEN** the selected Codex installation exposes the complete default pipeline and bundled skills
- **AND** it does not require a separate workflow or mandatory-skill installation.

### Requirement: Setup and update require one explicit host

Setup and update SHALL require exactly one supported host selector. Native Codex and Claude
selectors SHALL use only that host's marketplace inventory. Registered non-native adapters SHALL
apply only the selected adapter and SHALL NOT claim native automatic-update ownership.

#### Scenario: Host selection is ambiguous

- **WHEN** setup receives zero selectors or more than one selector
- **THEN** it exits non-zero with examples such as `pipeline setup --codex`
- **AND** it does not modify any host or active runtime selection.

#### Scenario: One native host is selected

- **WHEN** the user runs `pipeline setup --codex`
- **THEN** setup resolves and activates only the Codex-reported package
- **AND** it does not configure Claude merely because Claude metadata is included in the release.

### Requirement: Native hosts activate a verified immutable runtime

A native host checkout SHALL be treated as a candidate rather than an executable trust root.
Setup/update SHALL reject incomplete or symlinked payloads, validate the CLI, hooks, manifests, and
skills, publish a content-addressed immutable release, and atomically select active and previous
verified releases before installing stable launchers.

#### Scenario: Candidate verification fails

- **WHEN** a selected host reports a missing, malformed, symlinked, or smoke-test-failing candidate
- **THEN** publication exits non-zero and preserves the active release and launchers
- **AND** runtime diagnostics identify the rejection.

#### Scenario: Active payload changes after publication

- **WHEN** the selected active payload digest no longer matches its manifest
- **THEN** normal execution is refused and status reports the active release invalid
- **AND** only exact stable rollback to a verified previous release remains authorized.

### Requirement: Releases support bounded host-owned updates

Native releases SHALL support `pipeline update --codex` and `pipeline update --claude`. Automatic
update SHALL be explicit opt-in, scoped to the selected host, bounded to once daily, executed
through the stable launcher, and visible through durable diagnostics. A successful update SHALL be
observed by a new host session.

#### Scenario: Automatic update fails

- **WHEN** host refresh or candidate validation fails during an opted-in automatic update
- **THEN** the active managed release remains selected
- **AND** an `update-rejected` event is visible through runtime status or doctor.

### Requirement: Mandatory workflow skills are bundled

Every skill token required by the default workflow SHALL resolve to a concrete first-party
`SKILL.md` in the same plugin release. External tools and third-party skills MAY be optional
extensions but SHALL NOT block creating, advancing, verifying, or archiving a default Change.

#### Scenario: Package verification finds a missing skill

- **WHEN** a mandatory registry token has no packaged skill directory or resolves externally
- **THEN** package verification fails before the release is activated.

### Requirement: Default workflow evidence remains generated and consumed

Packaging and updates SHALL preserve the digest-bound default workflow document contract:
proposal/design/tasks at Open; Superpowers design and ADR at Explore; delta spec and plan at Spec;
verification report at Verify; applied main spec receipt at Ship; and complete read receipts before
review transitions and Archive.

#### Scenario: A later phase has not read a changed document

- **WHEN** a required document is missing, stale, or lacks the current phase's read receipt
- **THEN** the phase guard rejects transition even if the file exists on disk.

### Requirement: Dashboard health identifies the active release

Native setup and successful update SHALL run or hand off the dashboard from the active immutable
release. The default dashboard port SHALL remain `18765`, and `/api/health` SHALL expose the exact
active release identifier.

#### Scenario: A new release takes dashboard ownership

- **WHEN** a verified release becomes active and setup completes
- **THEN** the dashboard responds on the configured port
- **AND** the health release ID equals runtime status's active release ID.

### Requirement: Dashboard health identifies the active machine-state scope

The managed Dashboard singleton SHALL identify both the active immutable release and the
canonical machine-state scope used for project registry, token, secrets and pidfile storage.
The health response SHALL expose an opaque, deterministic `stateScopeId` and SHALL NOT expose the
machine-state Home path. The identifier is an identity comparison value and SHALL NOT be accepted
as an authorization credential.

#### Scenario: Same release starts for a different state Home

- **GIVEN** a healthy Dashboard is listening on the configured port for state scope A
- **WHEN** the same immutable release is explicitly started with state scope B
- **THEN** the existing process is not reused
- **AND** takeover may proceed only after the reported PID is verified as the real loopback
  listener owner
- **AND** the new health response carries state scope B's identifier.

#### Scenario: Same release starts for the same state Home

- **GIVEN** a healthy Dashboard is listening for the requested state scope and release
- **WHEN** the managed launcher starts again
- **THEN** it reuses the existing process
- **AND** does not replace or duplicate the singleton.

#### Scenario: Legacy health has no state-scope identity

- **GIVEN** a prior Dashboard health response has no `stateScopeId`
- **WHEN** a scope-aware managed Dashboard starts
- **THEN** the legacy process is treated as a one-time migration takeover candidate
- **AND** listener ownership verification remains mandatory before signalling it.

#### Scenario: Managed startup waits for the exact intended process

- **WHEN** setup or update starts a Dashboard from an immutable release
- **THEN** readiness succeeds only when both `releaseId` and `stateScopeId` match the launcher
  expectation
- **AND** a browser is not opened for a process with a mismatched state scope.

### Requirement: Machine-state scope identity is canonical and path-private

The state-scope identifier SHALL be derived by one shared first-party primitive from a namespaced
canonical absolute state-Home path. Equivalent relative/trailing-slash inputs SHALL produce the
same identity. The health response, server log and pidfile SHALL NOT contain the state-Home path.

#### Scenario: Lexically equivalent state roots

- **WHEN** two inputs resolve to the same absolute path
- **THEN** they produce the same full-length versioned state-scope identifier.
