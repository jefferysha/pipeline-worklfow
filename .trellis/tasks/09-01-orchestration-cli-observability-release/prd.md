# CLI, observability and release hardening

## Goal

补齐 CLI parity、端到端验收、指标审计、安全限额和发布运行保障

## Requirements

- Add CLI start/status/watch and control commands as thin calls to the Server/application contract with JSON and human output.
- Emit structured audit/metrics for selection, execution, validation, intervention, latency, retry, cost and redundancy analysis without sensitive payloads.
- Add golden end-to-end fixtures, crash/recovery tests, migration/readiness checks, backup/restore instructions and release smoke tests.
- Enforce output/body/graph/concurrency/retry/lease/path/network limits, graceful shutdown and explicit unavailable capability reporting.
- Keep generated bundles, package versions, install/update flows and rollback behavior consistent with the production release.

## Acceptance Criteria

- [ ] CLI and Dashboard report the same revision/state; watch reconnects and conflict handling are deterministic.
- [ ] Golden path and failure matrix run in CI without network credentials; credential-dependent checks are explicit skips.
- [ ] Metrics/audit fields are bounded and redacted; a report can classify essential, conditional, redundant and unsafe stages from real runs.
- [ ] Readiness fails closed on schema incompatibility, missing permissions, corrupt storage or stale release assets.
- [ ] Backup/restore and upgrade/rollback smoke tests preserve canonical evidence and never delete user changes.
- [ ] Full build, typecheck, test, architecture, comments, E2E and release checks are green or have a recorded, actionable exception.
