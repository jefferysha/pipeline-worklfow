# Applied OpenSpec receipt

Date: 2026-07-24

## Applied capabilities

- `openspec/changes/normal-chat-default-orchestration/specs/document-evidence-contract/spec.md`
  → `openspec/specs/document-evidence-contract/spec.md`
- `openspec/changes/normal-chat-default-orchestration/specs/simple-task-routing/spec.md`
  → `openspec/specs/simple-task-routing/spec.md`

## Effects

- Added the durable OpenSpec document-ledger, exact-hash read receipts, exact-event review
  approvals, and CLI/server enforcement contract.
- Added the immutable lightweight `simple` Track, exclusion-first routing, per-step skill evidence,
  scope escalation, and graph-correct Todo projection contract.

Both main specifications already contain the approved delta requirements. Re-applying the change
was therefore idempotent; no unrelated main-spec content was changed and no conflict resolution
was required.
