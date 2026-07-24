# Design: project-scoped workflow selection

## Context

The existing design deliberately keeps router hot-path execution in Bash.  Its cold path calls the
kernel to serialize a strictly validated hex cache; the hook parses that cache without sourcing or
evaluating project-controlled text.  The effective Track Registry is already the sole source of
routing patterns, labels, policies, and default workflow bindings.

The defect is an adapter boundary loss: `RouterTrackProjection` currently omits
`TrackDefinition.workflow.default`, so the hook cannot preserve the binding and falls back to a
literal `workflow: default` in every normal-chat dispatch.

## Decision

Add `workflowDefault` to the domain projection and encode it in a versioned `PIPELINE_ROUTER_V4`
cache record.  The Bash adapter validates the added hex field with the same bounded, data-only
parser used for Track ids and labels.  It retains one ordered candidate per enabled Track, each
candidate being the persisted pair `(track id, default workflow)`.

For an `intent: new` dispatch:

- If every enabled candidate is a built-in Track bound to `default`, preserve current behavior:
  dispatch the winning Track with `workflow: default`.
- If at least one candidate is a project-defined Track or has a non-default workflow binding,
  emit `workflow: select`, `selection_required: true`, the deterministic winning pair, and the
  bounded project candidates.  The root `pipeline` skill must call the host's interaction tool
  before creating a Change.  The recommended pair is the router winner; alternatives are a user
  choice, not an implicit override.
- Resume/select intents retain their current recovery semantics and do not open a workflow picker.

## DDD boundaries

| Layer | Responsibility |
| --- | --- |
| `kernel/tracks/router-projection` | Pure effective-registry projection and inert cache encoding. |
| `hooks/router-gen.mjs` | Cold-path infrastructure adapter: loads registry/workflow facts and writes only generated data. |
| `hooks/router.sh` | Host adapter: validates/cache-loads data and emits an instruction contract; it never chooses on behalf of the user once a custom option exists. |
| `skills/pipeline/SKILL.md` | Application orchestration: turns the selection contract into an `AskUserQuestion`, then calls CLI state transitions. |
| CLI/state store | Canonical persistence and validation of the selected Track/workflow pair. |

This avoids adding a parallel workflow database and keeps validation at existing domain boundaries.

## Safety and compatibility

- V4 deliberately invalidates prior cache files; stale data cannot silently lose the workflow field.
- Cache strings remain UTF-8 hex and are never sourced.  The Bash parser rejects malformed,
  duplicate, oversized, control-character, or tag-breaking workflow values.
- Candidate count is bounded by the existing maximum Track registry size (32).
- The workflow selection is only guidance for the host model.  The actual `pipeline init` / API
  path remains responsible for `assertWorkflowAllowed` and atomic state persistence.
- Existing no-custom-config projects continue to use the default fast path exactly once per prompt.

## Evidence plan

Tests will prove projection preservation, V4 cache generation, parser fail-closed behavior,
selection dispatch for a custom Track, unchanged default dispatch, and the skill instruction that
requires interaction before Change creation.  Live acceptance will install the release into an
empty Codex home and use the dashboard plus a real Codex chat session.
