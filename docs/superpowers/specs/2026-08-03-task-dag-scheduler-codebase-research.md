# Task DAG Scheduler codebase research

## Scope

This research maps the existing AFK admission, scheduling, lifecycle, cancellation, retry, and read-model seams that a WorkItem DAG scheduler can reuse. It does not change runtime behavior.

## Current authority boundaries

- `packages/automation/src/admission/loop-admission-service.ts` owns the authoritative preflight. Reservation is created under the governance and ledger locks before `queued -> scheduled` claim.
- `packages/automation/src/scheduler/scheduler-service.ts` owns bounded concurrent Change execution and deliberately uses `Promise.allSettled` so one candidate cannot suppress another candidate's settlement.
- `packages/automation/src/scheduler/scheduler-support.ts` defines the stable `RoundReport`, structured failure phases/kinds, the state-writer CAS port, and the execution-wiring fail-closed boundary.
- `packages/automation/src/admission/execution-context.ts` carries attempt, workflow-run, loop, policy, and prepared-skill coordinates. A WorkItem scheduler must extend or bind to these coordinates instead of inventing parallel ownership.
- `packages/automation/src/queue/state-machine.ts` and `packages/automation/src/queue/claim.ts` remain the owner of automation state transitions and terminal CAS.
- `packages/server/src/afk.ts` projects lane status and exposes existing cancel/retry behavior. It is a read/write adapter, not a scheduler truth source.

## Existing safety properties to preserve

1. Admission occurs before claim and fails closed when required policy, wiring, evidence, or durable state is unavailable.
2. Concurrency is bounded by a semaphore; terminal state is committed by owner-aware CAS.
3. Cancellation writes the durable marker before killing the sandbox.
4. Retry starts only from explicit retryable terminal states and resets ownership through canonical state APIs.
5. A round reports infrastructure and ledger failures as non-success; they are not swallowed as ordinary denials.
6. Parent/child grouping is currently presentation metadata and must not become an implicit dependency edge.

## Integration seams

- Add a pure kernel TaskPlan DAG compiler that accepts validated WorkItems and emits deterministic waves, blockers, and normalized resource conflicts.
- Add an automation adapter that admits a frozen TaskPlan revision, then executes ready WorkItems through the existing attempt/preparation/admission infrastructure.
- Keep the current Change scheduler as the outer lifecycle owner. The WorkItem scheduler is a subordinate plan executor and cannot independently publish Change terminal state.
- Project a stable task-run DTO through the server. The server must serialize domain results and must not recompute graph readiness.

## Failure and recovery mapping

| Condition | Domain result | Runtime behavior |
| --- | --- | --- |
| cycle | `invalid-plan` blocker | no WorkItem admitted |
| overlapping normalized write claims | deterministic serialization or invalid conflict | explain selected ordering; never unsafe parallel execution |
| upstream terminal failure | `blocked-upstream` | descendants stay unclaimed |
| upstream output changes after retry | `invalidated` | descendants and integration verdict are invalidated |
| cancel requested | `cancelled` | marker-before-kill and owner CAS remain authoritative |
| process restart | resumable snapshot | recompute readiness only from durable frozen plan and attempt facts |
| missing evidence/permission/hard confirmation | admission blocker | fail closed; recommended defaults cannot waive it |

## Conservative decisions

- Parallelism is derived from explicit `depends_on` plus normalized write claims; user-authored wave numbers are not accepted as truth.
- A resource conflict between otherwise ready WorkItems is serialized by stable WorkItem ID when the claims are valid and comparable. Ambiguous or invalid claims block admission.
- Parent completion is derived from all owned descendants plus integration validators; it is never directly writable.
- AFK consumes only a frozen, valid TaskPlan revision with a matching fingerprint and complete admission evidence.

## Open questions for Spec

- Exact attempt journal record names and whether WorkItem attempt facts live in the existing loop ledger or a dedicated append-only task journal.
- Exact resource namespace and normalization rules for paths, named services, database schemas, and opaque external resources.
- Whether resume is expressed as a new scheduler operation or as deterministic re-admission of the same frozen revision.
