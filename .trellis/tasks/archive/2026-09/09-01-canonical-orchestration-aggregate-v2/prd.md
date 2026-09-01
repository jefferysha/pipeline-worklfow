# Canonical orchestration aggregate v2

## Goal

统一 Change、WorkItem、Attempt、Lease、Validation、Gate 的 v2 schema、状态机、事件与兼容投影

## Requirements

- Define additive v2 schemas for Request, Context, Assessment, WorkGraph, Resolution, WorkItem, Attempt, Lease, Result, Validation, Gate, Command, Event and Snapshot.
- Provide one aggregate revision axis and causal chain for Change/WorkItem/Attempt/Lease/Validation/Gate; V1 Board, TaskRun and WorkflowRun become explicit adapters/projections.
- Separate command decision, immutable event/effect and event fold; the aggregate is pure and performs no filesystem, clock, ID, network or provider calls.
- Encode every legal/illegal transition, guard, reason code and next action; unknown or unverifiable states fail closed.
- Preserve existing V1 public contracts and archived workflow state through decoders/adapters without creating a second authority.

## Acceptance Criteria

- [ ] Every v2 schema is closed, bounded, versioned and covered by good/base/bad codec fixtures.
- [ ] Table-driven transition tests cover all Change, WorkItem, Run/Attempt, Lease and Gate states, including pause/resume/retry/replan/cancel.
- [ ] A command sequence produces deterministic events and `fold(events)` equals the projected snapshot with monotonic revision/digest lineage.
- [ ] Illegal order, stale identity, wrong lease generation, missing evidence and terminal-after-event sequences produce typed rejection with zero state change.
- [ ] V1 BoardSnapshot/TaskRun/WorkflowRun fixtures project to an honest v2 compatibility view or an explicit unavailable/blocker state.
- [ ] No Automation/Server/Dashboard module owns duplicate transition rules after adapters are introduced.
