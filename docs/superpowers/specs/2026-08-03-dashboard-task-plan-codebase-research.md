# Dashboard Task Plan codebase research

## Scope

This research identifies the current Dashboard information architecture, API trust boundary, localization, accessibility, and AFK surfaces for the TaskPlan vertical slice. It is read-only research.

## Current UI seams

- `packages/dashboard-app/src/App.tsx` owns project selection and the primary views: Projects, Progress, AFK, Workbench, Machine, and Host Plan.
- `packages/dashboard-app/src/shared/TaskDetail.tsx` is the existing change/run detail surface and already composes history, documents, related sessions, run audit, and orchestration graph sections.
- `packages/dashboard-app/src/progress/ProgressView.tsx` is the natural entry point for a selected PipelineRun/Change and can host a TaskPlan summary plus a focused WorkItem drawer/tab.
- `packages/dashboard-app/src/workbench/*` owns workflow configuration and unsaved-draft protections; decomposition/interaction editing belongs here, not in the run view.
- `packages/dashboard-app/src/afk/AfkView.tsx` and `packages/server/src/afk.ts` already expose AFK lanes and operations. TaskPlan admission and WorkItem state should enrich this view rather than introduce a duplicate AFK page.

## API and trust boundary

- API clients live under `packages/dashboard-app/src/api` and use explicit decoders. Invalid or unknown payloads are not silently treated as authoritative.
- `packages/dashboard-app/src/state/useSnapshot.ts` owns loading, reconnect, stale snapshot, and event-stream behavior.
- Server read models live under `packages/server/src` and route through the central server composition. The client must display backend-derived waves/blockers and must not reimplement dependency or resource-conflict logic.
- Mutations use the local bearer token and specific write endpoints. Workflow policy editing should reuse this guarded mutation pattern and server-side validation.

## Localization and accessibility

- `packages/dashboard-app/src/i18n` provides zh/en dictionaries and sets the document language.
- Existing components use semantic buttons, visible focus rings, dialog boundaries, and reduced-motion fallbacks.
- Statuses must include text/icon semantics in addition to color. Unknown enum values require a visible fallback rather than being dropped.

## Selected information architecture

1. Progress run detail adds a Task Plan section with revision/admission summary, coverage metrics, bounded dependency waves, and filterable WorkItem list.
2. Selecting a WorkItem opens a keyboard-reachable detail panel with requirements, acceptance, dependencies, resource claims, outputs, validators, attempts, Skill invocations, question/default-decision evidence, artifacts, and blockers.
3. Workbench workflow settings adds orthogonal Decomposition and Interaction fieldsets with frozen/current status and effective-permission explanation.
4. AFK adds TaskPlan admission, active wave, waiting/blocked/invalidation summaries, and retry/cancel/resume actions whose availability comes from the server DTO.

## State inventory

Every new panel needs explicit loading, initial empty, filtered empty, stale, transport error, invalid/unknown payload, retrying, and successful states. Mutations need idle, pending, success, conflict/stale, validation error, and unknown failure states.

## Large-plan constraint

For 100+ WorkItems, use a dense list/detail layout with filters and a bounded wave/dependency preview. Do not render an unbounded node graph. The accessible list must expose the same ordering, blockers, and relationships as the visual wave view.

## Open questions for Spec

- Exact server route ownership for run-level plan/evidence/task-run projections.
- Whether workflow policy mutation extends the current workflow save endpoint or gets a narrow dedicated endpoint.
- Exact test fixture size used for large-plan performance acceptance.
