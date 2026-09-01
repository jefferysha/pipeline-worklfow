# CLI, observability and release hardening — implementation

1. Add CLI start/status/watch and pause/resume/approve/retry/cancel/replan commands with JSON/human output.
2. Add audit/metrics sink, redaction, quotas, rate/concurrency/lease/retry limits and graceful shutdown instrumentation.
3. Add golden end-to-end fixture plus failure/recovery/security matrix and redundancy report projection.
4. Add migration/readiness, backup/restore and release/rollback smoke scripts; ensure generated dist is synchronized.
5. Run complete build, typecheck, unit/integration/web/E2E, architecture/comments, openspec and release workflow checks.

Rollback: mark new capabilities unavailable, preserve data and revert binary/assets; never delete user repository or evidence.
