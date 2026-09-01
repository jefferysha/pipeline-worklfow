# Production orchestration dashboard — implementation

1. Add response decoders, orchestration client and reconnecting SSE hook with bounded event handling.
2. Build board lanes/details for Change/Work Item/Run/Gate, Skill/MCP/version, dependencies, artifacts, leases and blockers.
3. Add typed command controls and stale-revision/error/retry UI; wire capability/readiness fallback.
4. Add accessibility, keyboard, contrast, reduced-motion, refresh/reconnect and no-secret/no-raw-output tests.
5. Run web typecheck/tests/build plus server integration fixture and visual smoke checks.

Rollback: feature-flag the board route and keep existing Dashboard views/read-only projections available.
