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
6. For the product follow-up, add the typed adapter catalog projection and installer
   state events, then implement GUI/JSON clients against those contracts.
7. Add Change-creation choice/preview for automatic versus custom Workflow/Track/
   Pipeline, preserving the existing freeze/replan semantics.
8. Add SSE catalog reconciliation and revision-gap tests; add browser E2E covering
   adapter selection, custom definition save, refresh, and frozen active Change.

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

The release slice is implemented in this change. The existing server/dashboard stream is
currently a Change snapshot stream and the existing host-target projection is a read-only
`host-target-plan/v1` contract; neither is a sufficient write/CAS contract for a durable
`adapter-catalog/v1` or Workflow/Track/Pipeline definition catalog. Adding those projections
without a typed reducer, provenance event, and revision-gap reconciliation would create a
second source of truth. The GUI installer and realtime custom-definition catalog therefore
remain explicitly deferred until their command/event schemas are designed and accepted; the
existing adapter registry and host-plan UI remain unchanged and continue to provide the safe
scriptable installation path.
