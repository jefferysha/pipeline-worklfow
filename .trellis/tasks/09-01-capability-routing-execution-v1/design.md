# Capability routing and execution adapter v1 — technical design

## 1. Boundary and ownership

```text
provider (unknown output)
        ↓ host boundary: snapshot + bounded evidence + decoder
CapabilityAssessmentV1
        ↓ @tenon/kernel resolveCapabilities
CapabilityResolutionV1 + frozen WorkGraphV1
        ↓ orchestration application service
applyBoardCommand (canonical in-memory board)
        ↓ ports
SkillExecutor (opaque output) → SkillResultValidator (host verdict)
        ↓
SkillResultEnvelopeV1 → ValidationReportV1 → Gate/board projection
```

- `packages/kernel` remains the only owner of schema, transition and routing invariants. The new Automation files only adapt ports and sequence commands.
- `packages/automation/src/orchestration/proposal.ts` owns provider invocation shape, bounded proposal evidence, decode/normalization and stable error reasons.
- `packages/automation/src/orchestration/execution.ts` owns the application use case, command construction, ready-wave selection, executor/validator ports and result mapping. It must not access Node fs/process, Dashboard DTOs or vendor SDKs.
- `packages/automation/src/index.ts` is the only cross-package export. Tests live beside the implementation.

## 2. Provider proposal contract

The provider port is deliberately narrower than `TriageProvider`: it receives only a frozen request/context projection and returns an untrusted invocation envelope.

```ts
interface CapabilityProposalRequestV1 {
  readonly schema_version: 'capability-proposal-request/v1'
  readonly request_id: string
  readonly project_id: string
  readonly change_id: string
  readonly intent: string
  readonly context: RepositoryContextSnapshotV1
  readonly user_constraints: readonly string[]
}

interface CapabilityProposalInvocationV1 {
  readonly output: unknown
  readonly provenance: { readonly provider: string; readonly model: string; readonly invocation_id: string }
}

interface CapabilityProposalEvidenceV1 {
  readonly schema_version: 'capability-proposal-evidence/v1'
  readonly proposal_id: string
  readonly request_id: string
  readonly context_revision: string
  readonly provenance: CapabilityProposalInvocationV1['provenance']
  readonly output_ref: string
  readonly output_digest: `sha256:${string}`
  readonly output_bytes: number
  readonly media_type: 'application/json'
}
```

Normalization calls `decodeCapabilityAssessmentV1` once on the provider output, then checks request id/project/change ownership, source/provenance, confidence range, field/array budgets and context revision. Host time and evidence reference are supplied by the caller; the model cannot set them. A malformed invocation is returned as a structured blocked/needs-input outcome, never thrown into a successful board state. The actual raw output store is a later infrastructure port; this slice only carries its bounded reference and digest.

## 3. Routing contract

The application receives descriptor catalogs and delegates candidate selection to Kernel `resolveCapabilities`. It does not score with a model. The returned `CapabilityResolutionV1` is copied into a `resolve-capabilities` command with the current board revision. The following preconditions are checked before command submission:

- the assessment and graph belong to the request/change;
- descriptor IDs and versions are pinned in the resolution;
- required capabilities have a selected candidate or an explicit unresolved entry;
- user dependency IDs exist and are acyclic;
- unavailable/unknown descriptors, denied permissions and conflicting parallel writes remain blockers.

No second task-plan model is introduced. Work Item → Skill binding is an explicit application input (`SkillExecutionBindingV1`) so the adapter never guesses from opaque requirement text. This is intentionally a thin seam for the later deterministic planner.

## 4. Execution contract

```ts
interface SkillExecutionBindingV1 {
  readonly work_item_id: string
  readonly skill_id: string
  readonly skill_version: string
  readonly mcp_ids: readonly string[]
  readonly mode: 'serial' | 'parallel'
}

interface SkillExecutorPort {
  execute(input: {
    readonly run_id: string
    readonly work_item_id: string
    readonly skill_id: string
    readonly skill_version: string
    readonly mcp_ids: readonly string[]
    readonly input_artifacts: readonly SkillArtifactRefV1[]
    readonly signal: AbortSignal
  }): Promise<SkillExecutionObservationV1>
}

interface SkillExecutionObservationV1 {
  readonly output: unknown
  readonly raw_output_ref?: string
  readonly artifacts: readonly SkillArtifactRefV1[]
  readonly summary?: string
  readonly diagnostics: readonly string[]
}

interface SkillResultValidatorPort {
  validate(input: {
    readonly binding: SkillExecutionBindingV1
    readonly observation: SkillExecutionObservationV1
  }): Promise<SkillValidationDecisionV1>
}
```

The application wraps the observation into `SkillResultEnvelopeV1`. It never reads a `contract_status` claim from `output`; only the validator port can return `validated`, `unknown` or `invalid`. If no validator is configured, the adapter records an opaque reference/diagnostic and emits `unknown`. Raw output is not copied into an unbounded board object.

Ready items are taken from the frozen graph and current board runtime. The adapter groups only items that are dependency-ready and belong to a graph parallel group; it runs a group with `Promise.allSettled`, maps every outcome to its own result command, and stops downstream waves when any item is blocked/failed. Serial groups run in deterministic Work Item order. Before a run, it applies `claim-work-item` and `begin-skill-run`; command revision conflicts abort the local attempt rather than mutating around CAS.

For a validated completed result, the adapter applies `complete-skill-run`, then a host-supplied validation report through `record-validation`. For unknown/invalid result or executor error, it applies a failed/incomplete envelope and returns the resulting blocked/failed snapshot. Gate evaluation is not fabricated by this slice; a caller may apply the existing `evaluate-gate` command after a real verification/review receipt.

## 5. Failure and retry semantics

- Provider decode/ownership/size failure: no canonical assessment; return `proposal-invalid` with issue paths and a host-created `needs-input` assessment only if the caller explicitly opts into that projection.
- Routing blockers: persist the full resolution (including blockers and unresolved capabilities) via Kernel; status is `blocked` or `waiting-input`.
- Executor rejection/throw/abort: create a failed or incomplete envelope with stable `error_code`/diagnostic, complete the run once, and leave the board in Kernel-defined blocked/failed state. The adapter never retries automatically; caller uses `retry-work-item` with a fresh command revision.
- CAS conflict or duplicate active run: return a conflict outcome without invoking the executor. The application never mutates a stale snapshot in place.

## 6. Compatibility and rollout

- Additive files and exports only; no existing scheduler/admission API changes.
- Existing Automation and Kernel tests remain the regression baseline. The new tests use injected fake provider/executor/validator ports and no network, fs or credentials.
- The next child task can wrap this use case in a persistent snapshot repository and server/SSE adapter. If that adapter cannot provide atomic revision persistence, it must expose the same conflict/blocker result rather than falling back to last-write-wins.

## 7. Rollback

Rollback is a source-level revert of the new orchestration directory/export and its tests. Since this slice introduces no on-disk migration or external side effect, no data rollback is required. A failed rollout can keep existing triage/AFK paths enabled while callers do not construct the new use case.
