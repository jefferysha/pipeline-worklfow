# Capability routing and execution adapter v1 — implementation plan

## Ordered checklist

1. Re-read `trellis-before-dev` and the automation backend rules; confirm the current branch is clean and the child task is still `planning`.
2. Add `orchestration/proposal.ts` and tests:
   - define provider request/invocation/evidence ports;
   - implement bounded, single-read normalization through Kernel decoder;
   - enforce host ownership, provenance, evidence reference/digest/byte budget and stable error reasons;
   - cover valid proposal, unknown fields, wrong binding, oversized/cyclic output and abort/error handling.
3. Add `orchestration/execution.ts` and tests:
   - define explicit Work Item → Skill/MCP binding and executor/validator ports;
   - construct immutable board commands with expected revisions;
   - execute serial and safe parallel ready waves using `Promise.allSettled`;
   - wrap opaque observations into result envelopes and use validator-only contract status;
   - map runner/validator/CAS/duplicate-run failures to blocked/failed outcomes without false completion.
4. Export only the new public application ports/use case from `packages/automation/src/index.ts`; do not deep-import from other packages.
5. Run targeted automation/kernel orchestration tests and typecheck/build. Fix only issues in the child scope.
6. Run architecture/comments/diff checks. Update `.trellis/spec/automation/backend/orchestration.md` with the verified application boundary and opaque-output rule.
7. Review acceptance criteria and archive the child task with a scoped commit; leave the parent task planning for the persistence/server/dashboard children.

## Validation commands

```bash
npx vitest run packages/automation/src/orchestration packages/kernel/src/orchestration
npm run build
npm run check:architecture
npm run check:comments
git diff --check
```

If the shared suite is run, record the exact result and distinguish the known parallel server timeout from source failures; do not claim a full pass without a clean `npm test` result.

## Risky files and rollback points

- `packages/automation/src/orchestration/proposal.ts`: untrusted model boundary; keep raw output unknown and bounded, never log it or use it as state.
- `packages/automation/src/orchestration/execution.ts`: application state sequencing; every command must use the latest returned revision and every executor call must have one active run.
- `packages/automation/src/index.ts`: public export compatibility; additive export only.
- `.trellis/spec/automation/backend/orchestration.md`: specification update is required only after tests prove the behavior.

Before activation, confirm no generated `dist/` or tracked workflow files need manual edits. If implementation reveals that the existing Kernel command contract cannot express a required transition, return to planning and amend this child rather than introducing a parallel state engine.
