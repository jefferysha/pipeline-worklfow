# ADR: derive document evidence slots from kind and governed path

## Context

Using only `kind` as identity repairs moved singleton documents but loses all except the latest
capability delta. Using raw `(kind,path)` preserves multiple deltas but leaves stale moved paths
that permanently block later phases.

## Decision

Derive an internal slot key. Singleton kinds use their kind. `delta-spec` uses the capability
segment from its strict governed path. Registration replaces records only within that slot.

## Alternatives

- Ledger v2 with an explicit slot field: clearer on disk, but requires migration and dual readers.
- Append-only records plus delete command: adds mutable operator workflow and can still leave stale
  evidence behind.

## Consequences

The v1 schema remains readable, multi-capability evidence is complete, and a moved file converges
without manual ledger surgery. Path validation becomes part of slot derivation and must fail
closed.
