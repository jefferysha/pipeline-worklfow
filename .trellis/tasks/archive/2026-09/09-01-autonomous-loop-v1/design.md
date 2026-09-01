# Minimal autonomous development loop — schema and state design

## 1. Baseline and remote comparison

Remote was fetched from `origin` without touching the working tree.

| Item | Local worktree | Remote `origin/main` | Result |
|---|---|---|---|
| Branch tip | `39fe9f85494ceccbe2357df80660f8798e3026fd` | `4073e5472c31c995ac8d147810133191722b825c` | Local is behind by 28 commits |
| Latest commit | 2026-08-10, PR #71 merge | 2026-08-11, installer bridge recovery (#79) | Remote is newer |
| Package version | `1.0.2` | `1.0.7` | Local metadata is stale |
| Remote default branch | `main` | `main` | Confirmed by `ls-remote --symref` |

The remote delta contains 60 source files with approximately 1370 additions and 343 deletions. The largest relevant areas are:

- phase Skill enforcement and real workflow/Skill orchestration tests;
- `EffectiveWorkflowPlan` capability snapshots;
- `EffectiveSkillResolver` and `SkillBundleResolver` changes;
- AFK admission/preparation and immutable Skill bundle provenance;
- CLI/Server integration and release/install hardening.

The remote code is therefore not merely a release bump. It materially strengthens Skill selection, phase capability freezing, provenance and AFK admission. It still does not provide the target product's complete autonomous loop:

| Target capability | Remote status | Design decision |
|---|---|---|
| Canonical task plan and dependency graph | `TaskPlanRevisionV1` exists | Reuse and extend; do not create a second plan truth |
| Workflow capability snapshot | `EffectiveWorkflowPlan` exists | Reuse as frozen workflow/phase capability |
| User-selected Skill sequence | `SkillRef`, `depends_on`, Skill orchestration UI exist | Reuse for explicit selection and ordering |
| Skill provenance and invocation evidence | `SkillInvocationEventV1`, bundle snapshots exist | Reuse for immutable execution evidence |
| Generic heterogeneous Skill output | No first-class cross-Skill result envelope | Add a small orchestration envelope and preserve opaque output |
| Natural-language capability/constraint inference | No first-class assessment schema | Add `CapabilityAssessmentV1` |
| Dynamic Skill/MCP capability routing | Resolver is primarily manifest/profile driven | Add capability catalog and routing decision records |
| Board control contract | Snapshot/SSE and individual actions exist | Add typed board commands over canonical transitions |
| End-to-end autonomous orchestrator | Pieces exist in CLI/Automation | Add one application-level orchestration boundary |

The implementation must not fast-forward or merge remote code while the current worktree contains unrelated user changes. Remote comparison is a design input, not an authorization to overwrite local work.

## 2. Non-negotiable invariants

1. **One canonical truth:** Change, Work Item, Run and Gate state are written through Kernel transition logic. Dashboard and CLI are adapters.
2. **Events are causal:** every state mutation has an event id, correlation id, actor, command and optional causation id.
3. **A Skill's domain output is opaque by default:** the orchestrator reasons over lifecycle status, artifact references and validator results, not undocumented business semantics.
4. **No false completion:** missing, malformed or unverified output is `untyped`/`blocked`, never silently treated as completed.
5. **Explicit user choices win:** a user-provided Skill order/dependency is authoritative unless a policy or resource conflict rejects it.
6. **Automatic inference is advisory until normalized:** model output is stored as a proposal, then normalized into typed capability requirements; the model never mutates canonical state directly.
7. **All external effects are bounded:** MCP permissions, filesystem writes, Git operations and deployment-like actions are selected and admitted by policy.
8. **Persisted schemas are versioned and append-compatible:** field names use the existing snake_case convention; incompatible changes require a new schema version and an adapter.

## 3. Proposed application boundary

```text
DevelopmentRequest
        ↓
ContextSnapshot → CapabilityAssessment
        ↓
WorkGraph / TaskPlanRevision
        ↓
CapabilityRouter → SkillPlan / MCP bindings
        ↓
RunScheduler → SkillRun → SkillResultEnvelope
        ↓                         ↓
Artifact registry → Validators → Gate evaluation
        ↓                         ↓
Canonical state/events ← Board commands → Dashboard snapshot/SSE
```

The existing packages map to this boundary as follows:

- `kernel`: schemas, codecs, immutable records, graph validation, transition planning, guards and evidence contracts;
- new orchestration/application layer (initially it may live beside `automation`, but must have a distinct public boundary): context-to-capability inference, routing, graph scheduling and re-planning;
- `automation`: queue, admission, runner, sandbox and execution lifecycle;
- `server`: HTTP/SSE transport and command authentication;
- `dashboard-app`: board projection and typed controls;
- `channel` and `tap`: transport/diagnostic infrastructure, never canonical business state.

## 4. Common schema rules

The following are persisted-shape contracts. TypeScript names are illustrative; the wire form remains snake_case, matching `task-plan/v1` and `skill-invocation-evidence/v1`.

```ts
type Id = string
type Digest = `sha256:${string}`
type Timestamp = string // ISO-8601 UTC

interface RecordMetaV1 {
  schema_version: string
  record_id: Id
  project_id: Id
  change_id: Id
  correlation_id: Id
  causation_id?: Id
  created_at: Timestamp
  revision: number
}
```

Required common rules:

- IDs are stable for the life of a record; retries create a new `run_id`/`attempt_id`, not a new Change.
- Digests identify content, not semantic meaning. A digest is required before an artifact can authorize a gate.
- Timestamps are recorded by the host, not generated by the model.
- Raw model/tool output is stored by bounded reference, digest, byte length and media type; secrets are redacted before persistence.

## 5. Stage schemas

### Stage 0 — Intake

**Purpose:** accept a natural-language development goal without requiring a user-selected scene.

```ts
interface DevelopmentRequestV1 extends RecordMetaV1 {
  schema_version: 'development-request/v1'
  goal: string
  repository: { root: string; branch?: string; commit_sha?: string }
  user_constraints: readonly string[]
  requested_effects: readonly ('read' | 'write' | 'git' | 'network' | 'deploy-preview')[]
  selected_skill_ids?: readonly string[]
  selected_skill_mode?: 'ordered' | 'set' | 'hybrid'
  interaction_policy: 'interactive' | 'recommended-defaults' | 'afk'
}
```

Output: `request.accepted` or `request.rejected`.

Required rejection reasons: empty goal, unreadable repository, unsupported requested effect, policy denial.

### Stage 1 — Context capture

**Purpose:** freeze the facts used for inference and planning.

```ts
interface RepositoryContextSnapshotV1 extends RecordMetaV1 {
  schema_version: 'repository-context/v1'
  source_request_id: Id
  head: { branch: string; commit_sha: string; dirty: boolean }
  workspace_fingerprint: Digest
  project_facts: readonly {
    key: string
    value_digest: Digest
    value_ref: string
    confidence: 'observed' | 'derived'
  }[]
  available_runtimes: readonly string[]
  available_mcp_ids: readonly Id[]
  available_skill_ids: readonly Id[]
  policy_snapshot_ref: string
}
```

Output: `context.captured` or `context.blocked`.

The context snapshot is immutable for a plan revision. A changed repository head or policy creates a new revision instead of silently changing the current run.

### Stage 2 — Capability and constraint inference

**Purpose:** automatically identify what must be done, without forcing a fixed scene label.

```ts
interface CapabilityRequirementV1 {
  requirement_id: Id
  capability: string // e.g. edit.react, add.http-api, run.unit-tests
  necessity: 'required' | 'recommended' | 'optional'
  acceptance_refs: readonly Id[]
  evidence_refs: readonly string[]
  constraints: readonly string[]
  risk: 'low' | 'medium' | 'high'
}

interface CapabilityAssessmentV1 extends RecordMetaV1 {
  schema_version: 'capability-assessment/v1'
  source_request_id: Id
  context_snapshot_id: Id
  requirements: readonly CapabilityRequirementV1[]
  inferred_labels: readonly string[] // projection only; never a transition key
  unresolved_questions: readonly {
    question_id: Id
    question: string
    blocking: boolean
  }[]
  model_proposal_ref: string
  normalization: 'normalized' | 'needs-clarification' | 'rejected'
}
```

Output: `assessment.completed`, `assessment.needs-clarification`, or `assessment.rejected`.

The model may propose labels, but only normalized capabilities, constraints and acceptance references enter the planner.

### Stage 3 — Work Graph planning

**Purpose:** turn requirements into executable work items and dependencies.

Do not introduce a second task-plan truth. Wrap or extend the existing `TaskPlanRevisionV1`:

```ts
interface WorkGraphV1 extends RecordMetaV1 {
  schema_version: 'work-graph/v1'
  assessment_id: Id
  task_plan_revision_id: Id // references existing task-plan/v1 revision
  graph_revision: number
  decomposition: 'single' | 'parallel' | 'mixed'
  work_item_ids: readonly Id[]
  dependency_edges: readonly {
    from_work_item_id: Id
    to_work_item_id: Id
    reason: 'data' | 'resource' | 'ordering' | 'gate'
  }[]
  parallel_groups: readonly { group_id: Id; work_item_ids: readonly Id[] }[]
  acceptance_coverage: readonly { acceptance_id: Id; work_item_ids: readonly Id[] }[]
  plan_status: 'draft' | 'validated' | 'frozen' | 'superseded'
}
```

Each Work Item must retain the existing task-plan fields (`depends_on`, `resource_claims`, `expected_outputs`, `validators`) and add only orchestration references:

```ts
interface WorkItemOrchestrationV1 {
  capability_requirement_ids: readonly Id[]
  skill_plan_id?: Id
  execution_policy: 'auto' | 'user-controlled' | 'manual-only'
  blocked_by?: readonly string[]
}
```

Output: `plan.proposed`, `plan.validated`, `plan.frozen`, or `plan.rejected`.

### Stage 4 — Skill/MCP capability routing

**Purpose:** choose executable capabilities while preserving user choices and policy constraints.

```ts
interface SkillDescriptorV1 {
  skill_id: Id
  version: string
  source_ref: string
  content_digest: Digest
  capabilities: readonly string[]
  input_hints?: readonly string[]
  output_hints?: readonly string[]
  supported_modes: readonly ('serial' | 'parallel')[]
  permissions: readonly ('read' | 'write' | 'git' | 'network')[]
  validator_ids?: readonly Id[]
  availability: 'available' | 'unavailable' | 'unknown'
}

interface McpDescriptorV1 {
  mcp_id: Id
  version?: string
  capabilities: readonly string[]
  input_hints?: readonly string[]
  output_hints?: readonly string[]
  permission_scopes: readonly string[]
  side_effects: readonly ('read' | 'write' | 'network' | 'external-mutation')[]
  availability: 'available' | 'unavailable' | 'unknown'
}

interface SkillPlanEntryV1 {
  entry_id: Id
  work_item_id: Id
  skill_id: Id
  mcp_ids: readonly Id[]
  depends_on: readonly Id[]
  execution_mode: 'serial' | 'parallel'
  selection_source: 'user' | 'automatic' | 'hybrid'
  pinned_version: string
}

interface CapabilityResolutionV1 extends RecordMetaV1 {
  schema_version: 'capability-resolution/v1'
  work_graph_id: Id
  entries: readonly SkillPlanEntryV1[]
  candidates: readonly {
    requirement_id: Id
    candidate_id: Id
    kind: 'skill' | 'mcp'
    score?: number
    rejected_reasons: readonly string[]
  }[]
  rationale: readonly string[]
  policy_snapshot_ref: string
  resolution_status: 'resolved' | 'partial' | 'blocked'
}
```

Selection score is explanatory metadata only. A candidate is executable only when availability, permissions, resource conflicts and required validators pass.

### Stage 5 — Execution scheduling and run

**Purpose:** execute a ready Work Item exactly once per admitted attempt, with retry continuity.

```ts
type WorkItemState =
  | 'pending' | 'ready' | 'queued' | 'running' | 'waiting-input'
  | 'blocked' | 'review' | 'verifying' | 'completed' | 'failed' | 'cancelled'

type RunState =
  | 'queued' | 'claimed' | 'running' | 'completed' | 'failed'
  | 'interrupted' | 'cancelled'

interface SkillRunV1 extends RecordMetaV1 {
  schema_version: 'skill-run/v1'
  run_id: Id
  attempt_id: Id
  work_item_id: Id
  skill_id: Id
  skill_version: string
  mcp_ids: readonly Id[]
  input_refs: readonly string[]
  context_snapshot_id: Id
  resolution_id: Id
  execution_mode: 'serial' | 'parallel'
  state: RunState
  lease?: { owner_id: Id; expires_at: Timestamp }
  started_at?: Timestamp
  finished_at?: Timestamp
  failure?: { code: string; detail_ref: string; retryable: boolean }
}
```

Existing `ExecutionContext`, admission, reservation and Skill bundle provenance should populate this record rather than be bypassed.

### Stage 6 — Heterogeneous output normalization

**Purpose:** make arbitrary Skill outputs composable without pretending to understand them.

```ts
type OutputContractStatus = 'typed' | 'untyped' | 'invalid'

interface ArtifactRefV1 {
  artifact_id: Id
  kind: 'file' | 'diff' | 'document' | 'json' | 'text' | 'url' | 'report' | 'value'
  ref: string
  digest: Digest
  media_type?: string
  byte_length?: number
  producer_run_id: Id
  semantic_type?: string // optional declaration, never inferred as fact
}

interface SkillResultEnvelopeV1 extends RecordMetaV1 {
  schema_version: 'skill-result/v1'
  run_id: Id
  status: 'completed' | 'failed' | 'blocked' | 'incomplete'
  contract_status: OutputContractStatus
  summary?: string
  artifacts: readonly ArtifactRefV1[]
  validation_refs: readonly Id[]
  next_action_hints?: readonly string[]
  raw_output: { ref: string; digest: Digest; media_type: string; byte_length: number }
  unknown_fields?: readonly string[]
}
```

Rules:

- A downstream task may consume an artifact by explicit `artifact_id`, `kind`, `digest` or declared semantic type.
- No downstream semantic binding is created from free text alone.
- If a dependency requires an output that is not present or not verifiable, the dependent Work Item becomes `blocked` or `waiting-input`.
- A custom Skill that emits only text remains useful for explanation/research, but cannot authorize a code-changing gate without a validator or explicit human decision.

### Stage 7 — Validation

**Purpose:** verify outputs and workspace effects using deterministic or explicitly human checks.

```ts
interface ValidationCheckV1 {
  check_id: Id
  kind: 'file-exists' | 'json-schema' | 'test-report' | 'artifact-digest'
    | 'diff-policy' | 'human-review'
  target_refs: readonly string[]
  status: 'passed' | 'failed' | 'skipped' | 'unknown'
  evidence_ref?: string
  detail?: string
}

interface ValidationReportV1 extends RecordMetaV1 {
  schema_version: 'validation-report/v1'
  run_id: Id
  work_item_id: Id
  checks: readonly ValidationCheckV1[]
  overall: 'passed' | 'failed' | 'incomplete' | 'unknown'
  validator_version: string
}
```

`unknown` is not equivalent to `passed`. A gate may only pass when all required checks are passed or an explicit policy-approved human waiver exists.

### Stage 8 — Review and gate

**Purpose:** decide whether the graph may advance.

```ts
interface GateEvaluationV1 extends RecordMetaV1 {
  schema_version: 'gate-evaluation/v1'
  gate_id: Id
  change_id: Id
  work_item_ids: readonly Id[]
  kind: 'plan-review' | 'code-review' | 'verify' | 'ship'
  required_evidence_refs: readonly string[]
  validation_report_ids: readonly Id[]
  decision: 'pending' | 'passed' | 'rejected' | 'waived'
  actor: { kind: 'system' | 'user' | 'policy'; id: Id }
  rationale?: string
}
```

The existing review receipt, build revision and transition guards remain the authority for actual phase movement. The new gate schema is an orchestration view and must not bypass those guards.

### Stage 9 — Board projection and control

**Purpose:** provide real-time observation and safe intervention.

```ts
type BoardCommandKind =
  | 'pause-change' | 'resume-change' | 'approve-gate' | 'reject-gate'
  | 'retry-run' | 'cancel-run' | 'replan-change' | 'bind-artifact'

interface BoardCommandV1 extends RecordMetaV1 {
  schema_version: 'board-command/v1'
  command_id: Id
  actor_id: Id
  kind: BoardCommandKind
  target_id: Id
  expected_revision: number
  reason?: string
  payload?: Record<string, unknown>
}

interface BoardSnapshotV1 extends RecordMetaV1 {
  schema_version: 'board-snapshot/v1'
  change_state: ChangeState
  work_items: readonly {
    work_item_id: Id
    state: WorkItemState
    runnable: boolean
    active_run_id?: Id
    selected_skill_ids: readonly Id[]
    artifact_ids: readonly Id[]
    blocker?: string
  }[]
  gates: readonly GateEvaluationV1[]
  last_event_id: Id
  generated_at: Timestamp
}
```

The board writes commands, never columns. The command carries an expected revision so stale UI actions fail with a re-read requirement.

## 6. Canonical state machines

### Change state

```text
draft
  → contextualizing
  → assessing
  → planning
  → planned
  → ready
  → executing
  → reviewing
  → verifying
  → completed
```

Side states:

```text
assessing/planning/executing/reviewing/verifying → waiting-input
assessing/planning/executing/reviewing/verifying → blocked
ready/executing/waiting-input → paused
any non-terminal state → cancelled
executing/verifying → failed (only when recovery policy is exhausted)
```

### Work Item state

```text
pending → ready → queued → running
running → waiting-input | blocked | review | verifying | completed | failed
queued/running/waiting-input/blocked → cancelled
failed → queued (retry with new attempt)
```

An item is `ready` only when all dependencies are `completed`, required inputs are bound, and policy permits execution. Parallelism is a graph property, not a UI flag.

### Run state

```text
queued → claimed → running → completed
queued/claimed/running → interrupted | failed | cancelled
failed/interrupted → queued (new attempt, same work item)
```

### Gate state

```text
pending → passed | rejected | waived
rejected → pending (after replan or new evidence)
```

`waived` always requires a policy-allowed actor and rationale; it is never an automatic fallback for missing evidence.

## 7. Transition contract

| Event/command | From | To | Required guard | Durable effects |
|---|---|---|---|---|
| `request.accept` | none | `draft` | goal, repository and policy valid | write request and correlation root |
| `context.capture` | `draft` | `contextualizing` → `assessing` | repository readable | immutable context snapshot |
| `assessment.complete` | `assessing` | `planning` | requirements normalized; blocking questions resolved | assessment evidence |
| `plan.freeze` | `planning`/`planned` | `ready` | DAG acyclic, acceptance covered, resource conflicts resolved | frozen graph revision |
| `route.resolve` | `ready` | `ready` | all required capabilities resolved or explicitly blocked | skill/MCP resolution snapshot |
| `run.enqueue` | `ready` | `executing` | at least one runnable item | run reservation |
| `run.start` | `queued`/`claimed` | `running` | lease, permissions, immutable input snapshot | run-start event |
| `run.complete` | `running` | `verifying`/`review`/`completed` | result envelope present; dependencies updated | output/artifact records |
| `run.fail` | `running` | `failed`/`blocked`/`queued` | failure classified; retry policy evaluated | failure evidence and next action |
| `validation.pass` | `verifying` | `reviewing`/`completed` | all required checks passed | validation report |
| `validation.fail` | `verifying` | `blocked`/`failed` | failed checks recorded | blocker and remediation hint |
| `gate.approve` | `reviewing` | `verifying`/`completed` | review receipt and exact transition event | immutable approval receipt |
| `board.pause` | `ready`/`executing` | `paused` | actor permission; no unsafe critical section | pause command/event |
| `board.resume` | `paused` | `ready`/`executing` | current revision and policy still valid | new scheduling decision |
| `board.retry` | `failed`/`blocked` | `queued` | retryable failure or explicit user command | new attempt bound to prior failure |
| `board.replan` | any non-terminal | `planning` | reason plus current context revision | supersede old graph revision |
| `board.cancel` | any non-terminal | `cancelled` | actor permission; runner cancellation attempted | cancellation receipt |

The transition planner remains pure. Adapters may perform I/O only after the planner returns an allowed typed transition.

## 8. Automatic inference and heterogeneous output policy

The MVP uses a two-layer inference contract:

1. **Model proposal:** free-form analysis retained as bounded raw evidence.
2. **Normalizer:** converts the proposal into capability requirements, constraints, risk and acceptance references.

Only the normalized result can create Work Items. If normalization cannot establish a required capability or output dependency, the system creates a clarification gate instead of inventing a scene or selecting an arbitrary tool.

The MVP output policy is deliberately asymmetric:

- accepting an opaque artifact is safe;
- using an opaque artifact to authorize a code-changing or shipping transition is not safe;
- the latter requires a validator, an explicit user binding, or a policy-approved review receipt.

This makes arbitrary user Skills usable while preserving honest state semantics.

## 9. How to detect redundancy after the first loop

Every stage records `decision_id`, selected candidates, actual usage, output references, validation delta, duration, retries, cost and human intervention. After real runs, classify components as:

- **essential:** removal makes a required acceptance criterion unverifiable or unexecutable;
- **conditional:** useful only for a capability/risk subset;
- **redundant:** produces no downstream evidence or is consistently bypassed;
- **unsafe:** adds side effects without a corresponding policy or validation gain.

No module is removed based on model preference alone. The removal decision must reference run evidence and a replacement or explicit loss of capability.

## 10. Compatibility and migration

- Keep `task-plan/v1`, `skill-invocation-evidence/v1`, `effective-workflow-plan` and existing Automation records intact.
- Add new schemas under separate namespaces (`development-request/v1`, `capability-assessment/v1`, `work-graph/v1`, `capability-resolution/v1`, `skill-run/v1`, `skill-result/v1`, `validation-report/v1`, `gate-evaluation/v1`, `board-command/v1`, `board-snapshot/v1`).
- Use adapters to map existing `TaskPlanRevisionV1` and `SkillInvocationEventV1` into the orchestration read model.
- Do not make Dashboard state or Channel events canonical.
- A new incompatible field or transition requires a new schema version and a migration test; additive optional fields may remain in the same version.
- Remote `origin/main` must be integrated separately after local Trellis/user changes are isolated and the generated artifacts are rebuilt.
