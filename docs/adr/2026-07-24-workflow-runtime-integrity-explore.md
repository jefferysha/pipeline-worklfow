# ADR: Separate Free Execution from Chat and Control State from Implementation

## Status

Accepted under the Change-specific continuous authorization.

## Context

Normal conversation needs a neutral executable entry for every Workflow, but
the existing neutral-looking `chat` Track is also the established
non-execution discussion identity. Separately, in-place Verify writes required
skill receipts under `.pipeline/`, and those control-plane writes currently
invalidate the Build implementation fingerprint.

Both defects arise from collapsing two different domains into one identity:
discussion versus execution, and control state versus implementation content.

## Decision

1. Add a distinct built-in `free` Track with `workflow.allowed='*'`, disabled
   routing, disabled automation, no coverage profile, and no standard skill
   matrix.
2. Preserve `chat` and `simple` without semantic changes.
3. Make router candidates distinguish manual availability from automatic
   routability; an explicit free-mode intent may select `free`, while content
   scoring never may.
4. Exclude the entire `.pipeline/` project control plane from implementation
   workspace fingerprints.

## Alternatives

- Repurpose `chat`: rejected because it breaks discussion and historical Change
  semantics.
- Generate per-Workflow free Tracks: rejected because it duplicates policy and
  requires lifecycle synchronization.
- Exclude only `codex-skill-receipts.jsonl`: rejected because caches, session
  projections, hooks configuration, and future control records have the same
  ownership and would recreate the defect.

## Consequences

- Every existing and future Workflow has a neutral execution pairing without a
  project migration.
- Free mode still obeys its selected Workflow's own DAG, gates, documents, and
  skills.
- Router cache schema changes once and regenerates fail-closed.
- Verify evidence can no longer self-invalidate an in-place implementation
  baseline.
- Changes to `.pipeline/workflows/` and `.pipeline/tracks.yaml` are deliberately
  not implementation drift; their canonical validation and revision contracts
  remain responsible for configuration integrity.
