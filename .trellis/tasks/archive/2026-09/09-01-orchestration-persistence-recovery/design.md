# Durable orchestration persistence and recovery — design

## Boundary

Add a `OrchestrationRepository` adapter in Kernel around the existing `applyBoardCommand`, `StateStore` lock and immutable transition-record primitives. Kernel remains the only reducer; the repository owns serialization, atomic publication, idempotency and recovery.

## Records and flow

```text
typed command → lock(change) → read snapshot/head → expected_revision + command_id check
  → applyBoardCommand → append immutable event → atomic snapshot publish → notify readers
```

Store under the change directory in a dedicated versioned namespace. Snapshot contains the complete bounded `BoardSnapshotV2`; events contain command metadata, revision, state digest and bounded effects. Temp files use exclusive creation and are never treated as current. Read validates schema, digest, monotonic revision and event linkage.

## Concurrency/recovery

All appends use the existing non-reentrant change lock. A stale revision returns a typed conflict without writes. Duplicate command IDs return the original append result; the same ID with another digest is a conflict. Recovery ignores incomplete temps, replays only a valid contiguous chain, reports the first invalid boundary, and never guesses a missing state. Lease recovery is exposed to the scheduler rather than performed inside the reducer.

## Compatibility

Existing `.pipeline-run/current.json`, transition records and `.pipeline.yaml` remain readable. New records are additive and can be disabled by readiness. A schema upgrade requires an explicit migration reader and backup marker.
