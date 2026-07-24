# normal-chat-default-orchestration verification

## Scope

This verification covers normal-chat routing, the immutable `simple` track and workflow, per-step
skill evidence, OpenSpec document evidence, Dashboard execution state, Codex installation/update,
and the single UI/API service on port 18765.

## First review result: rework

The implementation review found that in-place workspace fingerprints excluded dependency caches
only at the repository root. Nested verifier output such as
`packages/dashboard-app/node_modules/.vite/vitest/results.json` could therefore invalidate the
frozen build target during verification. The review correctly failed and returned the Change to
build for repair.

The repair excludes dependency and verifier caches at every path segment and excludes top-level
browser/E2E verification output. A regression test now changes nested Vite/Vitest and browser
artifacts while requiring the workspace fingerprint to remain stable.

## Evidence

- Final full Vitest suite: 287 files passed, 5,025 tests passed, 5 explicit external-integration
  skips. The skipped cases require external Codex/Claude credentials; the available real Docker
  paths ran.
- Dashboard suite: 46 files passed, 912 tests passed.
- Build: TypeScript project build, Dashboard production build, server bundle, and CLI bundle passed.
- Hooks: 412 passed, 0 failed.
- Adapters/fresh Codex install: 262 passed, 0 failed; `simple-task` is installed and reinstall is idempotent.
- Bundle smoke: 15 passed, 0 failed.
- Skill registry: 63 installable skills and 64 path references passed.
- Golden oracle: all fixtures matched; PM auto-enqueue was verified only after explicit
  `enabled=true` and `default_opt_in=true`.
- Comment honesty, generated default-workflow freshness, and `git diff --check` passed.
- Current Codex Desktop `function_call(exec_command)` transcript evidence is now recognized only
  after a matching successful function output; its regression test passed.
- Independent simple-task E2E review passed: concrete one-file typo routes to `simple`; ambiguous,
  multi-module, and dependency-upgrade prompts do not.
- Independent UI review passed: built-in simple workflow is available over HTTP; branch-aware Todo
  projection does not fabricate completion; terminal-only work displays `终端运行中`; AFK cancellation
  remains available when automation is actually running.
- Port 18765 served both the Dashboard and `/api/health` from the same origin.

## Final result

PASS. The build was returned through `verify-fail → build → requirements-changed → spec → build`,
the changed OpenSpec documents were re-registered with current producer evidence, and
`build-complete` froze:

`workspace:sha256:420c82f3638e0c2180dc93269922362d159632d304b7db0e6d94cea5b66b1d3d`

The independent reviewer computed the same fingerprint before and after 82 focused tests. It also
confirmed that the earlier five implementation findings, the custom-step skill hard gate, the
failure-exit document deadlock, and verifier cache self-pollution are resolved with no remaining
high or critical finding.
