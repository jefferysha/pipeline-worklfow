# Canonical orchestration aggregate v2 — design

## Deep module

Create one Kernel module whose narrow interface is command decision, event evolution and read-only projection. It hides the transition table, state invariants, typed rejection reasons, bounded effect generation, correlation/causation and snapshot derivation. It is the only production authority for Change, WorkItem, Attempt, Lease, Validation and Gate.

```text
V2 command + current Aggregate
        ↓ decide (pure)
accepted event/effects | typed rejection
        ↓ evolve/fold (pure)
next Aggregate → BoardSnapshotV2 projection
```

V1 Board reducer, TaskRun read model and WorkflowRun state are compatibility adapters. They cannot be consulted to override the aggregate. The complete schema/state/transition contract lives in the parent `contracts.md` and is normative.

## Module shape

- `v2-types.ts`: closed wire/domain shapes and state enums.
- `v2-codec.ts`: bounded closed decoders with stable error paths.
- `v2-decide.ts`: command guards and accepted/rejected event production.
- `v2-evolve.ts`: event fold and invariant checks.
- `v2-project.ts`: BoardSnapshotV2 and compatibility projections.
- `v2-adapters.ts`: explicit V1/TaskRun/WorkflowRun compatibility view.

The public test seam is `decode → decide → evolve/fold → project`; tests never reach private helpers.

## Invariants

- One accepted command advances revision exactly once and produces one linked event.
- Command identity/digest, correlation and causation are immutable.
- Only a matching active lease generation can start, heartbeat or complete an attempt.
- Retry creates a new attempt; replan supersedes old graph/resolution; neither rewrites history.
- Completed requires all required work and gates; unknown validation cannot satisfy proof.
- Terminal states reject later core commands except exact idempotent replay handled by the repository layer.

## Compatibility

V1 remains exported. New v2 exports are additive. Compatibility adapters may return `available`, `degraded` or `unsupported`; they never invent v2 identities, leases or evidence.
