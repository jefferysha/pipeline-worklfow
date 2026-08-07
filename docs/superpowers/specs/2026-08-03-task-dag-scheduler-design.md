# Task DAG Scheduler design

## Outcome

Tenon can turn a validated frozen TaskPlan into deterministic execution waves, safely admit AFK execution, propagate failure/invalidation, and return an explainable read model without replacing existing Change ownership or review gates.

## Selected design

The kernel owns a pure `compileTaskSchedule(plan)` service. It validates graph integrity, builds explicit dependency edges, groups ready WorkItems into deterministic waves, and serializes valid write-claim conflicts by stable WorkItem ID. The result is immutable and contains both runnable waves and structured blockers.

Automation owns `TaskPlanRun`, `WorkItemAttempt`, and admission orchestration. A run binds the exact TaskPlan revision/fingerprint and the frozen interaction/effective-permission snapshot. Existing reservation, preparation, verification, cancellation, and owner-CAS ports remain authoritative. The server projects the resulting DTO through `GET /api/task-runs/:change` and accepts only expected-state guarded `retry|cancel|resume` through `POST /api/task-runs/:change/operations`.

Dashboard integration lives in the existing AFK feature domain. Its API client decodes `task-run/v1`; a pure model maps stable DTO fields to presentation state; the React panel renders waves, parallelism, attempts, validators, invalidation ancestry, blockers and server-authorized operations. The UI never reimplements scheduler or admission rules.

## Key rules

1. Only explicit `depends_on` creates dependency edges; TaskGroup nesting never does.
2. Every dependency target must exist in the same frozen revision and the graph must be acyclic.
3. Two ready WorkItems with overlapping normalized write claims never execute concurrently.
4. A valid comparable conflict is serialized deterministically; an ambiguous claim blocks the plan.
5. An upstream failure blocks descendants. A successful upstream retry invalidates descendant results produced from older input/output digests.
6. `cancel`, `retry`, and `resume` create durable attempt facts; they do not rewrite prior facts.
7. Parent completion is derived from child terminal success plus parent/cross-task integration validators.
8. `recommended-defaults` may choose routine scheduler decisions already authorized by the frozen policy. It cannot satisfy a hard confirmation, missing permission, publication, cost, production, or external-side-effect boundary.
9. Dashboard operations are enabled only from the DTO's server-authorized operations and always send expected run revision/state; stale/conflict forces a refetch.
10. New Dashboard states and actions provide zh/en text, semantic controls, visible focus, loading/empty/error feedback, and desktop keyboard acceptance.

## State model

`TaskPlanRun`: `pending -> admitted -> running -> {succeeded|failed|cancelled|blocked}`. A blocked run can be re-admitted only when its frozen inputs still match or by creating a new revision.

`WorkItemAttempt`: `pending -> ready -> running -> {succeeded|failed|cancelled}` with `blocked-upstream` and `invalidated` as non-runnable derived states. Retry creates attempt `n+1`; it never mutates attempt `n`.

## Stable read model

The `task-run/v1` DTO contains plan identity, fingerprint, interaction mode, effective permissions, admission verdict, ordered waves, derived parallelism, WorkItem attempts, normalized claims, blockers, invalidation ancestry, validator verdicts, and allowed operations. Every blocker includes a code, human-safe detail, and a remediation code/label. Unknown enum values decode to an explicit unknown/degraded presentation instead of crashing or being treated as success.

## Alternatives rejected

- Hand-authored waves: they drift from dependencies and resource claims.
- Treating TaskGroup nesting as edges: it fabricates semantics explicitly absent from TaskPlan.
- A second scheduler-owned Change state machine: it would race the current queue/CAS lifecycle.
- UI-side readiness calculation: it would create a second truth source.

## Assumptions / Decision Log

- Assumption: PR1 supplies stable WorkItem IDs, validated dependency references, and normalized resource claim inputs.
- Assumption: PR2 and PR3 supply bound evidence and frozen interaction/effective-permission snapshots.
- Decision: preserve Change as the outer scheduling/merge unit; WorkItems are subordinate execution units.
- Decision: deterministic serialization is allowed only for valid comparable write claims; malformed/ambiguous claims fail closed.
- Decision: resume recomputes derived readiness from durable facts but never changes the frozen plan.

## Verification matrix

Tests cover stable wave ordering, cycles, missing dependency targets, duplicate ownership, write conflicts, ambiguous claims, upstream failure, retry invalidation, cancel/resume, integration validators, admission policy/evidence/permission/hard-confirmation blockers, DTO unknown-value stability, API auth/conflict/error envelopes, Dashboard loading/empty/error/blocked/success states, zh/en, keyboard operations and desktop browser behavior.

```coverage
touches: auth, automation-admission, scheduler, api-boundary
L1_api:      filled -> #stable-read-model
L2_data:     filled -> #state-model
L3_rules:    filled -> #key-rules
L4_state:    filled -> #state-model
L5_errors:   filled -> #verification-matrix
L6_security: filled -> #key-rules
L7_perf:     filled -> #verification-matrix
L8_deps:     filled -> #selected-design
L10_terms:   filled -> #state-model
```
