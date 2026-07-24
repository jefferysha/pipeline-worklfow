# Tasks: Workflow Runtime Integrity

## Open

- [x] Capture the fingerprint self-invalidation problem and the free-mode
  execution requirement.
- [x] Record initial architecture, policy, compatibility, and acceptance
  hypotheses.

## Explore

- [x] Trace fingerprint, Track registry, router cache, dashboard creation, and
  packaged skill contracts.
- [x] Decide the stable free-mode identity and normal-conversation selection
  contract.
- [x] Produce Superpowers design and ADR evidence.

## Spec

- [x] Define OpenSpec requirements for control-plane-stable fingerprints and
  global free-mode Workflow entry.
- [x] Produce an implementation and verification plan.
- [x] Review the proposal, design, requirements, and plan for gaps.

## Build

- [x] Add failing kernel and CLI regressions for fingerprint stability and
  free Track identity.
- [x] Exclude `.pipeline/` from implementation fingerprints and add the
  receipt-write regression.
- [x] Add built-in `free` Track semantics throughout kernel and CLI contracts.
- [x] Surface free-mode Workflow choice in dashboard and normal-conversation
  dispatch without making it routable.
- [x] Update bundled skills, docs, fixtures, cache schema, release-owned cache
  contract validation, and compatibility tests.
- [x] Exclude all project-owned verifier/runtime roots and bounded QA snapshots
  after the first Verify run exposed a second self-invalidation path.
- [x] Close the explicit free/default phase-driver and guard lifecycle through
  Archive without inheriting PM or engineering delivery fields.
- [x] Close custom Workflow `archive` terminal state canonically without
  forcing a cyclic user-authored transition.

## Verify

- [x] Run focused kernel, CLI, server, dashboard, hook, adapter, bundle, and
  install tests.
- [x] Re-run the real pet-adoption Change through Verify using the repaired
  in-place baseline.
- [x] Record independent review and verification evidence.

## Ship

- [x] Apply both approved OpenSpec capability deltas and complete delivery
  checks.

## Archive

- [ ] Archive the completed Change with retained decisions and evidence.
