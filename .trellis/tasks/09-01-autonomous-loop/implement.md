# Production autonomous development platform — implementation plan

## Dependency-ordered delivery

1. **Canonical Orchestration Aggregate v2** (`canonical-orchestration-aggregate-v2`)
   - Freeze all v2 schemas, states, commands, events, effects, guards and compatibility projections.
   - Prove command decision and event fold determinism before any storage protocol is added.
2. **Durable Kernel/application repository** (`orchestration-persistence-recovery`)
   - Define durable event/snapshot schemas, codecs, checksums and bounded readers.
   - Add atomic append + snapshot publication, revision CAS, idempotent command IDs and recovery report.
   - Prove crash points, concurrent writers, corrupted temp files and legacy compatibility.
3. **Automatic planner and catalog** (`automatic-planning-routing`)
   - Capture repository context; connect provider proposal to normalized assessment.
   - Build user/custom Skill and MCP descriptor catalog, deterministic resolver and frozen WorkGraph planner.
   - Record candidate/rejection rationale and clarification blockers; never infer a fixed scene enum.
4. **Persistent scheduler and runtime adapters** (`persistent-execution-adapters`)
   - Move v1 execution sequencing behind the durable repository.
   - Add leases, heartbeat, timeout, orphan recovery, bounded retries, cancel and validator/gate handoff.
   - Integrate existing Automation runner/sandbox through ports; preserve opaque output policy.
5. **Server control plane** (`orchestration-server-api`)
   - Wire repository and scheduler into authenticated HTTP/SSE routes.
   - Add idempotent typed commands, conflict responses, replay cursors, readiness and metrics.
6. **Dashboard** (`production-orchestration-dashboard`)
   - Consume the typed snapshot/event client, render board lanes/detail panels and output evidence.
   - Add safe controls with confirmation, stale-revision recovery, reconnect and accessibility coverage.
7. **CLI/observability/release** (`orchestration-cli-observability-release`)
   - Add CLI parity and JSON output, structured metrics/audit and golden E2E fixture.
   - Add migration/readiness, backups, graceful shutdown, security/resource limits, packaging and rollback checks.
8. **Parent integration gate**
   - Run full build/type/test/architecture/comments/security/E2E/release checks.
   - Validate no false completion, no unbounded output, no stale writes and no unclaimed external side effect.

## Required validation

```bash
npm run build
npm run check:architecture
npm run check:comments
npm run typecheck:web
npm run test:web
npx vitest run packages/kernel/src packages/automation/src packages/server/src packages/cli/src
npm run check:openspec
npm run check:release-workflows
git diff --check
```

Child tasks must add focused crash/CAS/security tests and record exact failures. The parent cannot be called production-ready if only targeted tests pass.

## Risk and rollback points

- Persisted schema or reducer changes: stop and return to planning if Kernel cannot express the transition; do not add a parallel state engine.
- Planner uncertainty: disable automatic candidate selection and leave explicit user bindings usable.
- Executor/validator instability: keep the Change blocked or waiting-input; never downgrade the gate.
- Server/Dashboard compatibility: ship additive endpoints and feature-capability flags; old clients receive a truthful unavailable state.
- Migration/release failure: retain old snapshot/event files, disable scheduler, and use replay/backup to restore the previous binary.
