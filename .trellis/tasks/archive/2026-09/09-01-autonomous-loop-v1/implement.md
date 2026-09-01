# Minimal autonomous development loop — implementation plan

## Implementation order

1. **Contract layer in Kernel** — **implemented in v1 slice**
   - Add schema types, codecs, limits and structured decode errors for the new orchestration records.
   - Reuse `TaskPlanRevisionV1`, `SkillInvocationEventV1`, `EffectiveWorkflowPlan` and existing artifact/validator types through adapters.
   - Add pure graph readiness and transition functions; no filesystem, network or model calls.

   Delivered under `packages/kernel/src/orchestration/`: versioned request,
   context, assessment, WorkGraph, Skill/MCP descriptors, resolution, run,
   result envelope, validation, gate, board command and snapshot contracts;
   strict decoders; deterministic capability routing; and a reducer with
   revision-CAS, pause/resume/retry/cancel and fail-closed result handling.

2. **Inference and routing application layer** — **next slice**
   - Add a model-proposal boundary that produces bounded raw evidence.
   - Normalize the proposal into capability requirements and clarification gates.
   - Build a capability catalog for user Skills and MCPs.
   - Implement deterministic filtering first (availability, permissions, dependencies, resource conflicts), then optional model scoring.
   - Persist the complete candidate list, selected entry, rationale and pinned versions.

3. **Minimal execution loop** — **next slice**
   - Adapt existing Automation admission/runner to create `SkillRunV1` and `SkillResultEnvelopeV1`.
   - Support one Change, one repository, serial/parallel Work Items and retryable failure.
   - Treat non-conforming Skill output as opaque/untyped and route it to a validator or clarification gate.

4. **Validation and gate integration** — **next slice**
   - Bind artifacts to existing validators and review receipts.
   - Ensure `unknown`/`untyped` cannot authorize a required gate.
   - Reuse canonical Workflow guards for verify/review; do not create a parallel transition engine.

5. **Server and Dashboard control surface** — **next slice**
   - Add board snapshot projection and SSE updates.
   - Add typed command endpoints for pause/resume/approve/retry/cancel/replan.
   - Enforce expected revision/CAS on every board command.
   - Display selected Skill/MCP, output references, validation status and blocker reasons.

6. **CLI parity and evidence** — **next slice**
   - Add CLI commands only as thin adapters over the same application commands.
   - Add an end-to-end fixture that runs natural-language request → graph → routing → Skill run → artifact → validation/review.
   - Record the usage metrics needed to identify redundant stages.

## Validation commands

Run after implementation in a clean, explicitly isolated worktree:

```bash
npm run build
npm run check:architecture
npm run typecheck:web
npm run test:web
npx vitest run packages/kernel/src packages/automation/src packages/server/src packages/cli/src
npm run check:openspec
npm run check:release-workflows
git diff --check
```

The full `npm test` result must distinguish source failures from stale generated artifacts and honest credential-based skips.

## v1 slice verification

- `npm ci` — passed; no dependency vulnerabilities reported.
- `npx vitest run packages/kernel/src/orchestration/orchestration.test.ts` — 5 passed.
- `npx vitest run packages/kernel/src` — 2,618 passed.
- `npx tsc -b packages/kernel` — passed.
- `npm run build` — passed.
- `npm run check:architecture` — passed.
- `npm run check:comments` — passed.
- Full `npm test` — 6,923 passed, 15 honest skips, one existing server managed-start timeout under parallel load; the same `packages/server/src/server.test.ts` passed alone (306 passed, 9 skipped).

## Risk and rollback points

- New schema codecs must be additive and independently testable before wiring runtime behavior.
- Do not change existing `FIELD_ORDER`, canonical state semantics or generated workflow files in the first implementation slice.
- Do not fast-forward `main` while `.trellis/`, `AGENTS.md`, `.gitattributes` and user screenshots remain uncommitted.
- If routing behavior is unstable, disable automatic selection and retain explicit user Skill plans; the rest of the execution loop must remain usable.
- If a custom Skill cannot produce a validator-compatible artifact, stop at `blocked`/`waiting-input`; never downgrade the gate.
