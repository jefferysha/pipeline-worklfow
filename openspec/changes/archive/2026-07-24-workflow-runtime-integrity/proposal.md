# Change: Workflow Runtime Integrity

## Problem

Two workflow-level invariants are currently broken:

1. An in-place Build baseline includes `.pipeline/` receipt files, so the
   Verify phase invalidates its own frozen implementation when it records
   required skill evidence.
2. A Workflow can be entered through standard domain Tracks, but there is no
   explicit neutral execution Track for users who want only that Workflow's
   declared DAG and gates.

## Intended Outcome

Make in-place verification stable across control-plane evidence writes and add
an explicit built-in `free` Track that can bind every Workflow without domain
coverage, skill-matrix, routing, or AFK policy overlays.

## Scope

- Exclude the project-local `.pipeline/` control plane from implementation
  workspace fingerprints.
- Add the backward-compatible built-in `free` Track while preserving `chat` as
  the non-pipeline discussion route.
- Surface `free` in CLI, dashboard creation, and normal-conversation workflow
  selection.
- Keep simple-task routing and all existing Track identities unchanged.
- Add compatibility and regression coverage across kernel, CLI, dashboard,
  hook dispatch, bundle, and installation surfaces.

## Non-Goals

- Bypassing gates, skills, or OpenSpec contracts declared by the selected
  Workflow.
- Turning free mode into an automatically selected route.
- Renaming or repurposing the existing `chat` or `simple` Tracks.

## Acceptance Signal

- A required Verify skill receipt written under `.pipeline/` does not change an
  already frozen in-place implementation fingerprint.
- `pipeline tracks show free --json` reports a built-in, non-routable,
  non-automatable Track with `workflow.allowed='*'`, no coverage profile, and no
  standard skill matrix.
- Dashboard and normal-conversation selection can pair `free` with default and
  project-defined Workflows.
- Existing simple-task classification remains a lightweight
  `change → verify → done` path.

## Explore Conclusions

- `chat` must remain the non-execution discussion identity; free execution gets
  a new stable built-in ID.
- One `free` Track with `workflow.allowed='*'` is the only design that covers
  future Workflows without duplicated project configuration.
- The router must distinguish manual candidates from automatic scorers so a
  non-routable free Track is selectable but never wins content scoring.
- `.pipeline/` is wholly control-plane state. Excluding only today's receipt
  filename would repeat the defect when another control record is added.
