# Workspace Verification Integrity

## Requirements

### Requirement: In-place baselines SHALL exclude workflow control state

An in-place Build baseline SHALL fingerprint implementation content and SHALL
exclude the project-local `.pipeline/` control plane. This exclusion includes
registries, generated caches, session projections, hook configuration,
receipts, and future control records below that directory.

#### Scenario: Verify receipt does not invalidate Build

- **GIVEN** an in-place Build freezes a valid workspace baseline
- **WHEN** Verify appends required skill evidence under `.pipeline/`
- **THEN** the current workspace fingerprint remains equal to the frozen
  baseline.

#### Scenario: Implementation changes still invalidate Build

- **GIVEN** an in-place Build freezes a workspace baseline
- **WHEN** source, executable mode, directory structure, or a tracked symlink
  target changes outside excluded control/evidence/cache paths
- **THEN** the current fingerprint differs from the frozen baseline.

### Requirement: Control and verifier exclusion SHALL follow ownership

The baseline policy SHALL exclude the `.pipeline/` directory as a boundary. It
SHALL also exclude project-owned, ignored verifier and agent runtime roots,
including `.playwright-tmp/`, `.playwright-mcp/`, `.superpowers/`,
`.worktrees/`, `.agents/`, `.codex/`, `.impeccable/`, and `.github/hooks/`.
Bounded root-level browser QA snapshots declared by the project SHALL be
excluded without excluding shipped screenshots below product directories.
The policy SHALL NOT rely on an allowlist of current receipt or log filenames.

#### Scenario: A new control record is introduced

- **WHEN** a future runtime version writes a new file below `.pipeline/`
- **THEN** that write does not require a fingerprint-code change
- **AND** canonical Track, Workflow, state, and revision validators remain
  responsible for the integrity of that control record.

#### Scenario: Browser verification writes temporary evidence

- **GIVEN** an in-place Build has frozen its implementation baseline
- **WHEN** Playwright updates a script, log, screenshot, or browser state below
  a project-owned verifier root
- **THEN** the implementation fingerprint remains unchanged.

#### Scenario: A shipped screenshot changes

- **WHEN** an image below a shipped product directory such as
  `design-demos/shots/` changes
- **THEN** the implementation fingerprint changes.

### Requirement: Fingerprint capture SHALL remain deterministic and fail loud

The existing content-addressed encoding, source/config inclusion, symlink
non-following behavior, race detection, and unsupported-entry rejection SHALL
remain unchanged.

#### Scenario: A file races with capture

- **WHEN** an included file changes while its fingerprint record is being read
- **THEN** capture fails with a diagnostic naming the relative path
- **AND** no baseline is returned.
