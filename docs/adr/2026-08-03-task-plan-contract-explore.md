# ADR: Introduce canonical TaskPlan v1 beside legacy tasks.md

## Status

Accepted for Spec.

## Context

The current Markdown todo projection has no stable WorkItem identity or provable dependency/coverage/resource semantics. Existing `CanonicalTask` models a Change and cannot safely become a WorkItem aggregate.

## Decision

Create a pure kernel TaskPlan bounded context and a Change-locked immutable revision store. Persist opaque identities, explicit catalogs/relationships, deterministic validation, and a stable read DTO. Keep `tasks.md` as a one-way compatibility projection; legacy-only input never invents missing relationships and is non-schedulable.

## Consequences

- Downstream evidence and scheduling can bind exact revisions/items.
- Existing todo/guard consumers remain compatible during migration.
- Projection drift becomes explicit and recoverable.
- New persistence, migration, and hostile-input tests are required.

## Rejected

Index/text-derived identity, reuse of Change tasks, bidirectional Markdown sync, inferred legacy semantics, and executable validators.
