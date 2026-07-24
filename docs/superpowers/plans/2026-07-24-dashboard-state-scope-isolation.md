---
change: dashboard-state-scope-isolation
design-doc: docs/superpowers/specs/2026-07-24-dashboard-state-scope-design.md
track: backend
---

# Dashboard State Scope Isolation Implementation Plan

## Acceptance target

An immutable release started on 18765 can reuse only a process serving the same canonical
machine-state scope. A different `PIPELINE_DASHBOARD_HOME` safely takes over and CLI readiness
cannot accept the previous process.

## Build subphase 1 — tracer bullet: identity to managed readiness

This vertical slice spans the shared identity primitive, server health, singleton decision and CLI
readiness with one focused test at every seam.

1. Add `machineStateScopeId(home)` to `packages/kernel/src/machine-state-scope.ts`.
   - Canonicalize with `path.resolve`.
   - Hash the namespaced UTF-8 value with SHA-256.
   - Return `sha256-v1-<64 lowercase hex>`.
   - Export from `packages/kernel/src/index.ts`.
   - Test equivalent paths, different paths, stability and absence of plaintext.
2. In `packages/server/src/paths.ts`, canonicalize `ServerPaths.home`.
3. Extend `HealthInfo` and `DashboardServerOptions` in `packages/server/src/types.ts`; have
   `packages/server/src/server.ts` emit `stateScopeId`.
4. Pass the current identifier through `packages/server/src/main.ts`.
5. Extend `decidePreemption` in `packages/server/src/preempt.ts` so a missing/mismatched scope
   precedes the existing version/release logic; keep `preemptOldServer` unchanged.
6. Extend `DashboardRuntime.waitForHealthyServer` and managed startup in
   `packages/cli/src/commands/dashboard.ts` so readiness requires the current state-scope ID.

Verification:

`pnpm vitest run packages/kernel/src/machine-state-scope.test.ts packages/server/src/preempt.test.ts packages/server/src/server.test.ts packages/cli/src/commands/dashboard.test.ts`

**Subphase boundary — 此处建议 /clear**

## Build subphase 2 — compatibility and lifecycle tests

1. Update server health tests to prove the additive field and no path disclosure.
2. Add preemption table cases for matching, mismatching and legacy scope identities.
3. Update CLI runtime fakes to assert the expected state-scope identity reaches readiness.
4. Build the release bundle and run a real fixed-port process test:
   - start release with state Home A;
   - start the same release with state Home B;
   - assert PID changed and health identity is B;
   - start B again and assert PID remains unchanged.

Verification:

`pnpm --filter @pipeline-lite/kernel test && pnpm --filter @pipeline-lite/server test && pnpm --filter @pipeline-lite/cli test`

**Subphase boundary — 此处建议 /clear**

## Build subphase 3 — repository gates and first-install replay

1. Run typecheck/build/package verification.
2. Re-run the isolated `install.sh --codex --auto-update` simulation.
3. Verify the new process owns 18765, snapshot roots belong to the isolated registry, and the
   browser opens that exact Dashboard.
4. Continue the custom Track, default frontend and AFK PM acceptance chains.

Verification:

`pnpm build && pnpm test && bash tools/verify-skills.sh && bash tools/test-hooks.sh`

## Compatibility and rollback

- `/api/health.stateScopeId` is additive; older clients ignore it.
- A legacy server without the field is replaced once by the new server.
- Rollback is the existing managed-runtime rollback; the previous release may replace the new
  server using the same listener-ownership guard.

## Prototype decision

No disposable prototype is inserted. The unknown was already reproduced against the real released
bundle, the listener-ownership primitive is existing tested code, and the tracer bullet directly
tests the only new identity seam. This conservative decision is recorded under the user's active
continuous-execution authorization.
