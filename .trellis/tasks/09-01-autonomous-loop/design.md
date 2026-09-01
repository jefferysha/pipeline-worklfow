# Production autonomous development platform — technical design

The complete v2 schema inventory, state definitions, transition guards, traceability chain and TDD seams are frozen in [contracts.md](./contracts.md). This design explains module ownership and integration; it must not override that canonical contract.

## 1. Architecture boundary

```text
Natural-language request + repository facts
        ↓ bounded proposal / context adapters
CapabilityAssessment + frozen WorkGraph/TaskPlan
        ↓ Kernel resolver + explicit user bindings
Persistent orchestration repository (snapshot + event log + CAS)
        ↓ lease-aware application scheduler
Skill/MCP executor ports → opaque ResultEnvelope → validator/review gates
        ↓
Canonical board snapshot ← typed commands ← Server/SSE ← Dashboard / CLI
```

- `packages/kernel`: schemas/codecs, immutable board reducer, transition guards, canonical event/effect records and persistence primitives.
- `packages/automation`: provider boundary, planner/router, scheduler, lease/recovery policy and executor/validator adapters. It never owns a second state machine.
- `packages/server`: auth, HTTP/SSE transport, persistent repository wiring, command idempotency and readiness/metrics endpoints.
- `packages/dashboard-app`: typed query/command client, board projection, reconnect and user control UX.
- `packages/cli`: thin parity adapter and machine-readable output.
- `packages/channel`/`tap`: transport and diagnostics only; never canonical business state.

## 2. Durable data model

The existing `BoardSnapshotV1` remains the decoded state. Add a versioned durable repository around it:

```ts
interface OrchestrationRepository {
  read(changeDir: string): Promise<BoardSnapshotV1 | undefined>
  append(changeDir: string, command: BoardCommandV1): Promise<AppendResult>
  events(changeDir: string, afterRevision?: number): AsyncIterable<BoardEventV1>
  recover(changeDir: string): Promise<RecoveryReportV1>
}
```

`append` acquires the change lock, checks `expected_revision`, applies the Kernel reducer, writes an immutable event/transition record, then atomically publishes the complete snapshot. Snapshot filenames and event IDs are path-safe; incomplete temp files are ignored. A checksum and schema version are checked before every read. Projection to legacy `.pipeline.yaml` is best effort and never becomes the source of truth.

Persisted records are append-compatible and include `schema_version`, `change_id`, `revision`, `command_id`, `actor`, `issued_at`, `correlation_id`, `causation_id`, `event`, `state_digest` and bounded effect metadata. Raw Skill/provider output is referenced by digest/ref in an artifact store port, never embedded in board state.

## 3. Planning and routing

`DevelopmentRequestV1` is accepted with repository identity and policy snapshot. A context adapter captures branch/head/dirty/runtime/catalog facts. Provider output is `unknown` and passes the existing bounded JSON boundary; Kernel codecs normalize it exactly once. A deterministic planner maps requirements to a frozen `WorkGraphV1`, preserving explicit user dependencies. Resolver order is:

1. reject unavailable or malformed descriptors;
2. enforce user-selected IDs, versions, modes and dependencies;
3. filter permissions, required MCPs, validators and resource conflicts;
4. choose automatic candidates deterministically, recording all candidates/reasons;
5. leave unresolved capabilities as `needs-input`/`blocked`, never inventing a scene or tool.

## 4. Execution and recovery

The scheduler reads a durable board, computes a ready wave, and creates a unique run/attempt with a lease before invoking a port. Lease heartbeat and timeout are host-owned. On restart, expired `claimed/running` runs become `interrupted` and are either requeued according to bounded retry policy or blocked with a recovery reason. Cancellation is idempotent and observed before new claims and after settled waves. A retry always creates a new attempt referencing the prior result and uses the latest revision.

Parallel execution is allowed only for graph groups marked parallel, independent dependencies, compatible resource claims and policy-approved permissions. Each settled result is applied in deterministic order; a blocking sibling cannot be overwritten by a successful sibling.

## 5. Server and board protocol

Endpoints are namespaced under `/api/orchestration`:

- `POST /changes` — create/accept request and return `{snapshot, revision}`.
- `GET /changes/:id` — current canonical snapshot plus readiness/capabilities.
- `GET /changes/:id/events?after_revision=N` — bounded replay.
- `GET /changes/:id/stream` — SSE snapshot/event stream with heartbeat and reconnect cursor.
- `POST /changes/:id/commands` — typed command with `command_id`, `expected_revision`, actor and payload.

Every write uses the existing loopback/token/DNS-rebinding protections, bounded JSON body, idempotency by command ID, and `409` on revision conflict. SSE never becomes a write path; a reconnect first receives a current snapshot, then events after the supplied cursor.

## 6. Security and operations

Default policy is deny for filesystem/network/git/deploy effects until explicitly admitted. All paths are anchored to registered repositories and reject symlinks/path traversal. Logs redact tokens, secrets, provider prompts and raw outputs. Limits cover body bytes, proposal/result bytes, graph nodes, concurrent runs, lease duration, retry count and event replay. Shutdown stops claims, requests executor cancellation, flushes event/snapshot writes and exits only after leases are marked interrupted.

## 7. Compatibility, migration and rollback

- Existing `task-plan/v1`, WorkflowRunRepository and `.pipeline-run` records remain readable.
- New orchestration records are additive; incompatible changes require `v2` schemas and a migration reader.
- On upgrade, run a read-only migration/readiness check; only then enable the orchestration scheduler.
- Rollback disables new endpoints/scheduler while preserving canonical snapshots and event files; a later binary can replay them.
- No destructive migration or remote force update is allowed as part of this release.

## 8. Verification strategy

Each child owns unit and integration tests for its boundary. The parent gate requires a real fixture that executes intake → planning → routing → persistent run → opaque artifact → validation/review, plus crash injection, concurrent CAS, SSE reconnect, Dashboard control, CLI parity, security limits and release readiness checks.
