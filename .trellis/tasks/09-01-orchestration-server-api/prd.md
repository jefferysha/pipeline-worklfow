# Orchestration server API and SSE

## Goal

提供受保护的编排查询、命令、事件回放、SSE 和运行健康接口

## Requirements

- Add `/api/orchestration` query, command, event replay and SSE routes backed by the durable orchestration repository and scheduler.
- Enforce loopback/DNS-rebinding, token/auth, JSON content type, bounded body/replay limits, actor identity and command idempotency.
- Return typed snapshots, capabilities/readiness, `409` revision conflicts with latest revision, and non-secret error diagnostics.
- Support create/intake, current snapshot, events after cursor, stream heartbeat/reconnect, pause/resume/approve/reject/retry/cancel/replan/bind-artifact.
- Keep SSE read-only and make CLI/Dashboard consume the same response decoders.

## Acceptance Criteria

- [ ] Unauthorized, wrong-host, malformed, oversized and stale-revision requests are rejected before mutation.
- [ ] A command replay returns the original result; a conflicting command ID or CAS returns a deterministic error.
- [ ] SSE sends an initial snapshot, monotonic event IDs, heartbeats and bounded replay after reconnect without duplicate application.
- [ ] Server restart reopens the same repository and exposes truthful readiness/compatibility state.
- [ ] Integration tests cover all command kinds, conflict responses, stream close/shutdown and secret/raw-output redaction.
