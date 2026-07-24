# Tasks

## Open

- [x] Record the agreed problem, scope, non-goals, acceptance signals, and initial architecture
  hypothesis.
- [ ] Obtain review of the open artifacts before entering evidence-driven exploration.

## Explore

- [ ] Map current installation, update, launcher, hook, router, persistence, and package contracts.
- [ ] Validate the runtime-manager trust boundary against Trellis and Comet patterns; record an
  ADR with the explicit policy-deny versus runtime-degraded semantics.
- [ ] Produce the reviewed Superpowers design with storage layout, transactions, migration,
  workflow ownership, and failure modes.

## Spec

- [ ] Define OpenSpec delta requirements for managed releases, bootstrap dispatch, recovery-only
  execution, host setup/update, bundled skills, and workflow ownership.
- [ ] Produce the implementation plan, including exact affected packages, compatibility paths,
  tests, build artifacts, and rollback verification.

## Build

- [ ] Implement runtime domain contracts, codecs, locking/CAS, atomic release publication, and
  audited retention/recovery behavior.
- [ ] Implement stable bootstrap/launcher and host-hook integration without direct mutable
  marketplace payload execution.
- [ ] Integrate setup, update, automatic update, doctor, and host adapters with candidate staging
  and atomic activation.
- [ ] Implement deterministic workflow-owner routing and explicit-resume semantics.
- [ ] Add migration, regression, interruption, concurrency, and host contract tests; regenerate
  distributable bundles and update docs.

## Verify

- [ ] Run targeted unit/integration/failure-injection coverage and the required hook, adapter,
  skill, bundle, workflow, build, and oracle gates.
- [ ] Review policy-boundary behavior to prove recovery cannot bypass OpenSpec, skills, review, or
  human confirmation.

## Ship

- [ ] Apply the verified delta to the main OpenSpec capability documents and prepare release notes
  covering setup, auto-update, migration, rollback, and host trust.

## Archive

- [ ] Archive the completed change with evidence links and a concise operational recovery guide.
