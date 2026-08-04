# Workflow decomposition and interaction policy design

## Outcome

Each Workflow definition can independently constrain task decomposition and user interaction. New WorkflowRuns freeze the normalized policies and effective authorization inputs; AFK and recommended defaults never expand authority or bypass hard boundaries.

## Selected schema

Two versioned, closed-key objects are added at the Workflow definition top level:

```yaml
decomposition:
  version: v1
  mode: off # off | suggest | auto-safe | require-review
  target: work-items # work-items | child-pipelines
  strategy: balanced # balanced | breadth-first | depth-first
  max_items: 16
  max_depth: 2
  auto_when: []
  ask_when: []
interaction:
  version: v1
  mode: interactive # interactive | recommended-defaults | afk
```

Missing fields compile to `decomposition.mode=off`, `target=work-items`, `strategy=balanced`, `max_items=16`, `max_depth=2`, empty conditions, and `interaction.mode=interactive`. `max_items` is bounded to 1–32 and `max_depth` to 0–4. `auto_when` is the closed set `independent-work-items|cross-component-boundary|context-budget-risk`; `ask_when` is `ambiguous-requirements|hard-boundary|missing-authorization|limit-exceeded`. Unknown keys, versions, modes, targets, strategies, conditions, invalid limits, and duplicate conditions are rejected. Parser, serializer, compiler, validator, IR, and read DTO use one shared domain contract.

## Key rules

1. Decomposition and interaction are orthogonal. No enum value in either policy implies a value in the other.
2. `off` does not decompose; `suggest` returns a proposal; `auto-safe` may materialize only fully authorized reversible work; `require-review` may build a candidate plan but requires an exact review event before execution.
3. `target=work-items` remains inside one PipelineRun. `child-pipelines` creates separately governed child runs and counts toward `max_depth`.
4. `max_items` and `max_depth` are hard ceilings. `strategy`, `auto_when`, and `ask_when` are closed vocabularies whose unknown values fail closed.
5. Effective permission is evaluated per action as the intersection of platform safety, Skill contract, project/track policy, frozen Workflow ceiling, and exact Run grant.
6. Missing, stale, malformed, or identity/fingerprint-mismatched permission input means denied.
7. `recommended-defaults` suppresses only routine questions with a declared frozen default and no hard boundary. It records a DecisionEvent.
8. Safety, cost, production, external side effects/publication, credentials, irreversible actions, and missing authorization remain hard blockers in every interaction mode.
9. `afk` permits AFK admission checks; it grants no branch, PR, merge, external, production, or cost permission.
10. Continuous authority is an exact session grant and cannot raise the frozen Workflow ceiling or replace AFK admission/review evidence.

## Frozen plan and compatibility

Normalized policies enter the compiled Workflow IR and a new effective-plan fingerprint tag. New runs write a V3 self-contained snapshot. V1/V2 snapshots are verified with their historical algorithm and projected as `off + interactive`; they are not rewritten or rehashed in place. Live definition changes only report drift and do not alter an existing run.

## Authorization model

`evaluateWorkflowAction(action, facts)` returns `allowed`, all contributing layers, and structured denial codes. It uses named capabilities rather than a privilege ranking. Queue/CLI may use it for early feedback, but automation admission rechecks the frozen facts at the authoritative pre-claim boundary.

## API contract

Workflow definition GET/POST carries the editable policies and continues to validate through the shared compiler under the existing registry lock/atomic publication path. Frozen run DTOs separately expose configured policy, frozen policy fingerprint, effective grants, denials, and live-definition drift. The API never labels mutable grants as Workflow policy.

## Dashboard configuration contract

The Dashboard edits the complete Workflow definition through the existing GET/POST boundary. Decomposition and interaction controls stay visually and semantically independent, use the same shared enums and limits, and expose zh/en copy plus loading, empty, retryable error, saving, success, and validation-error states. A rejected write leaves the previously published definition untouched. Keyboard users can reach, change, save, cancel, and retry every required control.

## Stable receipt runtime

The installed stable bootstrap derives `TENON_CODEX_PLUGIN_ROOT` from the verified active payload and passes it across the process boundary to the current-turn receipt bridge. The bridge does not trust an arbitrary caller override: cache location, active payload identity, Skill metadata, session, turn, phase, worktree, Git common directory, ABI, and the complete nested command result remain jointly verified. Missing or drifted managed runtime support is reported as unavailable, never repaired by treating a branch-local CLI invocation as production evidence.

## State and failure model

Policy lifecycle is `draft -> validated -> frozen`. Runtime evaluation yields `allowed | denied | hard-blocked | stale`. `denied` may be changed by an authorized configuration/run grant; `hard-blocked` requires the named confirmation/authority; `stale` requires reloading or a new run and never falls back to allow.

## Alternatives rejected

- A combined autonomy level: it couples decomposition and interaction and obscures authority.
- A numeric permission hierarchy: independent side-effect permissions do not form a safe total order.
- Re-reading live Workflow YAML during a run: it violates frozen semantics.
- Treating continuous authority as AFK permission: it is session interaction delegation only.

## Assumptions / Decision Log

- Decision: policies are top-level Workflow-owned ceilings; step/track/run facts are overlays evaluated later.
- Decision: v1 includes both decomposition targets and the requested strategy/limit/condition fields.
- Decision: v1 freezes the exact strategy and condition vocabularies above; no arbitrary string is accepted and list order participates in the normalized policy.
- Decision: `require-review` permits candidate generation but requires exact review before execution.
- Decision: v1 permission vocabulary covers decomposition, AFK, filesystem writes, branch/PR/merge, external API/publication, production, cost, credentials, and irreversible actions.
- Decision: existing POST can edit policies because it already compiles and atomically publishes the complete definition; no bypass endpoint is added.
- Decision: legacy snapshots project safe defaults and are never migrated in place.
- Decision: Dashboard policy writes reuse the complete definition compiler/lock/atomic publication path; no policy-only bypass endpoint is introduced.
- Decision: the stable receipt fix preserves verified cache provenance across bootstrap/runtime boundaries and fails closed on managed-release drift.

## Verification matrix

Tests cover every enum, all defaults, closed-key rejection, limits/conditions, parse/serialize round-trip, deep freeze, fingerprint drift, V1/V2 compatibility, V3 tamper resistance, exact Run/session binding, five-layer permission intersections, all hard boundaries, early/authoritative admission consistency, server write/read DTO separation, Dashboard zh/en and state recovery, real desktop browser edit/save/retry/keyboard paths, and installed stable bootstrap receipt provenance.

```coverage
touches: auth, workflow-governance, automation-admission, api-boundary, dashboard, codex-runtime
L1_api:      filled -> #api-contract
L2_data:     filled -> #selected-schema
L3_rules:    filled -> #key-rules
L4_state:    filled -> #state-and-failure-model
L5_errors:   filled -> #state-and-failure-model
L6_security: filled -> #authorization-model
L7_perf:     filled -> #verification-matrix
L8_deps:     filled -> #frozen-plan-and-compatibility
L10_terms:   filled -> #selected-schema
```
