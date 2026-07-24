# Proposal

## Problem

The document ledger treats every document kind as a single slot. That correctly replaces a moved
singleton document such as `proposal`, but it also collapses multiple `delta-spec` files from
different capabilities. A governed change can therefore generate two valid specs while later
phases retain and prove the read of only the last one.

## Outcome

Keep singleton document kinds replaceable while giving every delta capability its own stable
evidence slot. Re-registering a rewritten delta for the same capability replaces that slot; registering
a second capability preserves both.

## Scope

- Define deterministic document slot identity.
- Preserve all capability delta records and exact-hash read receipts.
- Keep the applied-spec receipt a single auditable document that may reference several main specs.
- Add kernel and CLI integration coverage for multi-capability changes.

## Non-goals

- No new document kind or external OpenSpec dependency.
- No change to the seven-phase graph.

## Acceptance signal

A change with two capability delta specs reports both as recorded/read, rewriting one capability
replaces only that capability's record, and all existing full suites remain green.
