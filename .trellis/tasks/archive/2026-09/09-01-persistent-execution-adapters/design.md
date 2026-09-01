# Persistent execution scheduler and adapters — design

## Boundary

Move the v1 `runCapabilityOrchestration` sequencing behind `OrchestrationRepository`. The scheduler owns leases, heartbeats, timeout and retry policy; Kernel owns state transitions. Executor, validator and MCP integrations are ports with bounded observations.

## Runtime

`readyWave` → atomic claim + lease → begin run → invoke Skill/MCP with signal → heartbeat → bounded observation → validator → complete/record validation → next wave. A lease includes owner, expiry and attempt. On startup, expired claimed/running runs become interrupted and follow explicit retry policy.

Cancellation and shutdown are idempotent. Parallel runs are admitted only when graph group, resource claims and policy agree. Retry uses a new attempt and prior result refs; raw output is stored in an artifact port.
