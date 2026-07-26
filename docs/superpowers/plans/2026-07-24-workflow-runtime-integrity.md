---
change: workflow-runtime-integrity
design-doc: docs/superpowers/specs/2026-07-24-workflow-runtime-integrity-design.md
track: backend
preset: full
---

# Workflow Runtime Integrity Implementation Plan

## Acceptance Contract

Implement the two delta specifications under
`openspec/changes/workflow-runtime-integrity/specs/`. Preserve all existing
Track IDs and project files. `free` is additive, explicit-only, and
non-automatable. `.pipeline/` is excluded from implementation fingerprints,
while all implementation files remain content-addressed.

## Build Stage 1 — Tracer Bullet: Kernel Identity to CLI

> This is the vertical slice. It establishes the domain policy, canonical
> validation, and externally observable CLI behavior before UI or hook work.

1. Add a failing workspace regression in
   `packages/kernel/src/workspace/fingerprint.test.ts` that freezes source,
   appends `.pipeline/codex-skill-receipts.jsonl`, and expects the same digest.
2. Add failing Track contract tests in
   `packages/kernel/src/tracks/builtins.test.ts`,
   `registry.test.ts`, `index.test.ts`, and CLI Track/init integration tests.
3. Update `packages/kernel/src/workspace/fingerprint.ts` so `.pipeline/` is an
   excluded top-level control boundary.
4. Add the built-in `free` Track after `simple`, with
   `allowed='*'`, pending review seed, no automation, coverage `none`, disabled
   routing, and no skill matrix.
5. Update serializer comments/order, CLI policy-template choices and exact
   list/show/init assertions.
6. Run:
   `npx vitest run packages/kernel/src/workspace/fingerprint.test.ts packages/kernel/src/tracks packages/cli/src/tracks.integration.test.ts packages/cli/src/init-workflow.integration.test.ts`.

**Context boundary — 此处建议 `/clear`.**

## Build Stage 2 — Router Projection and Normal Conversation

1. Add failing router projection/cache tests proving disabled `free` is carried
   as a manual candidate, never scored, and old schema rows are rejected.
2. Extend `RouterTrackProjection` with explicit routability and update the
   data-only cache to its next fail-closed version.
3. Update `hooks/router.sh` parsing, scoring, candidate emission, and explicit
   `自由模式 / free mode` intent handling. Clean projects must retain ordinary
   automatic routing unless free was explicitly requested.
4. Update the root `skills/pipeline/SKILL.md` selection contract so an exact
   free/Workflow pair is validated before creation and free never inherits a
   standard profile matrix.
5. Update hook fixtures and run `bash tools/test-hooks.sh` plus focused router
   kernel/CLI tests.

**Context boundary — 此处建议 `/clear`.**

## Build Stage 3 — Dashboard and Distribution

1. Add dashboard tests that router preview shows `free`, an unmatched manual
   Create Change flow falls back to free rather than chat, and selecting free
   lists default plus project Workflows.
2. Update dashboard labels, candidate presentation, and any onboarding/help
   copy that describes executable Track choices.
3. Update server/CLI tests with the additive six-built-in registry.
4. Update comments, README/contracts, templates, packaged skills, and bundle
   fixtures that encode the five-Track assumption.
5. Run `npm run typecheck:web`, focused dashboard/server tests, and
   `npm run build:web`.

**Context boundary — 此处建议 `/clear`.**

## Build Stage 4 — Real Recovery and Full Validation

1. Run kernel, CLI, server, dashboard, hook, adapter, skill, bundle, oracle, and
   complete build/test gates.
2. Resume a fixture-backed custom Workflow from Build and confirm a Verify
   receipt no longer changes the frozen baseline.
3. Complete its Verify/Ship/Archive lifecycle and inspect the Dashboard status
   projection.
4. Exercise a fresh `free` custom Workflow Change and a bounded simple task to
   prove the three execution choices remain distinct.
5. Update the verification report with exact commands, results, screenshots,
   review receipts, and residual limitations.

## Compatibility, Rollout, and Rollback

- Rollout through the existing immutable runtime update mechanism; old project
  Track files require no migration.
- The router cache schema bump forces one safe regeneration.
- Rollback is a runtime release rollback; Changes created with `track=free`
  require the new runtime and must fail closed on an older release rather than
  silently map to chat/backend.
- No new dependency, database, network service, or secret is introduced.

## Prototype Decision

No throwaway prototype is required. Both changes extend existing kernel
contracts with direct failing tests, and the observed receipt replay already
proves the fingerprint cause. The router cache change is best validated through
its existing encoder/parser fixtures rather than a separate prototype.
