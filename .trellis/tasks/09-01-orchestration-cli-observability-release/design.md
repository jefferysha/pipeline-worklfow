# CLI, observability and release hardening — design

## Boundary

CLI commands call the same Server/application protocol and use the same decoders as Dashboard. A bounded telemetry/audit sink records metadata only. Release tooling owns readiness, migration, backup/restore, packaging and graceful shutdown checks.

## Evidence and operations

Every request/run/command carries correlation and causation IDs. Metrics cover selection, latency, retries, failures, validator outcomes, human intervention and stage usage; labels are bounded and payloads redacted. Readiness checks schema compatibility, storage integrity, permissions, release assets and scheduler dependencies.

Golden E2E uses fake provider/executor/validator and an isolated repository. Production smoke adds restart, backup/restore, upgrade/rollback and generated bundle checks without requiring external credentials.
