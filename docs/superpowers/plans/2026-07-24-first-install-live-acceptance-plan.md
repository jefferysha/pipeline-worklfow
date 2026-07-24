# First-install Live Acceptance Plan

> change: `first-install-live-acceptance`
> design-doc: `docs/superpowers/specs/2026-07-24-first-install-live-acceptance-design.md`

## Stage 1 — tracer bullet

Update the server root-resolution seam so a root added to the kernel project registry after process start is captured exactly once through the existing safe anchor primitive. Add one server integration test that starts empty, registers a temporary project, and immediately reaches a workflow endpoint. Verify with the focused server test.

此处建议 `/clear`。

## Stage 2 — security regression envelope

Retain the existing anchored-root replacement, symlink, inaccessible-path, and unregister cleanup tests. Add assertions that a failed capture does not add or overwrite an anchor. Verify the focused root-anchor and server suites.

此处建议 `/clear`。

## Stage 3 — packaged and live acceptance

Rebuild CLI/server/Dashboard bundles; run bundle, hook, adapter, and skill checks. Install through `pipeline setup --codex --auto-update --yes`, start the global dashboard on 18765, register a fresh temporary project, create/read workflows, and confirm the health releaseId equals the active managed runtime. Rollback remains the previous verified content-addressed release.
