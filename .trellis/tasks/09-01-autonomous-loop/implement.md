# Minimal autonomous development loop — implementation plan

## Implementation order

1. **Contract layer in Kernel**
   - Add schema types, codecs, limits and structured decode errors for the new orchestration records.
   - Reuse `TaskPlanRevisionV1`, `SkillInvocationEventV1`, `EffectiveWorkflowPlan` and existing artifact/validator types through adapters.
   - Add pure graph readiness and transition functions; no filesystem, network or model calls.

2. **Inference and routing application layer**
   - Add a model-proposal boundary that produces bounded raw evidence.
   - Normalize the proposal into capability requirements and clarification gates.
   - Build a capability catalog for user Skills and MCPs.
   - Implement deterministic filtering first (availability, permissions, dependencies, resource conflicts), then optional model scoring.
   - Persist the complete candidate list, selected entry, rationale and pinned versions.

3. **Minimal execution loop**
   - Adapt existing Automation admission/runner to create `SkillRunV1` and `SkillResultEnvelopeV1`.
   - Support one Change, one repository, serial/parallel Work Items and retryable failure.
   - Treat non-conforming Skill output as opaque/untyped and route it to a validator or clarification gate.

4. **Validation and gate integration**
   - Bind artifacts to existing validators and review receipts.
   - Ensure `unknown`/`untyped` cannot authorize a required gate.
   - Reuse canonical Workflow guards for verify/review; do not create a parallel transition engine.

5. **Server and Dashboard control surface**
   - Add board snapshot projection and SSE updates.
   - Add typed command endpoints for pause/resume/approve/retry/cancel/replan.
   - Enforce expected revision/CAS on every board command.
   - Display selected Skill/MCP, output references, validation status and blocker reasons.

6. **CLI parity and evidence**
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

## Risk and rollback points

- New schema codecs must be additive and independently testable before wiring runtime behavior.
- Do not change existing `FIELD_ORDER`, canonical state semantics or generated workflow files in the first implementation slice.
- Do not fast-forward `main` while `.trellis/`, `AGENTS.md`, `.gitattributes` and user screenshots remain uncommitted.
- If routing behavior is unstable, disable automatic selection and retain explicit user Skill plans; the rest of the execution loop must remain usable.
- If a custom Skill cannot produce a validator-compatible artifact, stop at `blocked`/`waiting-input`; never downgrade the gate.
