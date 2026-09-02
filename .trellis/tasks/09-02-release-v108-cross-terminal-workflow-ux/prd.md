# Release v1.0.8 and cross-terminal workflow UX

## Goal

Publish the current, locally accepted orchestration runtime as an immutable public
release, then define a low-friction client experience that lets beginners install
only the terminal adapters they need and lets advanced users select or author
Workflow, Track, and Pipeline definitions without losing provenance or live state.

## Confirmed repository facts

- `origin/main` and the working tree point at `bacd48f8e49c20df0c763b298e20d0935e004fa7`.
- The repository is still version `1.0.7`; `v1.0.7` points at an older commit.
- The protected release path is `release-candidate.yml` → `release-writer.yml` →
  `release.yml` → `release-public-acceptance.yml`; it requires the exact current
  `main` SHA, matching root/Codex/Claude versions, green canonical CI, a digest-bound
  payload, and real clean installation.
- Canonical CI currently fails before the code suites at `npm audit --audit-level=high`
  because the lockfile resolves `browserslist@4.28.5` with a high-severity advisory.
- `adapters/registry.yaml` already describes a fidelity matrix and adapter scripts for
  native hosts and degraded long-tail hosts. The top-level installer currently has a
  one-host command path for native Codex/Claude; non-native adapters are deployed by
  `tenon setup --<adapter>`.
- The Dashboard already has Workflow Policy, Track, Pipeline/board, orchestration
  state, SSE-backed snapshots, and custom editing primitives, but the installer has
  no graphical adapter picker or animated install journey.

## Requirements

### R1 — Immutable release

1. Publish `v1.0.8` (patch release chosen because the existing release acceptance
   fixtures derive the N-1 bridge from the patch component) only from the exact green
   `main` commit.
2. Synchronize all release identity surfaces required by the release workflow and
   installer, including root/workspace packages, plugin manifests, installer metadata,
   generated payloads, and release notes.
3. Upgrade the vulnerable resolved dependency without weakening the audit gate.
4. Verify the published release through the repository's public acceptance workflow
   and a real isolated Codex/Claude installation; do not mutate the user's global
   host configuration as a substitute for acceptance.

### R2 — Cross-terminal adapter installation

1. Treat the adapter registry as the single capability source for supported terminals,
   OS support, fidelity tier, prerequisites, install command, and rollback behavior.
2. Provide an installer UI that detects available terminals, explains capability
   differences in plain language, allows one or more adapter selections, and shows a
   deterministic preflight → download → configure → verify → rollback state machine.
3. Keep native marketplace installation and project-local degraded adapters distinct;
   never claim a static fallback is an equivalent hard hook.
4. Keep a fully scriptable/JSON path for CI, remote terminals, and users who do not
   want the GUI.

### R3 — Workflow, Track, and Pipeline choice

1. Default mode automatically infers the Track and proposes a versioned Pipeline from
   the request and project capabilities.
2. At Change creation, beginners may accept the recommendation; an advanced section
   may select a registered Workflow/Track/Pipeline or import a validated project/user
   definition.
3. Custom definitions must be versioned, fingerprinted, schema-validated, previewable,
   and frozen into the Change before execution. Invalid or unresolved definitions fail
   closed with an actionable error.
4. The UI must show the chosen identity and the exact Stage/Skill order before the
   first run; changing it creates a new revision rather than mutating running work.

### R4 — Realtime custom definition visibility

1. A saved project/user Workflow, Track, or Pipeline becomes visible to already-open
   clients through the existing snapshot/event stream without a full-page reload.
2. Clients reconcile by revision and fingerprint, display pending/accepted/rejected
   status, and never optimistically execute an uncommitted definition.
3. When a definition changes, the planner may automatically propose it for new Changes;
   active Changes continue using their frozen definition until an explicit replan.

### R5 — Safety and provenance

1. Every install, selection, resolution, execution, and reload is attributable to a
   user/project/revision and is replayable from the event chain.
2. External adapter code and artifact references remain behind explicit trust and
   resolver boundaries; unknown fields, unsafe paths, digest mismatches, and missing
   capabilities are rejected.
3. The system guarantees host materialization and injection of Skill inputs, while
   presenting model semantic consumption as validation evidence rather than an
   impossible claim about internal attention.

## Acceptance Criteria

- [ ] `v1.0.8` is an annotated stable release whose tag peels to the exact green main
      SHA and whose release assets pass the immutable payload and public acceptance
      checks.
- [ ] `npm audit --audit-level=high`, dependency-tree checks, full backend/frontend
      suites, build, adapter conformance, and real clean install pass for the release.
- [ ] A beginner can install one or more detected adapters through the GUI or JSON CLI,
      observe each state transition, and recover without leaving partial Tenon state.
- [ ] A new Change can use automatic Track/Pipeline inference or a validated custom
      definition; the frozen identity and Skill order are visible before execution.
- [ ] Editing/saving a project definition is observed by an already-open Dashboard via
      revisioned events; a running Change is not silently changed.
- [ ] Unsupported/degraded host capabilities are visibly labeled and never represented
      as native enforcement.

## Out of scope for this release task

- Replacing every host's native marketplace or inventing hooks a host does not expose.
- Arbitrary unreviewed remote code execution from a user-supplied adapter.
- Claiming that a neural model's internal attention can be proven by a receipt alone.
- Mutating or deleting the existing `v1.0.7` tag.

## Open questions

None blocking for the recommended path: use `v1.0.8`, keep automatic selection as the
beginner default, and expose custom definitions behind an advanced section with the
same validated/frozen contract used by the runtime.
