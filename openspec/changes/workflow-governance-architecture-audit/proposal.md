# Proposal: Workflow Governance Architecture Audit

## Intent

The project currently has at least one all-or-nothing coupling: a custom
Workflow can opt into the full OpenSpec document contract only when it adopts
the canonical seven-phase graph, while a shorter Workflow cannot select a
smaller governed document set. Audit the whole plugin for other cases where
independent concerns are coupled in the same way. In the same audit, verify the
entire implementation against `AGENTS.md` and all selected
`.agent-rules/{COMMON,FRONTEND,BACKEND}.md` requirements, then repair every
confirmed architectural or rule-compliance defect without weakening existing
fail-closed guarantees.

Classification: architecture debt and compatibility-preserving refactor.

## Intended outcome

- Workflow shape, document governance, Track policy, Skill execution, review
  gates, automation eligibility, and dashboard projection have explicit and
  composable ownership boundaries.
- Short and custom Workflows can express the governance they actually need
  without inheriting unrelated default phases.
- Existing `default`, `simple`, `free`, and project custom workflows retain
  their documented behavior unless a migration is explicitly specified.
- CLI, server, dashboard, hooks, packaged Skills, schemas, generated assets,
  tests, and documentation agree on the same effective model.
- Production code, tests, persistence, API/UI contracts, distribution assets,
  and verification evidence conform to the repository's Agent Rules rather
  than treating them as documentation-only guidance.
- Every applicable rule is mapped to objective evidence, a confirmed
  violation, an intentional documented exception, or a review-only check.

## Scope

Explore will audit these boundaries before any solution is selected:

1. Workflow graph shape versus OpenSpec/Superpowers/ADR document requirements.
2. Workflow requirements versus Track policy and routing.
3. Built-in versus project-defined Workflow and Track ownership.
4. Phase/step identity versus Todo and dashboard projections.
5. Review/confirm gates versus continuous execution and AFK eligibility.
6. Skill DAG declarations versus bundled-skill resolution and evidence.
7. Source schemas versus CLI/server DTOs, generated assets, installation
   bundles, and backward-compatible persistence.
8. `AGENTS.md` routing and execution discipline versus the actual hook, Skill,
   CLI, state, Todo, review, and delivery behavior.
9. `COMMON.md` package ownership, security boundaries, compatibility surfaces,
   generated-source discipline, verification commands, and evidence honesty.
10. `BACKEND.md` DDD layering, aggregate/application/adapter ownership,
    cross-package public exports, DTO separation, persistence locking/CAS,
    error semantics, API security, file-size limits, and integration coverage.
11. `FRONTEND.md` feature-domain dependency direction, API-client ownership,
    strict typing, component/state boundaries, i18n, accessibility,
    loading/error/empty paths, file-size limits, and browser evidence.
12. Rule enforceability itself: duplicated, contradictory, obsolete, or
    non-machine-verifiable clauses that allow implementation drift.

## Non-goals

- Replacing the seven-phase `default` workflow.
- Weakening review receipts, document digests, Skill provenance, CAS/atomic
  persistence, authentication, or sandbox boundaries.
- Introducing a database, framework, or external workflow dependency.
- Reworking unrelated product features discovered during the audit.
- Weakening or rewriting rules merely to make existing violations appear
  compliant. A rule may change only when repository evidence proves it is
  contradictory, obsolete, or attached to the wrong ownership boundary.

## Acceptance signal

The audit produces:

1. A traceable architecture issue matrix with evidence for every confirmed
   coupling.
2. A rule-compliance matrix covering every applicable `AGENTS.md`, COMMON,
   FRONTEND, and BACKEND requirement, including file/line evidence and the
   validation mechanism.
3. OpenSpec delta specifications for all approved fixes, with
   backward-compatible parsing and migration behavior where required.
4. Consistent implementation across kernel, automation, CLI, server,
   dashboard, hooks, Skills, schemas, generated/install assets, and docs.
5. Passing focused tests plus the full build, test, frontend, hook, adapter,
   Skill, bundle, freshness, comment-honesty, and workflow-oracle gates, with
   browser/Docker evidence where the changed behavior requires it.

## Assumptions to validate in Explore

- A compact or declarative document contract is preferable to encoding
  governance through phase names alone.
- Other binary feature flags or hard-coded built-in identities may conceal the
  same coupling pattern.
- Compatibility may require interpreting current
  `openspec_contract: required` as a legacy alias rather than replacing it.
- Some current files may exceed rule-defined hard size limits or mix domain,
  application, protocol, and infrastructure responsibilities.
- Existing green tests may validate behavior while missing Agent Rule
  violations such as dependency direction, duplicated policy, or distribution
  drift.

## Explore findings

The audit confirmed that the limitation is not isolated. The repository has a
dual execution-policy architecture: multiple CLI, kernel, server, and
dashboard consumers use `workflow === default` as a capability test, while
custom Workflows use a separate compiled graph path. The OpenSpec flag accepts
only `required`, validates exactly seven canonical phases, and is reduced to a
boolean at state/server boundaries. Skill gating likewise bypasses the entire
default Workflow while using current-visit DAG evidence for custom Workflows.

The same policy-reconstruction pattern appears outside the graph:

- prompt resume and approval phrases are maintained separately, so bare
  `继续` can resume a Change while leaving its interaction marker locked;
- Skill evidence enumerates all historical Codex plugin-cache versions instead
  of binding proof to the selected immutable release;
- server and frontend adapters infer/project policy rather than consuming one
  compiled capability contract;
- CLI loop commands contain a private state/YAML parser;
- server AFK code duplicates automation-owned literals despite a current
  package dependency;
- frontend model/shared code imports feature/shell layers in reverse;
- multiple production controllers, services, domain/storage modules,
  components, pages, and the API client exceed rule-owned hard size limits;
- external input narrowing and non-null assertion discipline are not fully
  enforced;
- CI has no objective architecture-rule check, so green behavioral tests do
  not detect these violations.

Explore selected a compatibility-preserving compiled
`EffectiveWorkflowPlan`, with a versioned declarative governance profile
independent of graph length. `openspec_contract: required` remains the legacy
alias for the full seven-phase profile; no contract remains the default for
`simple`; short Workflows may explicitly declare their own document owners and
read obligations. Full evidence and alternatives are recorded in
`docs/superpowers/specs/2026-07-25-workflow-governance-architecture-audit-design.md`
and the associated ADR.
