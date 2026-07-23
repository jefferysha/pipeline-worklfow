---
name: writing-plans
description: First-party executable implementation planning with tests and verification.
license: MIT
metadata:
  author: pipeline-lite
---

# Writing Plans

Write an implementation plan that another engineer can execute without reconstructing context.

- Read all recorded OpenSpec inputs and ADRs before planning.
- Break work into small ordered tasks; name exact files, symbols, migrations, and tests.
- State the expected behavior and verification command for every task.
- Identify compatibility, rollout, and rollback conditions.
- Save the plan under `docs/superpowers/plans/` and register it with `pipeline document record`.

Do not claim a task is complete merely because a plan exists; execution and verification remain
separate phases.
