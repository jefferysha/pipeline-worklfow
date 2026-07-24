# Multi-capability document evidence implementation plan

change: multi-capability-document-evidence
design-doc: docs/superpowers/specs/2026-07-24-multi-capability-document-evidence-design.md

## Stage 1 — tracer bullet

- Add deterministic slot derivation inside the ledger.
- Make registration replace only the matching slot.
- Add one integration test that registers two capability deltas, reads both, and proves both remain.
- Run the focused kernel/CLI tests.

此处建议 /clear

## Stage 2 — compatibility hardening

- Preserve singleton move replacement.
- Reject malformed delta paths.
- Cover legacy repair/backfill and same-capability rewrites.
- Update the durable main spec during ship.

此处建议 /clear

## Stage 3 — verification and release

- Run the full test/build/hook/adapter/bundle/oracle suite.
- Freeze and independently verify the workspace baseline.
- Commit and push the complete plugin release to `main`.
