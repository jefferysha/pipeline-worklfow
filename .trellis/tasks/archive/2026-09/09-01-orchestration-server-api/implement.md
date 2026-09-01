# Orchestration server API and SSE — implementation

1. Add request/response codecs and route dependency interfaces; map repository errors to stable HTTP codes.
2. Wire create/current/events/stream/commands and capability/readiness endpoints into server route dispatch.
3. Add auth/body/rate/replay limits, command idempotency and conflict payloads; redact secrets/raw output.
4. Add integration tests for every command, wrong host/token/content type, malformed bodies, replay cursors, reconnect, shutdown and restart.
5. Run server tests, full typecheck/build and architecture/comments gates.

Rollback: leave existing routes enabled while orchestration routes advertise unavailable through capabilities.
