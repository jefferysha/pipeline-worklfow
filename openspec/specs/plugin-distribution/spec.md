# Single Plugin Distribution Specification

## Purpose

Define a complete, immutable, host-selectable plugin release with one
canonical Skill content root and ownership-safe installation behavior.

## Requirements

### Requirement: One release contains the complete pipeline product

Every published Tenon plugin release SHALL contain its CLI, seven-phase workflow, OpenSpec
document contract, mandatory skills, hooks, dashboard, AFK/tap/channel subsystems, templates, and
registered adapters. Selecting a host SHALL select installation ownership and SHALL NOT remove
other packaged product capabilities.

#### Scenario: A clean Codex user installs the plugin

- **WHEN** the user installs the release and runs `tenon setup --codex`
- **THEN** the selected Codex installation exposes the complete default pipeline and bundled skills
- **AND** it does not require a separate workflow or mandatory-skill installation.

### Requirement: Setup and update require one explicit host

Setup and update SHALL require exactly one supported host selector. Native Codex and Claude
selectors SHALL use only that host's marketplace inventory. Registered non-native adapters SHALL
apply only the selected adapter and SHALL NOT claim native automatic-update ownership.

#### Scenario: Host selection is ambiguous

- **WHEN** setup receives zero selectors or more than one selector
- **THEN** it exits non-zero with examples such as `tenon setup --codex`
- **AND** it does not modify any host or active runtime selection.

#### Scenario: One native host is selected

- **WHEN** the user runs `tenon setup --codex`
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

Native releases SHALL support `tenon update --codex` and `tenon update --claude`. Automatic
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

### Requirement: One plugin release SHALL expose one canonical Skill root

The repository `skills/<id>/SKILL.md` tree SHALL be the only maintained source
of first-party Skill content. Packaging SHALL copy that tree once into the
immutable plugin payload, and a running native installation SHALL expose
exactly one Selected Skill Root for that release. Manifests, registries,
workflows, tests, and documentation SHALL reference canonical Skill IDs rather
than duplicate Skill content.

#### Scenario: Native Codex setup is repeated

- **WHEN** `tenon setup --codex` or its idempotent update path is run more
  than once
- **THEN** exactly one immutable selected payload Skill root is discoverable
- **AND** no same-name project or user projection is added.

#### Scenario: Package verification finds duplicate Skill content

- **WHEN** two maintained payload paths claim the same canonical Skill ID
- **THEN** release verification fails before activation
- **AND** identifies both paths.

### Requirement: Native and static Skill projections SHALL be mutually exclusive

The Codex compatibility adapter MAY create project `.agents/skills` links only
for a host that cannot discover the native tenon plugin. When a verified
native Selected Skill Root exists, the adapter SHALL skip project Skill
projection. Switching modes SHALL not leave both roots discoverable.

#### Scenario: Adapter detects a native installation

- **GIVEN** a verified native tenon Selected Skill Root
- **WHEN** the compatibility adapter runs for the project
- **THEN** it installs no tenon project Skill links
- **AND** diagnostics report the native selected root as authoritative.

#### Scenario: Static-only host needs compatibility discovery

- **GIVEN** no native tenon plugin capability or selected root exists
- **WHEN** static adapter installation is explicitly selected
- **THEN** the project projection is the sole tenon discovery root
- **AND** rerunning installation remains idempotent.

### Requirement: Legacy duplicate migration SHALL be ownership-safe

A migration from static projection to native discovery SHALL remove only
tenon-owned symlinks whose lexical target and resolved target match the
adapter's expected source Skill. It SHALL never delete a real directory, a user
file, or a foreign symlink. Ambiguous ownership SHALL fail closed with an
actionable diagnostic.

#### Scenario: Owned legacy links are removed during native migration

- **GIVEN** a project Skill link is a symlink created by the compatibility
  adapter and still resolves to its exact expected source
- **WHEN** native discovery becomes authoritative
- **THEN** the migration may remove that link
- **AND** records the selected native root.

#### Scenario: User-owned content has the same Skill ID

- **GIVEN** the project path is a real directory or points outside the expected
  adapter source
- **WHEN** migration encounters the same canonical Skill ID
- **THEN** the path is preserved
- **AND** setup reports a shadow conflict instead of overwriting or deleting it.

### Requirement: Skill diagnostics SHALL distinguish duplicate projection and shadow conflict

Doctor and installation checks SHALL enumerate all relevant discovery roots,
compute canonical content digests, and report the Selected Skill Root. Multiple
roots with the same ID and digest SHALL be reported as
`duplicate-projection`; the same ID with different digests SHALL be reported as
`shadow-conflict` and SHALL fail closed for execution. Historical cache roots
SHALL not be silently added to the active candidate set.

#### Scenario: Same content appears in two discovery roots

- **WHEN** the same canonical Skill ID and digest are discoverable from native
  and project roots
- **THEN** doctor reports `duplicate-projection`
- **AND** selects only the native canonical root
- **AND** recommends or performs only ownership-safe convergence.

#### Scenario: Different content shadows a canonical Skill

- **WHEN** one Skill ID resolves to different digests in discoverable roots
- **THEN** doctor reports `shadow-conflict` with both sources
- **AND** evidence and execution fail closed until the conflict is resolved.

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
