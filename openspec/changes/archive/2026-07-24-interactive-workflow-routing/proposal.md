# Proposal: interactive workflow routing

## Problem

After a project creates a custom workflow and a custom Track, normal Codex chat still receives a
hard-coded `workflow: default` router dispatch.  The injected instruction explicitly says not to
ask which workflow to use.  That means the dashboard can persist a valid workflow/Track topology,
but normal chat cannot discover or let the user choose it; a new request silently starts the
default pipeline instead.

## Goal

Make normal-chat routing discover the effective Track-to-default-workflow bindings of the current
project.  When that project has a custom routable Track or a non-default workflow binding, a new
objective must enter an explicit, bounded Track/workflow selection before it creates a Change.
The recommendation remains deterministic and is shown first; stale Changes must never be reused.

## Scope

- Extend the data-only router projection/cache with a Track's effective default workflow.
- Keep the hook parser fail-closed for malformed cache data and preserve the no-interpreter hot path.
- Emit a selection contract only for `intent: new` in projects that actually declare a custom
  routing/workflow option; retain the automatic default workflow path for a pristine project.
- Teach the packaged `pipeline` entry skill to ask for a Track/workflow pair, then initialize the
  independent Change with that exact persisted pair.
- Cover projection, generated cache, hook behavior, and the normal-chat skill contract.

## Non-goals

- Do not infer a user choice from a repository-level active Change or file mtime.
- Do not add a second workflow registry or duplicate Track persistence outside `.pipeline/tracks.yaml`.
- Do not bypass the existing OpenSpec document ledger, phase gates, or Codex hook-trust boundary.

## Acceptance signals

1. A custom `adoption` Track bound to `pet-adoption` produces a normal-chat dispatch with a
   recommended pair and `selection_required: true`, rather than `workflow: default`.
2. A plain project with no custom Track/workflow continues to dispatch deterministically to the
   winning built-in Track and `workflow: default` without an unnecessary selection prompt.
3. The root skill records that a selection is required before `pipeline init`; it cannot bind an
   existing Change to this new objective.
4. The released Codex plugin can be installed fresh, updated, and exercised against this behavior.
