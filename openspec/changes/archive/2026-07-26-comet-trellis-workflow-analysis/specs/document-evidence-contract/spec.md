# Document Evidence Contract Delta

## MODIFIED Requirements

### Requirement: Evidence status SHALL be observable in the dashboard and health checks

The change snapshot SHALL include a read-only document-evidence projection with
required records, current/stale status, producer, and phase read receipts. The
dashboard SHALL present this projection next to a Change's phase Todo without
inventing completed artifacts.

Doctor and host adapters SHALL report the exact Selected Skill Root used for
execution and evidence. They SHALL distinguish a Skill available from that
native immutable root, a static-only project projection, a same-digest
duplicate projection, a different-digest shadow conflict, and an inactive
historical cache. They SHALL NOT require project `.agents/skills` links when
native plugin discovery is authoritative.

#### Scenario: Dashboard shows missing document evidence

- **WHEN** a governed Change has not registered a required artifact for its
  current exit
- **THEN** the Dashboard labels the artifact as missing and names the phase that
  requires it.

#### Scenario: Native Codex discovery is sufficient

- **GIVEN** Codex has one verified native pipeline-lite Selected Skill Root
- **WHEN** doctor evaluates mandatory Skill discoverability
- **THEN** it reports the mandatory Skills discoverable from that root
- **AND** it does not require or create project `.agents/skills` links.

#### Scenario: Static adapter is the only available discovery mechanism

- **GIVEN** no native pipeline-lite Selected Skill Root exists
- **WHEN** an explicitly selected static adapter exposes conflict-safe project
  links
- **THEN** doctor reports the project projection as the sole active Skill root.

## ADDED Requirements

### Requirement: Artifact producer authorization SHALL survive disabled automatic orchestration

A Track MAY disable automatic Skill matrix injection while retaining a named
Skill profile for explicit document and artifact production. In that case,
`artifact register` SHALL validate its producer against the profile's
phase-specific allowlist. It SHALL NOT treat `matrix=false` as an empty
authorization set, and it SHALL NOT enable automatic Skill gating as a side
effect.

#### Scenario: Free Verify registers its governed report

- **GIVEN** the free Track has `matrix=false` and profile `free`
- **AND** the Verify profile allows `verification-before-completion`
- **WHEN** that Skill registers `verification_report`
- **THEN** artifact registration succeeds
- **AND** ordinary free-Track Skill orchestration remains disabled.
