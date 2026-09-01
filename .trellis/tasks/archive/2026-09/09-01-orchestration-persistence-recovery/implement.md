# Durable orchestration persistence and recovery — implementation

Prerequisite: the canonical v2 aggregate schemas, decide/evolve behavior and compatibility projection are complete and checked.

1. Define record types/codecs/limits and public exports; add path-safe IDs and SHA-256 canonical serialization.
2. Implement atomic snapshot/event publication with change lock, command idempotency index and revision CAS.
3. Implement bounded read/replay/recovery diagnostics and compatibility/readiness adapter.
4. Add crash injection, concurrent writer, duplicate command, corruption, traversal/symlink and migration tests.
5. Run Kernel tests, build, architecture/comments and diff checks before archiving.

Risk files: `packages/kernel/src/orchestration/*`, `packages/kernel/src/state/*`. Roll back by disabling the new repository adapter; never delete existing `.pipeline-run` or transition files.
