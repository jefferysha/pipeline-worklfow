# Implementation plan — Release v1.0.8 and cross-terminal workflow UX

## Ordered work

1. Rebase/check exact `main` state and record the release candidate SHA.
2. Repair the high-severity dependency resolution with the smallest lockfile change;
   run audit and dependency-tree checks.
3. Bump the patch release to `1.0.8` across all identity/package/installer surfaces,
   update release notes, regenerate committed assets, and run identity/freshness checks.
4. Push the candidate commit to `main`; wait for canonical CI and documentation CI.
5. Dispatch `release-candidate.yml` with the exact 40-character `main` SHA and `v1.0.8`.
   Verify the writer creates the tag/release and that public acceptance completes.
6. [done] Add the typed adapter/definition catalog projection and installer state
   events, with a JSON endpoint and GUI client against the same contracts.
7. [done] Add Change-creation choice/preview for automatic versus custom Workflow/
   Track/Pipeline, preserving the existing freeze/replan semantics and writing an
   immutable `.pipeline-selection.json` receipt beside the Change.
8. [done] Finish SSE catalog reconciliation and revision/state tests, then
   add browser E2E covering adapter selection, custom definition refresh, and the
   frozen active Change. Independent user-authored pipeline blueprints remain on the
   existing planner-v2 API; this first GUI slice exposes the canonical workflow/track
   derived pipeline and fails closed on an unregistered pipeline id.

## Validation gates

- `npm audit --audit-level=high`
- `npm run check:dependency-tree`
- `npm run check:identity`
- `npm run check:release-workflows`
- `npm run check:architecture`
- `npm run build`
- `npm test`
- `npm run test:web`
- `bash tools/test-adapters.sh`
- `npm run test:clean-install`
- release-candidate and public-acceptance workflow runs for the exact SHA

## Product implementation notes (2026-09-02)

- `definition-catalog/v1` is a projection of the registry, project Workflow files,
  Track registry, and host target plan. It carries revision/fingerprint, provenance,
  ordered stages, in-stage Skill dependencies, and serial/parallel mode derived from
  those dependencies. The browser never parses registry files.
- `adapter-install/v1` is a JSON/SSE state machine. A job runs hosts sequentially,
  emits queued → preflight → (planned | installing → verifying → installed), and
  fails closed on non-zero CLI exits. Dry-run is the default; side effects require
  `confirm: true`.
- Workflow/Track saves continue to use their existing locked CAS APIs. The catalog
  stream polls the authoritative files and sends a complete snapshot on each
  fingerprint change, so a reconnect cannot execute a partially observed definition.
- The GUI currently exposes the canonical `${workflow}:${track}:main` pipeline
  identity. Arbitrary pipeline blueprints are supported by planner-v2 but are not
  silently invented by the Dashboard until a persisted pipeline registry contract is
  added.

## Risk and rollback points

- If dependency resolution changes more than the audited transitive package, stop and
  inspect the lockfile before committing.
- If generated assets differ after build, do not release; commit the reproducible output
  or fix the generator first.
- If `main` advances after candidate approval, discard the candidate and rerun from the
  new exact SHA; never force a tag.
- If public acceptance fails, leave the existing stable release untouched and recover
  only through the repository release workflow.

## Product-slice decision (2026-09-02)

The release slice is implemented in this change. The catalog is a typed projection over the
authoritative adapter registry, Workflow files, Track registry, and planner contract. It is
validated at the kernel boundary, fingerprinted without volatile timestamps, and reconciled by
complete SSE snapshots. The GUI installer and realtime custom-definition catalog use those
same contracts; the existing host-plan UI and JSON/CLI path remain compatible.

Post-release hardening (2026-09-02):

- finite install streams now close deterministically on completion, report transport failure,
  and cannot leave the Dashboard install button permanently busy;
- project changes detach old install streams and reject late events from a previous root;
- catalog streams clean up while the initial projection is still pending and serialize polling
  so slow CLI projections cannot emit revisions out of order;
- Change creation waits for catalog reconciliation before enabling a visible Pipeline choice,
  and the dialog previews each stage's serial/parallel mode, Skill order, and dependencies;
- the GUI exposes the canonical Workflow/Track-derived Pipeline. Independent named Pipeline
  blueprints remain on planner-v2 until a persisted Pipeline Registry contract is added.
