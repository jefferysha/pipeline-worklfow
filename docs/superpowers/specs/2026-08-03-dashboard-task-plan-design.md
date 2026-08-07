# Dashboard Task Plan design

## Outcome

Desktop Dashboard users can configure the frozen decomposition/interaction policy and trace Project -> PipelineRun -> StepVisit -> TaskPlanRevision -> TaskGroup/WorkItem -> SkillInvocation, including coverage, dependencies, AFK admission, questions/default decisions, attempts, validators, and actionable blockers.

## Selected layout

The Progress task detail gains a `TaskPlanPanel` with three bounded regions: revision/admission summary, coverage plus execution waves, and a searchable WorkItem list. A selected item opens `WorkItemDetailPanel` inside the existing detail experience. The UI never draws an unbounded graph; waves are displayed as ordered horizontal groups at large widths and as a semantic ordered list at the 1024px boundary.

Workbench adds a `WorkflowExecutionPolicyEditor` with separate Decomposition and Interaction fieldsets. AFK adds a `TaskPlanRunCard` for admission, active wave, blocked/waiting/invalidated states, and server-authorized operations.

## Key rules

1. API decoders reject structurally invalid payloads and preserve unknown enum values as an explicit `unknown` presentation.
2. Waves, readiness, conflicts, effective permissions, operation availability, and blocker remediation come from backend DTOs.
3. Decomposition and interaction are visibly orthogonal. Changing one does not silently change the other.
4. Current and frozen policy fingerprints are shown together; drift is stale/changed, not silently applied to a running plan.
5. QuestionEvent shows why a question was required, whether it was shown, and response status without exposing unnecessary raw content.
6. DecisionEvent shows why no question was shown, the frozen policy source, the adopted default, and rationale.
7. Every blocker contains reason and remediation. Hard blockers are not rendered as ordinary waiting.
8. Every status has text and icon/shape semantics; color is supplemental.

## State model

Read panels: `loading | ready | empty | filtered-empty | stale | error | unknown`. Operations: `idle | submitting | succeeded | validation-error | conflict | failed`. Stale cached data stays visible with an explicit stale banner and retry/reconnect action.

## Component and API boundaries

- `api/taskPlan*`: decoders/types/client for stable read DTOs and policy mutation.
- `taskPlan/TaskPlanPanel`: revision, coverage, waves, list, filters.
- `taskPlan/WorkItemDetailPanel`: WorkItem contract, attempts, evidence, artifacts, validators, blockers.
- `workbench/WorkflowExecutionPolicyEditor`: editable definitions and server validation.
- `afk/TaskPlanRunCard`: admission/runtime/operations projection.
- Server routes return versioned DTOs and validate all writes; the browser owns presentation only.

## Keyboard and responsive desktop acceptance

- 1024, 1280, 1440, and 1920px widths have no horizontal document overflow.
- Filters, list rows, tabs/disclosures, policy fields, retry/cancel/resume, and close actions are reachable in logical Tab order.
- Arrow-key behavior is used only where the component has an established composite-widget pattern; otherwise native controls remain authoritative.
- Focus returns to the invoking WorkItem row after closing detail, and mutation/error banners receive managed focus when necessary.
- Reduced motion preserves all state transitions without relying on animation.

## Alternatives rejected

- A full-canvas node graph: unsuitable for 100+ items and keyboard parity.
- A new top-level TaskPlan app: duplicates Project/Run context and navigation.
- Client-side scheduling/status inference: creates split-brain behavior.
- English-only technical labels: violates the product's existing zh/en contract.

## Assumptions / Decision Log

- Assumption: stacked PRs 1-4 expose versioned TaskPlan, evidence, policy, and task-run DTOs.
- Decision: integrate run information into Progress/TaskDetail, policy into Workbench, and execution operations into AFK.
- Decision: use list/detail plus bounded waves and coverage matrices.
- Decision: retain stale facts visibly and label them rather than replacing them with an empty state.
- Decision: real browser acceptance uses one project-dedicated long-lived owner/session for all viewport and keyboard checks.

## Verification matrix

Component and integration tests cover decoder failures, unknown enums, all read/mutation states, zh/en text, filters, coverage, waves, evidence, blockers/remediation, policy drift, keyboard focus return, reduced motion, and operation authorization. Browser acceptance covers 1024-1920 desktop widths and screenshots the critical ready/empty/error/hard-blocked paths.

```coverage
touches: auth, frontend-ui, localization, accessibility, responsive, api-boundary
L1_api:      filled -> #component-and-api-boundaries
L2_data:     filled -> #state-model
L3_rules:    filled -> #key-rules
L4_state:    filled -> #state-model
L5_errors:   filled -> #state-model
L6_security: filled -> #key-rules
L7_perf:     filled -> #keyboard-and-responsive-desktop-acceptance
L8_deps:     filled -> #component-and-api-boundaries
L10_terms:   filled -> #component-and-api-boundaries
```
