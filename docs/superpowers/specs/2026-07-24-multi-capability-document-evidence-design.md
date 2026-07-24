# Multi-capability document evidence design

## Outcome

A governed Change may own several delta specifications. Every capability must remain independently
hash-bound and readable through later phases, while singleton documents still replace stale moved
paths.

## Options considered

1. Persist an explicit `slot` field and bump the ledger schema.
2. Keep every `(kind,path)` forever and add deletion commands.
3. Derive a stable slot from the existing kind and governed path.

Option 3 is selected. It repairs existing version-1 ledgers without migration and preserves the
current external JSON schema.

## Slot rules

- Singleton kinds: slot is the kind.
- `delta-spec`: slot is `delta-spec:<capability>`, derived only from
  `openspec/changes/<change>/specs/<capability>/spec.md`.
- `applied-spec`: remains a singleton application receipt that lists all source/target pairs.
- Invalid or ambiguous delta paths fail closed during registration.
- Lexical and real project-relative paths must match, so parent symlinks cannot manufacture slots.

## State and invariants

- Re-registering a singleton removes every legacy record of that singleton kind.
- Re-registering a delta removes only records resolving to the same capability slot.
- Records in different capability slots coexist and each receives its own exact-hash read receipt.
- Evidence evaluation reports every stored record for a required multi-record kind.
- Ordinary registration never deletes an unrecognized legacy delta record.
- Read and evidence evaluation block on unrecognized legacy records.
- `document migrate-delta` replaces one explicitly named legacy record only when the canonical
  target has the same digest; it preserves provenance/receipts and is idempotent.

## Verification

- Unit: singleton move, same-capability delta rewrite, historical backfill, parent-symlink
  rejection, lossless legacy migration, and two-capability coexistence.
- Integration: document status/read after registering two delta specs.
- Regression: full suite, hooks, adapters, bundle, oracle, and frozen workspace fingerprint.

```coverage
touches:
L1_api:      waived -> no public API shape changes
L2_data:     filled -> #Slot-rules
L3_rules:    filled -> #Slot-rules
L4_state:    filled -> #State-and-invariants
L5_errors:   filled -> #Slot-rules
L6_security: waived -> no auth or secret boundary changes
L7_perf:     waived -> bounded per-change record scan remains unchanged
L8_deps:     waived -> no dependency changes
L10_terms:   filled -> #Slot-rules
```
