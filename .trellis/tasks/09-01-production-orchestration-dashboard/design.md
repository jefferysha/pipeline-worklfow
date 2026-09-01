# Production orchestration dashboard — design

## Boundary

Add a typed orchestration client and board view under `packages/dashboard-app/src`. Existing views remain intact. The board is a projection of server snapshots/events; it never owns canonical state or invents optimistic completion.

## UI model

Normalize snapshot into Change header, Work Item lanes, Run timeline, Gate/evidence panel and blocker/action rail. Keep revision and last event cursor in the client. Commands send the current revision and display a conflict reload path. SSE initial snapshot + replay updates the same reducer used by refresh.

Controls require confirmation for cancel/replan/reject, show disabled reasons from readiness/policy and preserve keyboard/focus/reduced-motion behavior. Opaque outputs show safe summaries and artifact refs only.
