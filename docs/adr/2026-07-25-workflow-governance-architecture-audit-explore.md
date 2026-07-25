# ADR: Compile composable workflow governance into one effective plan

Status: Accepted for specification
Date: 2026-07-25
Change: `workflow-governance-architecture-audit`

## Context

The repository currently treats `default` as both a Workflow identity and a
capability oracle. CLI, kernel, server, hooks, and dashboard branches rebuild
policy from that name. Custom Workflow document governance is represented by
`openspec_contract: required`, whose validator requires exactly the canonical
seven phases. State initialization then reduces that contract to a boolean.
The same pattern appears in Skill enforcement, confirmation vocabulary, UI
projection, and duplicated adapter policy.

The repository Agent Rules also require strict package/layer direction,
validated DTO boundaries, file-size limits, public exports, persistence
repositories, and real verification. Current source contains confirmed reverse
frontend imports, oversized production modules, unchecked boundary casts, a
private YAML parser in the CLI, obsolete copied automation literals, and Skill
evidence that can trust historical Codex cache versions.

## Decision

Compile every built-in and project-defined Workflow, its governance profile,
and the selected Track overlay into one immutable `EffectiveWorkflowPlan`.
Kernel validation owns the cross-policy invariants. CLI, server, dashboard, and
hooks consume explicit plan capabilities and may not infer them from
`workflow === default`.

Add a bounded, versioned declarative document-governance profile whose document
owners and read obligations reference authored step IDs. Preserve
`openspec_contract: required` as a legacy alias for the current full
seven-phase profile. Absence remains no document contract, so the packaged
`simple` Workflow stays lightweight. A short Workflow may opt into exactly the
documents it needs without adopting unrelated default phases.

Unify current-visit Skill enforcement for all Workflows. Retain only the exact
`pipeline` entrypoint exemption. Bind Codex Skill evidence to the selected
immutable/current executing plugin roots and reject unselected historical
caches.

Centralize prompt intent classification while keeping action authorization
contextual. Bare `继续` may acknowledge only an exact pending receipt for the
selected Change; it cannot grant continuous authority or approve another
event.

Repair Agent Rule violations at their ownership boundaries: split oversized
modules by responsibility, move frontend primitives downward, decode external
input from `unknown`, replace copied automation policy with public contracts,
and place persistence reads behind kernel/application ports. Add an objective
architecture check to CI with exact documented exceptions for generated,
configuration, schema, fixture, and protocol files.

## Alternatives

### Add another boolean such as `openspec_compact`

Rejected. It creates more adapter branches, cannot express document ownership
or read obligations, and repeats the original coupling.

### Build a separate mini-pipeline engine

Rejected. It creates a third execution path and duplicates review, Skill,
document, Todo, and transition semantics.

### Keep current code and document the limitation

Rejected. The limitation blocks a user-visible capability and the audit found
security/provenance and rule-compliance defects that documentation cannot fix.

### Grandfather all current architecture violations in a baseline

Rejected. A floating baseline makes the rules advisory and permits existing
hard violations forever. Only exact, rule-owned file categories may be exempt.

## Consequences

Positive:

- default, simple, free, short, and custom Workflows share one engine;
- document governance becomes composable without weakening exact-digest
  evidence;
- Todo and dashboard projections follow the actual graph and capabilities;
- Skill and confirmation evidence are tied to exact context;
- architecture rules become enforceable in CI;
- adapters shrink and domain ownership becomes reviewable.

Costs:

- schema, parser, compiler, persistence, CLI/API, UI, generated assets, and
  installation tests must migrate together;
- large existing modules require careful responsibility-based decomposition;
- compatibility fixtures and generated bundles increase the verification load.

Risks and mitigations:

- profile syntax could become a programming language: keep it versioned,
  declarative, and limited to known document/step/producer references;
- route/component splits could change behavior: preserve public facades and
  add characterization/integration/browser tests before removal;
- old state could be rewritten accidentally: use legacy-read/canonical-write
  only on existing mutation paths, never startup migration;
- architecture checker could duplicate runtime logic: restrict it to
  source-shape constraints and cite the governing rule.
