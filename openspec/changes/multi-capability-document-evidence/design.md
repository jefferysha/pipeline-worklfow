# Design

## Initial hypothesis

Document identity needs two levels:

- Singleton kinds use the kind itself as their slot key.
- `delta-spec` uses `delta-spec:<capability>`, where capability is derived from the governed path
  `openspec/changes/<change>/specs/<capability>/spec.md`.

The ledger format can remain version 1 because each record already stores kind and path; slot
identity is a deterministic interpretation, not a persisted schema field.

## Risks to validate

- A malformed, symlinked, or aliased delta path must fail closed instead of creating a slot.
- Ordinary registration must preserve unrecognized legacy records; reads remain blocked until an
  explicit migration names the source and an exact-digest canonical target.
- Evidence evaluation must require and display every delta record, not merely one record per kind.
- Singleton path moves must continue removing stale records.

## Explored decision

Use a deterministic internal slot key without changing the ledger schema. Singleton kinds use the
kind; `delta-spec` uses the capability segment from its strict governed path. This preserves
multi-capability evidence and lets same-capability rewrites converge.

Legacy repair uses `pipeline document migrate-delta <change> <legacy-path> <canonical-path>`.
Source-only migration preserves producer, recorded timestamp, digest, and receipts. If the target
slot already exists, metadata must match and only compatible receipts from different phases may be
merged; provenance or same-phase receipt conflicts fail before publication. The command runs under
the Change lock, uses atomic ledger publication, and is byte-level idempotent.
