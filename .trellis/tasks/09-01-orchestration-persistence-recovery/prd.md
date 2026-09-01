# Durable orchestration persistence and recovery

## Goal

为编排看板提供崩溃安全、可恢复、带 CAS 的持久化快照与事件日志

## Requirements

This task depends on `09-01-canonical-orchestration-aggregate-v2`; the Ledger persists accepted v2 aggregate events and snapshots and must not define its own state semantics.

- Persist canonical `board-snapshot/v2` and `board-event/v2` records plus the normative `orchestration-recovery-report/v1` and `orchestration-idempotency/v1` contracts.
- Persist immutable command/event records and a complete board snapshot with atomic temp+rename/link publication, checksums and bounded reads.
- Enforce per-change lock and expected revision CAS; duplicate command IDs are idempotent and conflicting payloads fail closed.
- Recover only the last checksum-valid snapshot/event chain; classify interrupted leases and corrupt/incomplete files without guessing state.
- Provide an adapter over existing StateStore/TransitionRecordStore without changing `.pipeline.yaml` canonical semantics.

## Acceptance Criteria

- [ ] Concurrent appenders produce one monotonic revision chain; stale revisions return a typed conflict and zero writes.
- [ ] Crash injection before/after event and snapshot publication never exposes a half-written current state.
- [ ] Restart/recovery returns the same board revision and deterministic recovery report; expired runs are marked interrupted or safely requeued by policy.
- [ ] Duplicate command replay returns the original result; same command ID with a different payload is rejected.
- [ ] Bounded readers reject traversal, symlinks, oversized/corrupt JSON and unsupported schema versions without deleting data.
- [ ] Existing Kernel/StateStore tests remain green and migration/readiness reports legacy compatibility truthfully.
