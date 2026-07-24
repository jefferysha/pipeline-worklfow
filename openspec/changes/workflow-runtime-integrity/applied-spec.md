# Applied Spec: Workflow Runtime Integrity

## Applied capabilities

- `normal-chat-routing`
  - Adds the built-in, non-routable `free` Track as a neutral entry for every
    valid Workflow.
  - Keeps discussion, simple execution, and full governed execution distinct.
  - Version-binds router caches to the release contract and regenerates stale
    schemas by content rather than timestamp.
  - Allows a custom terminal step named `archive` to complete canonical state
    only after its declared skills, guards, documents, and review evidence.
- `workspace-verification-integrity`
  - Excludes project-owned workflow control and verifier runtime roots from
    in-place implementation baselines.
  - Keeps shipped product artifacts, source, modes, directory structure, and
    symlink targets fingerprinted.
  - Retains deterministic, race-detecting, fail-loud capture behavior.

## Main specification targets

- `openspec/specs/normal-chat-routing/spec.md`
- `openspec/specs/workspace-verification-integrity/spec.md`

Both approved delta specifications are present in the corresponding main
specifications. No delta requirement was omitted or weakened.

## Delivery evidence

The final Verify report records the frozen baseline, repository-wide tests,
runtime and routing regressions, setup/update exercise, real custom Workflow
archive, retained OpenSpec/Superpowers/ADR evidence, and independent review.
