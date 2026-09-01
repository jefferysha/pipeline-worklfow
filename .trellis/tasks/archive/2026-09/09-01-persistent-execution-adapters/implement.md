# Persistent execution scheduler and adapters — implementation

1. Define lease/heartbeat/retry policy records and scheduler port over the durable repository.
2. Adapt v1 execution loop to durable append operations and deterministic outcome ordering.
3. Add startup orphan recovery, timeout/cancellation, graceful shutdown and bounded concurrency.
4. Connect existing runner/sandbox and MCP adapters through executor/validator ports; preserve output redaction and artifact refs.
5. Add crash/lease/retry/parallel-conflict/validator and shutdown integration tests.
6. Run Automation/Kernel regression and production build checks.

Rollback: disable scheduler claims and leave boards recoverable/read-only; do not auto-retry unknown results.
