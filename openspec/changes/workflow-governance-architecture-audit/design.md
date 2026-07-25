# Design: Initial Architecture Hypothesis

## Context

The system has several independently meaningful dimensions: Workflow graph,
Track policy, document evidence, Skill DAG, human gates, automation, and
presentation. The observed three-step/OpenSpec limitation suggests that at
least two dimensions are currently encoded by one schema switch. Separately,
the repository's Agent Rules define intended package, layer, type, persistence,
API, UI, security, file-size, testing, and distribution boundaries. Those rules
must be checked against implementation rather than assumed from a green test
suite.

## Initial hypothesis

Treat each dimension as an explicit policy/value object compiled into one
effective Workflow model:

```text
Workflow graph
  + governance/document profile
  + Track policy overlay
  + gate/automation policy
  + Skill DAG
  + repository architecture constraints
  -> validated execution plan
  -> CLI / server / dashboard / hooks
```

The compiler and validator should own cross-policy invariants. CLI, server,
dashboard, hooks, and Skills should consume the compiled plan rather than
reconstructing policy from Workflow names or phase labels.

For repository-wide rule compliance, use a second evidence model rather than
mixing source-code architecture checks into the runtime Workflow compiler:

```text
AGENTS.md rule selection
  + COMMON shared constraints
  + FRONTEND dependency/interaction constraints
  + BACKEND DDD/persistence/API constraints
  -> rule applicability matrix
  -> static evidence + tests + focused manual review
  -> confirmed finding / exception / compliant result
```

Runtime architecture invariants belong in kernel validators or typed contracts.
Repository-shape and dependency rules belong in build-time checks. Behavioral
and browser/Docker claims remain tests or real acceptance evidence. The audit
must not create a single omniscient checker that duplicates production logic.

## Compatibility hypothesis

- Preserve `openspec_contract: required` as the existing full-governance form.
- If evidence supports it, add a separately named compact or declarative form
  instead of changing the meaning of `required`.
- Keep built-in `simple` lightweight by default.
- Require explicit opt-in for any new governance profile and fail closed when
  a declared profile cannot be satisfied by the graph.

## Risks

- A generalized schema can become an unbounded configuration language.
- Different consumers may already duplicate hidden defaults.
- Persistence and generated distribution assets may drift during migration.
- Making compact governance too weak could create documents without enforceable
  provenance or later-phase read receipts.
- A superficial rule audit could report only grep findings and miss runtime
  ownership or compatibility defects.
- Automatically splitting oversized or mixed-responsibility files without
  call-graph analysis could move code while preserving the same bad boundary.
- Encoding every prose rule as a script could create another drifting source of
  truth; machine checks must cite the governing rule and stay narrowly scoped.

## Explore questions

1. Which consumers infer behavior from `default`, `simple`, phase names, Track
   IDs, or `openspec_contract: required` instead of a compiled contract?
2. Which configuration axes are truly independent, and which combinations must
   remain invalid?
3. What is the smallest useful governed contract for a short Workflow?
4. Can current state and YAML remain readable without an eager migration?
5. Which UI/API projections need new capability metadata rather than
   Workflow-name conditionals?
6. Which Agent Rule clauses are currently violated, and what exact source,
   dependency, runtime, or test evidence proves each finding?
7. Which clauses can be enforced mechanically without duplicating domain
   behavior, and which require a repeatable review checklist?
8. Do current package exports, imports, file sizes, DTOs, state transitions,
   persistence writes, HTTP guards, React data flow, i18n, and tests match the
   written boundaries?
9. Are any rules internally contradictory or stale relative to the actual
   public contract? If so, should code or the rule change, and why?

## Explore decision

Repository evidence confirmed the hypothesis and rejected a second compact
boolean or separate mini-pipeline engine. The selected architecture is:

1. Compile built-in and custom Workflow graphs, governance, Track overlay,
   Skill policy, review policy, automation eligibility, and projection data
   into one deep-frozen effective plan.
2. Preserve `openspec_contract: required` as a legacy full-profile alias and
   add a bounded versioned declarative profile whose document owner/read
   references use authored step IDs.
3. Enforce current-visit Skill evidence for every Workflow and keep only the
   exact orchestration-entry skill exemption.
4. Bind Skill provenance to the selected/current plugin root; historical cache
   discovery cannot satisfy evidence.
5. Centralize prompt intent classification while requiring exact selected
   Change and pending-event context for approval.
6. Split adapters and UI modules by bounded context, restore frontend
   dependency direction, validate `unknown` DTO input, and route persistence
   through repositories/codecs.
7. Add a rule-citing architecture checker for objective file, dependency,
   package, assertion, and policy-reconstruction constraints; keep behavioral
   truth in runtime tests.

The complete issue matrix, Agent Rule compliance matrix, compatibility model,
migration behavior, red-team assumptions, and acceptance strategy are in
`docs/superpowers/specs/2026-07-25-workflow-governance-architecture-audit-design.md`.
The decision and rejected alternatives are recorded in
`docs/adr/2026-07-25-workflow-governance-architecture-audit-explore.md`.

No external solution search was needed: this is an internal ownership and
conformance problem, and the first-party specs plus executable code supplied
the facts that determine the architecture.
