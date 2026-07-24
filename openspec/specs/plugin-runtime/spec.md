# Managed Plugin Runtime Specification

## Requirements

### Requirement: Native installation activates a verified managed release

For `pipeline setup --codex` and `pipeline setup --claude`, the system SHALL treat the native
host's reported plugin root as a candidate. It SHALL stage and verify that candidate before
publishing a managed runtime release, and it SHALL install only the selected native-host adapter.
All default-workflow skills distributed in the plugin SHALL remain available from the selected
release without a second workflow package or external skill install.

#### Scenario: First native installation succeeds

- **WHEN** a user runs `pipeline setup --codex` and the host reports a complete plugin root
- **THEN** the system validates the candidate, publishes one managed release, writes stable
  `pipeline` and `pipeline-hook` launchers, and reports the required Codex hook-trust step
- **AND** it does not modify Claude configuration.

#### Scenario: Candidate validation fails during setup

- **WHEN** the host reports a candidate with a missing bundle, malformed hook, invalid manifest,
  symlinked payload entry, or failed CLI smoke check
- **THEN** setup exits non-zero and does not change active release selection or either launcher
- **AND** it reports the specific verification failure.

### Requirement: Active runtime selection is atomic and recoverable

The system SHALL store releases in immutable content-addressed directories and SHALL atomically
replace a selection record containing an active release and optional previous verified release.
All setup, update, rollback, and retention mutations SHALL run under a cross-process lock and
append an audit record. The active and previous release SHALL never be pruned.

#### Scenario: Candidate update activates atomically

- **WHEN** `pipeline update --claude` obtains and verifies a new candidate
- **THEN** the candidate is fully published before the active selection points to it
- **AND** the former active release becomes the previous verified release.

#### Scenario: Update is interrupted before selection publication

- **WHEN** staging or validation fails, or the process stops before selection publication
- **THEN** the previously active release remains selected and executable
- **AND** incomplete staging is not considered a managed release.

### Requirement: Host hooks use a stable bootstrap ABI

The distributed native host hook manifest SHALL invoke the stable `pipeline-hook` launcher and
SHALL NOT execute a hook directly from `${PLUGIN_ROOT}` or `${CLAUDE_PLUGIN_ROOT}`. The bootstrap
SHALL set the selected release root when invoking its payload hook so child hooks cannot
accidentally resolve assets from the mutable marketplace checkout.

#### Scenario: Marketplace checkout changes after activation

- **WHEN** a host marketplace cache is refreshed or replaced after a release is active
- **THEN** an existing host hook dispatches through the managed active release
- **AND** it does not execute a hook from the changed cache path.

### Requirement: Runtime corruption has recovery-only authority

If the bootstrap cannot validate or load the active release, it SHALL distinguish that condition
from a valid payload policy denial. It SHALL deny normal write-capable project operations and
accept only the exact local command `pipeline runtime repair --rollback`. That recovery operation
SHALL validate and select only the persisted previous verified release; it SHALL not accept a path,
download arbitrary code, delete project markers, or modify OpenSpec workflow state.

#### Scenario: Previous release repairs an invalid active release

- **WHEN** active release integrity validation fails and a valid previous release exists
- **THEN** `pipeline runtime repair --rollback` atomically selects the previous release
- **AND** records a rollback audit event
- **AND** normal policy enforcement resumes from that release.

#### Scenario: No verified recovery release exists

- **WHEN** active release validation fails and there is no valid previous release
- **THEN** the recovery command exits non-zero with a reinstall instruction
- **AND** the bootstrap does not silently allow ordinary mutation.

### Requirement: Auto-update preserves the active runtime

The opt-in SessionStart auto-update path SHALL call the stable launcher, not a bundle located by
the host plugin root. A failed host refresh or candidate validation SHALL retain the active managed
release and write a diagnostic/audit record. A successful update SHALL affect a new host session
only.

#### Scenario: Auto-update candidate fails verification

- **WHEN** an opted-in automatic update downloads an incomplete candidate
- **THEN** the current active release and stable launcher remain unchanged
- **AND** the failure is visible through runtime status or doctor diagnostics.

### Requirement: Workflow routing never revives an unrelated change

The router SHALL assign exactly one explicit workflow owner to a request. A new objective SHALL
produce a new change even when `.pipeline-active` or multiple unarchived changes exist. Only an
explicit resume request may bind to an eligible named or uniquely selectable change; modification
time SHALL NOT be used to bind a new request.

#### Scenario: New objective with stale active pointer

- **WHEN** an old active pointer exists and the user submits a new development objective
- **THEN** the router emits new-change intent and clears the old binding
- **AND** the pipeline creates a fresh change rather than reusing old tasks or phase state.
