# Orchestration server API and SSE — design

## Boundary

Add typed route modules under `packages/server/src` that call the shared repository/scheduler and reuse existing loopback, token, DNS-rebinding and `createServerTransport` protections. Server never mutates board fields directly.

## Protocol

`POST /api/orchestration/changes`, `GET /api/orchestration/changes/:id`, `GET .../events?after_revision`, `GET .../stream`, `POST .../commands`. Commands contain `command_id`, `expected_revision`, actor, type and bounded payload. Response envelopes include `snapshot`, `revision`, `request_id` and typed error code. `409` includes current revision/snapshot digest.

SSE sends an initial snapshot, monotonic event IDs, heartbeats and bounded replay. Reconnect uses `Last-Event-ID` or query cursor; stream is read-only and closes cleanly on shutdown.
