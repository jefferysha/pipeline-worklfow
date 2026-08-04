# Applied Specification Receipt

- Applied at: 2026-08-04
- Change: `task-plan-contract`
- Validation: `npx openspec validate --all --strict` passed 38/38 specifications

## Applied deltas

### `specs/codex-skill-receipt-current-turn/spec.md`

- Target: `openspec/specs/codex-skill-receipt-current-turn/spec.md`
- Result: modified
- Before SHA-256: `a34d109298a3bdba3f0959bc9d59901c574e0ccc470dd365ee4b831089cc0cec`
- After SHA-256: `d181713b4c314c36c684b50a951de37183831af2f6013d4be9e2a6c824c0f02e`
- Summary: documented bounded inline `max_output_tokens` receipt compatibility and transcript discovery across more than 128 valid historical transcripts while retaining fail-closed evidence rules.

### `specs/task-plan-contract/spec.md`

- Target: `openspec/specs/task-plan-contract/spec.md`
- Result: added
- Before SHA-256: absent
- After SHA-256: `f7ca2dae1a0547aeeed11e6c5f537015cbf275443f45252ce4857c3b733a2a91`
- Summary: added the durable TaskPlan v1 identity, validation, storage, projection, API, and workflow-gate contract.

## Conflict resolution

No conflicts were encountered. Both deltas were applied directly to their canonical specification targets.
