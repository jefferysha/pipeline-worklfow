---
change: normal-chat-default-orchestration
design-doc: openspec/changes/normal-chat-default-orchestration/design.md
status: revised-after-requirements-change
---

# Default pipeline document-contract implementation plan

## Goal

Turn the existing textual default-pipeline convention into an enforced, observable document chain. A governed change must prove that OpenSpec, Superpowers, and ADR documents were produced by the intended phase skill, and that later phases read their current content before passing their own exit gate.

This plan intentionally preserves `.pipeline.yaml`, `/api` response shapes, legacy custom workflows, and the existing default state-machine events. The new sidecar ledger is rebuildable evidence, not a replacement for canonical pipeline state.

## Tracer bullet — first vertical slice

Implement one end-to-end path before broad UI or adapter work:

1. Add the kernel document-ledger codec/repository with safe paths, SHA-256, atomic publication, and a pure phase-matrix evaluator.
2. Initialize the ledger for a default change, register fixture records, record required reads, and make both `pipeline check` and transition application reject a missing/stale record.
3. Expose the projection through the existing server snapshot and render it under the phase Todo in `TaskDetail`.
4. Prove it with a CLI-to-server integration test and the Dashboard component test.

This validates the whole contract before adding custom-workflow opt-in and installation diagnostics.

## Phase A — Kernel contract and persistence

- Add document-domain types, a strict JSON codec, safe root-relative path validation, regular-file checks, SHA-256 calculation, and atomic sidecar writes in `packages/kernel/src/state/`.
- Define the canonical output/read matrix by phase in a pure workflow module. It must state the required OpenSpec proposal/design/tasks, Superpowers design/plan, ADR, delta spec, verification report, and applied spec evidence.
- Extend `WorkflowRunRepository.initChange` so default and opted-in custom changes create the sidecar without changing the state-file schema.
- Add focused kernel tests for corruption, path escape/symlink rejection, digest invalidation, atomic update behavior, and phase-matrix blockers.

**Suggested context boundary:** `/clear` after the kernel codec/repository and tests are green.

## Phase B — CLI/server enforcement

- Add `pipeline document init|record|read|status` commands. `record` verifies phase, effective producer, and skill-history evidence; `read` records exact-digest receipts.
- Inject the same document-evidence application service into CLI check, CLI transition, and server transition so no entrypoint can bypass it.
- Include a document projection in the server snapshot and fingerprint the sidecar for SSE/snapshot refresh.
- Add CLI/server integration coverage for missing documents, forged producer claims, modified documents, missing reads, happy-path evidence, and legacy workflow compatibility.

**Suggested context boundary:** `/clear` after the CLI and server use the same application service and integration tests pass.

## Phase C — Governed custom workflows

- Extend `WorkflowDef`, parser, serializer, IR, compiler, and validator with optional `openspec_contract: required`.
- Require the standard seven phases and reachable standard transitions only when that field is enabled; leave existing unconstrained custom workflows untouched.
- Carry the option through workflow save/load and change initialization.
- Make the Workbench's OpenSpec workflow template opt in, and visibly label other workflows as not governed rather than implying compliance.
- Add parser/serializer/validator, server workflow API, and Workbench behavior tests.

**Suggested context boundary:** `/clear` after contract validation and UI labels are complete.

## Phase D — Host bridge, skills, and review gate

- Update the Codex adapter to expose needed Superpowers skill directories from the available plugin source without overwriting user-owned target skills.
- Correct doctor output so cache presence is never mistaken for Codex-target availability.
- Update each pipeline phase skill to record its required outputs and read prior evidence before work/exit; document the migration/legacy behavior honestly.
- Change the review-marker hook chain so `pipeline review request --event` creates a canonical phase-and-event receipt; an explicit user confirmation calls `pipeline review acknowledge`, records approval, and clears only the matching trusted-project marker projection. `pipeline transition` consumes that exact receipt; direct marker deletion is never approval.
- Add hook/adapter contract tests for confirmation, read-only inspection, conflict handling, and discoverability.

## Phase E — Final verification and migration notes

- Run kernel/CLI/server/Dashboard tests, type checks, workflow freshness, hooks, adapters, skill verification, bundle, and the affected real HTTP smoke flow.
- Verify one temporary governed change can: initialize → record required evidence → read evidence → pass checks; then edit a document and demonstrate rejection until re-recorded/re-read.
- Document that existing changes remain legacy until they are explicitly initialized/migrated; never fabricate historical skill receipts for them.

## Phase F — Risk-based simple task track

- Add a built-in `simple` Track with a positive bounded-change routing pattern, a separately
  validated exclusion pattern, and a packaged `simple` workflow identity.
- Extend router projection/cache and server preview so exclusion is evaluated before score/priority
  selection. Remove the old explicit quick-fix early exit: these requests must now enter the
  lightweight auditable workflow instead of bypassing the plugin entirely.
- Add the immutable built-in workflow `change → verify → done`, plus `scope-expanded → escalated`
  and `verify-fail → change`. Make CLI init/check/transition, skill DAG, server snapshot, and
  Dashboard resolve the same built-in definition without a per-project YAML copy.
- Add and package `simple-task`, with strict pre/post scope checks and a handoff protocol that
  creates a new default Change when the boundary expands.
- Update the pipeline root skill to build Todo from the lightweight workflow steps, skip the
  governed OpenSpec ledger for simple, and invoke only the skills declared by the built-in DAG.
- Cover positive routing, exclusion precedence, generic development fallback, lightweight
  lifecycle, scope escalation, setup/update skill inclusion, and Dashboard projection.

**Suggested context boundary:** `/clear` after router/cache and built-in workflow tests are green.

## Architecture boundaries

- `packages/kernel`: document domain, ledger persistence port/adapter, phase-matrix rules; no CLI/server/React imports.
- `packages/cli` and `packages/server`: input validation and use-case orchestration only.
- `packages/dashboard-app`: read-only projection/display through existing API types; no local evidence rules.
- `hooks` and `adapters`: host integration only; they must not edit canonical state directly.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A document changes after it was read | Store SHA-256 in both record and receipt; re-hash at every check/transition. |
| A path points outside the project or to a symlink | Resolve against trusted root, allow only `openspec/` and `docs/`, and require a non-symlink regular file. |
| Existing custom workflows break | Enforce only default and explicit `openspec_contract: required` workflows. |
| A cache makes doctor report a false positive | Check the actual `.agents/skills` target and report cache/source separately. |
| A review confirmation blocks itself or unlocks the wrong edge | Persist a phase-and-event approval receipt before clearing only the matching projection; consume it on transition and never use marker deletion as approval. |
