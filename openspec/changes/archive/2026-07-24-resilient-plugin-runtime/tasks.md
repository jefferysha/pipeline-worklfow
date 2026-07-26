# Tasks

## Open

- [x] Record the agreed problem, scope, non-goals, acceptance signals, and initial architecture
  hypothesis.
- [x] Obtain review of the open artifacts before entering evidence-driven exploration.

## Explore

- [x] Map current installation, update, launcher, hook, router, persistence, and package contracts.
- [x] Validate the runtime-manager trust boundary against Tenon contract and Tenon runtime patterns; record an
  ADR with the explicit policy-deny versus runtime-degraded semantics.
- [x] Produce the reviewed Superpowers design with storage layout, transactions, migration,
  workflow ownership, and failure modes.

## Spec

- [x] Define OpenSpec delta requirements for managed releases, bootstrap dispatch, recovery-only
  execution, host setup/update, bundled skills, and workflow ownership.
- [x] Produce the implementation plan, including exact affected packages, compatibility paths,
  tests, build artifacts, and rollback verification.

## Build

- [x] Implement runtime domain contracts, codecs, locking/CAS, atomic release publication, and
  audited retention/recovery behavior.
- [x] Implement stable bootstrap/launcher and host-hook integration without direct mutable
  marketplace payload execution.
- [x] Integrate setup, update, automatic update, doctor, and host adapters with candidate staging
  and atomic activation.
- [x] Implement deterministic workflow-owner routing and explicit-resume semantics.
- [x] Add migration, regression, interruption, concurrency, and host contract tests; regenerate
  distributable bundles and update docs.
- [x] Recompute active payload integrity before bootstrap execution and reject forged releases.
- [x] Restrict degraded rollback authorization to the exact managed launcher identity.
- [x] Make activation/rollback audit ordering failure-safe and expose host-refresh failures.
- [x] Split the runtime release-store adapter below 500 lines and add negative regression tests.

## Verify

- [x] Run targeted unit/integration/failure-injection coverage and the required hook, adapter,
  skill, bundle, workflow, build, and oracle gates.
- [x] Review policy-boundary behavior to prove recovery cannot bypass OpenSpec, skills, review, or
  human confirmation.

## Ship

- [x] Apply the verified delta to the main OpenSpec capability documents and prepare release notes
  covering setup, auto-update, migration, rollback, and host trust.

## Archive

- [x] Archive the completed change with evidence links and a concise operational recovery guide.
