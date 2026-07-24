# Design

Carry the two optional binding flags through `RawInputs`, then assemble them into
`NewLoopEntryInput` independently of starter-template metadata. Starter loops
continue to obtain their compiled template id/version while explicit CLI flags
remain authoritative for workflow and skill profile selection.

The kernel serializer and schema already support both optional fields, so the
change belongs only in CLI input assembly plus its direct tests.

The built-in `simple` Workflow must also close its own terminal branches. Add
the existing declarative `archive-run` action to edges entering `done` and
`escalated`. Transition execution treats any selected `archive-run` action as a
terminal completion signal and writes `phase_status=done` together with the
action's existing archived fields. This avoids a second imperative special case
for the `simple` workflow name.
