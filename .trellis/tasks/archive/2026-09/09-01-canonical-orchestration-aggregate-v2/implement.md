# Canonical orchestration aggregate v2 — implementation

1. RED: add public codec fixtures for every v2 schema and fixed invalid/limit cases; then implement closed bounded codecs.
2. RED: add worked command→event→state examples for intake/context/assessment/plan/resolve/start; implement minimal decide/evolve path.
3. Repeat vertical slices for WorkItem/Attempt/Lease, result/validation/gates and pause/resume/retry/replan/cancel.
4. Add deterministic sequence/fold tests and invariant/property-style generated command sequences with fixed seeds.
5. Add honest V1 BoardSnapshot, TaskRun and WorkflowRun compatibility fixtures; remove or isolate duplicate state decisions only after equivalence is proved.
6. Export v2 interfaces additively and update Kernel orchestration spec with exact error/transition matrix.
7. Run focused Kernel tests, full Kernel regression, build, architecture/comments and diff checks.

Risk: persisted/wire compatibility. Do not rename or mutate V1. Roll back by removing additive v2 exports; no data migration occurs in this task.
