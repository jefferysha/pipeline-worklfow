# Production orchestration v2 — canonical schemas, states and transitions

This document freezes the bottom-up contract before product implementation. V2 is additive: V1 remains readable through explicit adapters, but no V1 in-memory shortcut is a production source of truth.

## 1. Common record contract

Every durable record carries host-owned identity and trace fields:

```ts
interface OrchestrationRecordMetaV2 {
  readonly schema_version: string
  readonly record_id: string
  readonly project_id: string
  readonly change_id: string
  readonly revision: number
  readonly correlation_id: string
  readonly causation_id?: string
  readonly actor: { readonly kind: 'user' | 'system' | 'worker' | 'policy'; readonly id: string }
  readonly created_at: string
}
```

Rules:

- IDs are path-safe, immutable and never derived from paths, prompts or timestamps alone.
- `revision` is a non-negative safe integer and advances exactly once per committed command.
- `correlation_id` spans the Development Request; `causation_id` points to the command/event that caused this record.
- Host clock supplies timestamps. Model/provider/executor output cannot choose identity, revision, actor or time.
- Durable JSON is canonical UTF-8 with sorted object keys, SHA-256 digest and explicit byte limits.
- Unknown fields fail closed at write boundaries; version adapters may expose additive projections without mutating stored bytes.

## 2. Canonical schema inventory

| Schema | Owner | Purpose | Key additions over V1 |
| --- | --- | --- | --- |
| `development-request/v2` | Kernel | Natural-language intent and user capability choices | interaction policy, requested effects, constraints, correlation |
| `repository-context/v2` | Adapter → Kernel decode | Immutable repository/policy/catalog facts | head identity, dirty fingerprint, catalog/policy digests |
| `capability-assessment/v2` | Automation proposal boundary | Capabilities, constraints, risks, questions | acceptance refs, evidence refs, explicit normalization status |
| `work-graph/v2` | Kernel planner contract | Frozen TaskPlan-based DAG | graph revision, acceptance coverage, edge reasons, plan digest |
| `capability-resolution/v2` | Kernel resolver | Pinned Skill/MCP decisions | candidate ledger, policy snapshot, rejection reasons, binding digest |
| `skill-run/v2` | Kernel scheduler state | Run/attempt lifecycle | attempt_id, lease, input/result refs, interruption/retry lineage |
| `skill-result/v2` | Executor boundary → Kernel decode | Heterogeneous output envelope | opaque raw ref/digest/bytes, artifact digests, validator requirements |
| `validation-report/v2` | Validator boundary | Deterministic/human evidence | validator identity/version, target digests, complete/unknown distinction |
| `gate-evaluation/v2` | Kernel guard | Review/verify/release decision | required evidence, decision revision, explicit waiver policy |
| `board-command/v2` | User/system adapter | The only mutation request | command digest, expected revision, idempotency key, typed payload |
| `board-event/v2` | Durable repository | Immutable accepted/rejected command result | command linkage, before/after digest, bounded effects, failure code |
| `board-snapshot/v2` | Durable repository | Current canonical read model | event head, command head, results, leases, blockers, recovery status |
| `orchestration-idempotency/v1` | Durable repository | Command replay identity | command digest, committed revision/event/result digest |
| `orchestration-recovery-report/v1` | Durable repository | Startup/readiness diagnostics | last valid revision, ignored temps, corrupt boundary, lease decisions |

## 3. Core v2 shapes

```ts
interface DevelopmentRequestV2 extends OrchestrationRecordMetaV2 {
  readonly schema_version: 'development-request/v2'
  readonly request_id: string
  readonly intent: string
  readonly interaction_policy: 'interactive' | 'recommended-defaults' | 'afk'
  readonly requested_effects: readonly ('read' | 'write' | 'git' | 'network' | 'deploy-preview')[]
  readonly constraints: readonly string[]
  readonly user_skills: readonly {
    id: string; version?: string; mode: 'serial' | 'parallel'; depends_on: readonly string[]
  }[]
  readonly user_mcps: readonly { id: string; version?: string; required: boolean }[]
  readonly auto_select: boolean
}

interface RepositoryContextV2 extends OrchestrationRecordMetaV2 {
  readonly schema_version: 'repository-context/v2'
  readonly request_id: string
  readonly repository: { ref: string; branch: string; base_branch: string; head_sha: string; dirty: boolean }
  readonly workspace_fingerprint: `sha256:${string}`
  readonly policy_digest: `sha256:${string}`
  readonly skill_catalog_digest: `sha256:${string}`
  readonly mcp_catalog_digest: `sha256:${string}`
  readonly observed_facts: readonly { key: string; value_ref: string; digest: `sha256:${string}` }[]
}

interface CapabilityAssessmentV2 extends OrchestrationRecordMetaV2 {
  readonly schema_version: 'capability-assessment/v2'
  readonly assessment_id: string
  readonly request_id: string
  readonly context_record_id: string
  readonly normalization: 'complete' | 'needs-input' | 'rejected'
  readonly requirements: readonly {
    id: string; capability: string; necessity: 'required' | 'recommended' | 'optional'
    acceptance_refs: readonly string[]; evidence_refs: readonly string[]; constraints: readonly string[]
    risk: 'low' | 'medium' | 'high'
  }[]
  readonly questions: readonly { id: string; prompt: string; blocking: boolean }[]
  readonly risks: readonly string[]
  readonly proposal_evidence_ref: string
}

interface WorkGraphV2 extends OrchestrationRecordMetaV2 {
  readonly schema_version: 'work-graph/v2'
  readonly graph_id: string
  readonly graph_revision: number
  readonly assessment_id: string
  readonly task_plan_revision_id: string
  readonly task_plan_digest: `sha256:${string}`
  readonly dependency_edges: readonly {
    from: string; to: string; reason: 'data' | 'resource' | 'ordering' | 'gate'
  }[]
  readonly execution_groups: readonly { id: string; mode: 'serial' | 'parallel'; work_item_ids: readonly string[] }[]
  readonly acceptance_coverage: readonly { acceptance_id: string; work_item_ids: readonly string[] }[]
  readonly status: 'draft' | 'validated' | 'frozen' | 'superseded'
}

interface CapabilityResolutionV2 extends OrchestrationRecordMetaV2 {
  readonly schema_version: 'capability-resolution/v2'
  readonly resolution_id: string
  readonly assessment_id: string
  readonly graph_id: string
  readonly policy_digest: `sha256:${string}`
  readonly status: 'resolved' | 'needs-input' | 'blocked'
  readonly bindings: readonly {
    work_item_id: string; skill_id: string; skill_version: string; mcp_ids: readonly string[]
    mode: 'serial' | 'parallel'; source: 'user' | 'automatic' | 'hybrid'; depends_on: readonly string[]
  }[]
  readonly candidates: readonly {
    capability: string; candidate_id: string; kind: 'skill' | 'mcp'
    selected: boolean; rejected_reasons: readonly string[]; rationale: string
  }[]
  readonly blockers: readonly string[]
  readonly binding_digest: `sha256:${string}`
}
```

```ts
interface RunLeaseV1 {
  readonly lease_id: string
  readonly owner_id: string
  readonly acquired_at: string
  readonly heartbeat_at: string
  readonly expires_at: string
  readonly generation: number
}

interface SkillRunV2 extends OrchestrationRecordMetaV2 {
  readonly schema_version: 'skill-run/v2'
  readonly run_id: string
  readonly attempt_id: string
  readonly attempt: number
  readonly work_item_id: string
  readonly skill_id: string
  readonly skill_version: string
  readonly mcp_ids: readonly string[]
  readonly status: 'queued' | 'claimed' | 'running' | 'waiting-input' | 'completed' | 'failed' | 'interrupted' | 'cancelled'
  readonly lease?: RunLeaseV1
  readonly input_refs: readonly string[]
  readonly result_id?: string
  readonly prior_attempt_id?: string
  readonly failure?: { code: string; retryable: boolean; detail_ref?: string }
  readonly started_at?: string
  readonly finished_at?: string
}

interface SkillResultV2 extends OrchestrationRecordMetaV2 {
  readonly schema_version: 'skill-result/v2'
  readonly result_id: string
  readonly run_id: string
  readonly status: 'completed' | 'failed' | 'blocked' | 'incomplete' | 'corrupt'
  readonly contract_status: 'validated' | 'unknown' | 'invalid'
  readonly output_schema_id?: string
  readonly summary?: string
  readonly raw_output?: { ref: string; digest: `sha256:${string}`; media_type: string; byte_length: number }
  readonly artifacts: readonly {
    id: string; kind: 'file' | 'diff' | 'document' | 'json' | 'text' | 'url' | 'report' | 'value' | 'unknown'
    ref: string; digest: `sha256:${string}`; media_type?: string; byte_length?: number
  }[]
  readonly validation_refs: readonly string[]
  readonly diagnostics: readonly string[]
}
```

## 4. State definitions

### Change state

```text
draft → contextualizing → assessing → planning → planned → ready → executing
executing → reviewing → verifying → completed
```

Recoverable side states:

```text
contextualizing|assessing|planning|executing|reviewing|verifying → waiting-input
planning|planned|ready|executing|reviewing|verifying → blocked
ready|executing|waiting-input|blocked → paused
executing|verifying → failed
any non-terminal → cancelled
paused → resume_status
blocked|failed → planning (replan) or ready/queued (validated retry)
```

Terminal states are `completed` and `cancelled`. `failed` is recoverable only through explicit retry/replan policy. `completed` requires successful required gates and no active/expired lease.

### Work Item state

```text
pending → ready → queued → claimed → running
running → waiting-input | reviewing | verifying | completed | blocked | failed | interrupted | cancelled
interrupted|failed|blocked → queued (new attempt only)
```

An item becomes ready only when every dependency is completed with required artifact/validation refs, bindings are pinned, policy allows effects and resource claims are available.

### Run state

```text
queued → claimed → running → completed
claimed|running → waiting-input | failed | interrupted | cancelled
interrupted|failed → queued (new attempt; never reuse run/attempt id)
```

Lease states are `none → active → renewed → expired|released|revoked`. Only an active matching lease generation may heartbeat or complete a run.

### Gate state

```text
pending → passed | rejected | waived
rejected → pending only after new evidence or a new plan revision
```

`waived` requires an allowed actor, policy permission, rationale and immutable waiver receipt. Model confidence cannot waive a gate.

### Command/event state

```text
received → decoded → authorized → revision-checked → applied → event-published → snapshot-published → acknowledged
received|decoded|authorized|revision-checked → rejected
event-published without snapshot-published → recoverable orphan (not committed until current snapshot head references it)
```

The atomic current snapshot pointer is the commit point. Unreferenced event files are not part of canonical history.

## 5. Typed command inventory

| Command | Required state | Guards | Durable effects |
| --- | --- | --- | --- |
| `accept-request` | none | request/context identity, policy, limits | request + draft snapshot |
| `record-context` | draft/contextualizing | anchored repository, digests | context record, assessing |
| `record-assessment` | assessing/waiting-input | request/context binding, bounded proposal | assessment, planning/waiting-input |
| `freeze-work-graph` | planning | DAG, coverage, frozen TaskPlan | graph, planned |
| `resolve-capabilities` | planned | pinned descriptors, user intent, permissions, dependencies | resolution, ready/blocked |
| `start-change` | ready | runnable item, scheduler readiness | executing |
| `enqueue-work-item` | executing | dependencies/evidence/resources | queued item |
| `claim-run` | queued | no active lease, worker capacity | claimed run + lease |
| `heartbeat-run` | claimed/running | lease id/generation/owner/time | renewed lease only |
| `begin-run` | claimed | active lease, pinned binding | running |
| `complete-run` | running | active lease, bounded result, matching run | terminal run + result |
| `record-validation` | verifying/running | matching item/result/digest/validator | report, item/gate update |
| `evaluate-gate` | reviewing/verifying | all required evidence or allowed waiver | immutable decision |
| `pause-change` | ready/executing/waiting-input/blocked | actor policy, no unsafe critical section | paused + resume_status |
| `resume-change` | paused | context/policy still current | prior safe state or blocked |
| `retry-work-item` | failed/interrupted/blocked | retryable or explicit user policy, retry budget | new attempt queued |
| `cancel-change` | non-terminal | actor policy; executor cancellation requested | cancelled, leases revoked |
| `replan-change` | non-terminal except completed/cancelled | reason, context revision | supersede graph, planning |
| `bind-artifact` | waiting-input/blocked/reviewing/verifying | digest/ref/actor ownership | artifact binding and reevaluation |

Every command includes `command_id`, `idempotency_key`, `expected_revision`, actor, issued time and correlation/causation. A stale revision or command digest conflict produces no event and no state write.

## 6. Smooth-flow rules

1. Every UI/CLI action maps to one typed command and one visible acknowledgement or typed rejection.
2. Every status exposes `reason_code`, `next_actions` and the evidence/guard that caused it; no generic “处理中” without a durable run or command.
3. Snapshot and event streams are monotonic. Reconnect uses revision/event cursor and rehydrates from snapshot before applying later events.
4. Pause never loses leases; it stops new claims and lets an explicitly safe critical section settle or cancels according to policy.
5. Retry never rewrites history; it creates a new attempt linked to the prior attempt/result/failure.
6. Replan supersedes, never deletes, the old graph/resolution. Completed evidence remains addressable but cannot silently satisfy incompatible new acceptance refs.
7. Unknown, partial and incompatible states are explicit blockers, not empty arrays or false success.

## 7. Traceability chain

```text
Request(correlation)
  → Context(record/digest)
  → Assessment(proposal evidence)
  → Graph(plan revision/digest)
  → Resolution(binding/policy digest)
  → Command(idempotency/expected revision)
  → Event(before/after digest)
  → Run(attempt/lease/input refs)
  → Result(raw/artifact digests)
  → Validation(report/evidence refs)
  → Gate(decision/actor/rationale)
  → Snapshot(event head/revision)
```

No link may be inferred from mtime, nearest Change, free text or the newest file. Missing linkage fails closed.

## 8. Failure and recovery matrix

| Failure | Canonical result | Recovery |
| --- | --- | --- |
| Provider/model malformed or oversized | assessment rejected/waiting-input | new proposal with same request correlation |
| Catalog/permission/resource conflict | resolution blocked | user/policy/catalog revision then re-resolve |
| Stale command revision | typed conflict, zero write | reload current snapshot and issue new command ID |
| Event write fails before publication | zero commit | retry same idempotency key |
| Event published, snapshot publication fails | event remains unreachable orphan | recovery retries snapshot or ignores orphan |
| Snapshot corrupt/unsupported | readiness failed, no scheduler claims | restore backup/migrate; never fall back to stale projection |
| Worker crash/lease expiry | run interrupted | policy-controlled new attempt or user retry |
| Executor failure | run failed, result invalid | bounded retry/replan |
| Validator unknown/missing | item blocked/verification incomplete | attach validator/evidence or explicit permitted review |
| SSE disconnect | no canonical change | reconnect from last revision/event cursor |
| Shutdown | stop claims, settle/revoke leases, flush snapshot | restart recovery report |

## 9. TDD and end-to-end seams

Pre-agreed public seams, selected per the user's instruction to proceed with recommended choices:

1. Kernel codec/reducer seam: v2 decode + typed command transition examples.
2. Durable repository seam: append/read/events/recover under crash, CAS and idempotency.
3. Planner seam: request/context/catalog → frozen graph/resolution.
4. Scheduler seam: durable board + ports → leases/runs/results/gates.
5. Server seam: authenticated HTTP command/query/SSE contract.
6. Dashboard seam: typed snapshot/event client and user controls.
7. CLI seam: same command/query protocol and exit/JSON contract.
8. Golden workflow seam: isolated real repository from intake through completed or explicit blocker, including restart and reconnect.

Each slice follows RED → minimal GREEN → review. Tests assert public behavior and fixed examples, not implementation details or self-derived expectations.
