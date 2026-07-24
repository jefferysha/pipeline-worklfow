# Initial Design: Workflow Runtime Integrity

## Architecture Hypothesis

The workspace fingerprint should model implementation files only. `.pipeline/`
is a project-local control plane containing registries, generated caches,
session bindings, and append-only evidence receipts, so it belongs beside the
already excluded `openspec/` and `docs/` trees.

Free execution should be a first-class built-in Track rather than an alias for
`chat`. The existing `chat` identity has a separate meaning at the prompt
router: pure discussion does not create a Change. A distinct `free` identity
avoids migration ambiguity and can safely use `workflow.allowed='*'`.

## Policy Hypothesis

`free` will not auto-route, enter AFK, apply a domain coverage profile, or
consume the default recommended/mandatory skill matrix. The selected Workflow
remains authoritative for its own DAG, gates, declared skills, OpenSpec
contract, documents, and transitions.

## Compatibility Hypothesis

Appending `free` to the built-in Track order preserves existing IDs and
serialized project overrides. Existing project Track files need no migration
because built-in definitions are supplied by the installed runtime.

## Explore Decisions

- The versioned router projection will include a routability bit. Disabled
  Tracks can be emitted as bounded manual candidates but are never passed to
  the scorer.
- Normal conversation exposes the free Track and validates the exact chosen
  Workflow against its `allowed='*'` binding before creating a Change. The
  dashboard directly lists every available Workflow for the same Track.
- The cache version must change so old rows cannot be misread as routable.
- The entire `.pipeline/` tree is excluded from implementation fingerprints,
  not just the currently observed receipt file.
