# Persistent execution scheduler and adapters

## Goal

实现带租约、恢复、重试和验证门的生产 Skill/MCP 执行调度器

## Requirements

- Execute frozen WorkGraph items through a durable repository with unique run/attempt identities and worker leases.
- Add heartbeat, timeout, graceful cancellation, bounded retry policy, orphan recovery and deterministic serial/parallel waves.
- Adapt existing Automation runner/sandbox and MCP calls behind provider-neutral executor/validator ports; never let vendor SDKs enter Kernel.
- Carry dependency result refs and artifact metadata across restarts; keep raw output outside canonical state.
- Hand verified results to existing Workflow/review/gate guards; no automatic completion on unknown or invalid evidence.

## Acceptance Criteria

- [ ] A worker crash or lease expiry cannot cause duplicate active execution; recovery creates an auditable interrupted/requeued outcome.
- [ ] Retry creates a new attempt linked to the prior result and is limited by policy; user retry is idempotent.
- [ ] Pause/cancel is honored before claims, during heartbeat and after a settled wave; shutdown leaves no claimed run silently running.
- [ ] Parallel work executes only when graph, resources and policy allow it; blocking siblings cannot be overwritten by successful siblings.
- [ ] Executor errors, validator failures and opaque outputs map to typed failed/blocked states with redacted diagnostics.
- [ ] A real fixture completes execute → artifact → validate/review or stops with a reproducible blocker.
