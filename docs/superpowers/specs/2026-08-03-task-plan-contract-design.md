# TaskPlan v1 contract design

## Outcome

Tenon has one versioned, persistent TaskPlan contract with stable identities, deterministic validation, a legacy-safe `tasks.md` adapter, and a stable read DTO that downstream evidence, scheduling, API, and Dashboard layers can reference without inventing relationships.

## Domain boundary

`packages/kernel/src/task-plan` owns pure types, ID validation, codec, validation, legacy conversion, and read projection. `packages/kernel/src/state/task-plan-store.ts` owns immutable revision publication, the mutable current pointer, the Change lock, and best-effort Markdown projection. Existing Change-level `CanonicalTask` and rolling `todo` DTO remain unchanged.

## Contract

`task-plan/v1` contains `TaskPlanRevision`, ordered `TaskGroup[]`, ordered `WorkItem[]`, requirement and acceptance catalogs, and ownership coordinates. IDs are opaque, persisted strings created by the caller; decoding never generates or recalculates them.

Each WorkItem has exact `requirement_refs`, `acceptance_refs`, `depends_on`, normalized `resource_claims`, `expected_outputs`, and versioned validator declarations. TaskGroup ownership is presentation structure only and creates no dependency.

## Key rules

1. Every group/item/revision/validator/output ID is unique and stable across title, order, and grouping edits.
   A revision ID is unique for the lifetime of its plan lineage, including current and immutable history.
2. Every WorkItem belongs to exactly one group; parent groups exist and the group tree is acyclic.
3. `depends_on` uses exact same-revision WorkItem IDs. Self, missing, duplicate, and cyclic edges are errors.
4. Requirement/acceptance catalogs are the explicit expected universes. Unknown refs, uncovered catalog entries, and duplicate assignment are reported deterministically.
5. Resource claims are a closed union. v1 supports exact project-relative `path`, `logical`, and `external` keys with `read|write`; paths use strict normalized segments and no glob inference.
6. Unordered overlapping writes are conflicts; dependency-ordered writes are valid and reported as serialized, not conflicts.
7. Expected outputs are typed declarations with stable IDs and safe relative refs where applicable. Validators are allow-listed declarations, never arbitrary shell commands.
8. Validation is bounded, read-once, recursively frozen, and returns stable sorted issues with `severity/code/path/related_ids`.
   Projection freezes only DTO-owned copies and never changes caller-owned inputs; deterministic ordering uses locale-independent ordinal comparison.

## Persistence and projection

Under one Change lock, publish an immutable revision file with no-replace semantics, then atomically replace `current.json` as the commit point. Afterwards rebuild `tasks.md` as a compatibility projection carrying revision/digest markers. Projection failure is explicit `pending/drift`; a valid current plan never falls back to hand-edited Markdown.

The store enumerates at most 256 directory entries, reads at most 256 revision-like files, accepts at most 16,777,216 cumulative raw UTF-8 bytes, and accepts at most 1,048,577 raw UTF-8 bytes per revision. A not-yet-present target consumes one prospective entry/read and its actual raw bytes before immutable publication; an identical existing target is counted once. Existing over-budget or malformed lineage is typed corrupt state, while a target that alone would cross a remaining budget is a typed revision conflict. Both fail before the target or current changes.

Every publish call validates committed lineage and these budgets. A byte-identical current retry may repair only the Markdown projection after validation; it never bypasses duplicate-ID, continuity, filename/content, or budget checks, and its own current revision ID is not treated as a new reuse.

## Legacy compatibility

Without canonical current, parse `tasks.md` into `source=legacy`. Preserve phase, text, completion, and order. Dependencies, coverage, claims, outputs, and validators remain unknown/empty and `schedulable=false`; no later layer may bind evidence or AFK execution to a legacy-derived display ID. Official materialization is the only path that persists opaque IDs.

## Stable read model

`TaskPlanReadModelV1` exposes plan/revision identity, validation/completeness, catalogs, groups, WorkItems, normalized refs/claims/outputs/validators, coverage summaries, dependency diagnostics, resource diagnostics, and projection status. It is pure data and does not expose local canonical paths.

## Receipt bridge prerequisite

The transcript discovery repair aligns valid transcript count with the existing 4096 metadata-entry budget while preserving the newest-32 full-read limit, byte budgets, exact session/turn/worktree/ABI checks, and inode/version fences. Inline `max_output_tokens` is accepted only as a positive safe integer; pragma, dynamic/invalid values, truncated Skill bytes, and ABI mismatches remain rejected. Regression coverage includes 129+ valid transcripts through the full completed-read reconciliation path and a real current-host registration using the rebuilt CLI bundle.

## Alternatives rejected

- `stage:index` or text-hash IDs: unstable under reorder/edit.
- Extending Change-level `CanonicalTask`: wrong aggregate and loose dependency matching.
- Bidirectional JSON/Markdown editing: no cross-file transaction and inevitable drift.
- Inferring legacy dependencies or coverage from prose: fabricated evidence.
- Arbitrary command validators: TaskPlan is description, not execution authority.

## Assumptions / Decision Log

- Decision: PR1 includes the repository/current pointer because downstream stacked PRs require a canonical revision identity and stable reader.
- Decision: TaskPlan carries its explicit requirement/acceptance catalogs so completeness is provable without guessing OpenSpec headings.
- Decision: exact resources only in v1; globs are deferred.
- Decision: dependency-ordered writers are valid serialization, while unordered writers conflict.
- Decision: legacy display IDs are non-canonical and non-schedulable.
- Decision: transcript fix gets an end-to-end reconcile regression in addition to discovery-helper coverage.
- Decision: proposed revision resources count before publication, so a successful publish cannot create a state that the next publish must reject solely because the prior target crossed a store budget.

## Verification matrix

Tests cover closed/future schema, budgets and hostile objects, round-trip/freeze, identity stability, ownership/tree errors, dependency cycles, full coverage, resource normalization/conflict, outputs/validators, immutable publication/current CAS/projection recovery, exact-cap target accounting, idempotent lineage validation, zero-write budget rejection, legacy no-inference, and 129+ transcript end-to-end reconciliation.

```coverage
touches: kernel-data, api-boundary, filesystem-trust, skill-provenance
L1_api:      filled -> #stable-read-model
L2_data:     filled -> #contract
L3_rules:    filled -> #key-rules
L4_state:    filled -> #persistence-and-projection
L5_errors:   filled -> #verification-matrix
L6_security: filled -> #key-rules
L7_perf:     filled -> #verification-matrix
L8_deps:     filled -> #domain-boundary
L10_terms:   filled -> #contract
```
