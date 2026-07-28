# Loop Scope Preview — UI Review

Date: 2026-07-28

## Review loops

### Loop 1 — entry and information architecture

- Finding: the existing Workbench governance trigger was hidden, so the new preview was only reachable in component tests.
- Resolution: promoted the existing governance trigger to a visible, keyboard-accessible `Governance · Loop` action using the established button treatment and an icon with `aria-hidden`.
- Regression guard: `openGovernance()` now requires the trigger to be visible before opening the governance Dialog.

### Loop 2 — behavior and resilience

- Verified empty input keeps submission disabled.
- Verified non-canonical absolute input is rejected inline before a request.
- Verified a throttled real request exposes the loading status and disables the input/action.
- Verified mixed paths report allowed, denylist-blocked, and outside-allowlist results with the first matching pattern.
- Verified an invalid live registry produces a retained-input error with Retry; repairing the fixture and retrying restores the result.
- Verified `Ctrl+Enter`, `Escape`, backward tab movement, and focus return to the invoking button.

### Loop 3 — visual and responsive review

- Desktop: inspected the nested Dialog in light and dark themes at 1280×720.
- Mobile: inspected the same result at 390×844; the Dialog remains readable, scrollable, and its actions remain reachable.
- English: inspected the entry, explanatory copy, field label, limits, and actions after switching language through Dashboard settings.
- Result cards preserve path readability, status color contrast, and compact summary hierarchy in both themes.

### Loop 4 — standards and specification review

- Rejected Windows drive-letter and backslash absolute forms in both the API UX parser and authoritative server parser.
- Moved UX parsing and protocol limits out of the component into the typed API adapter.
- Added `AbortController` propagation and close/unmount cancellation; stale results remain generation-guarded.
- Replaced domain-type aliases in the HTTP response with an explicit DTO conversion.
- Narrowed request and registry error handling, separated registry syntax (409) from registry I/O (500), and removed duplicate trust-anchor response construction.
- Mapped stable server codes and client failure kinds to complete Chinese and English messages; raw server-localized text is no longer rendered.
- Added regression tests for Windows paths, cancellation, English errors, stable code mapping, and registry I/O failure.
- Added explicit before-read and after-read trust-anchor failure coverage; both stages preserve the cause and map to the same stable 403 response.

### Loop 5 — Verify-fail security返工

- Independent review proved the first implementation followed an external `.pipeline` symlink and accepted
  success-shaped responses for another Loop. The exact `verify-fail` event returned the Change to Build;
  `requirements-changed` then re-approved the stable 403/500 and response-binding contracts in Spec.
- TDD red reproduced both defects. The server now validates the existing trusted `.pipeline` chain, opens
  `loops.yaml` with `O_NOFOLLOW`, verifies the child entry and inode before and after the fd read, and returns
  403 for pre-existing symlink/observed identity loss while preserving 500 for trusted non-missing I/O faults.
- A second Spec correction removed an impossible absolute claim: Node/Darwin does not expose `openat` for
  child lookup, so the final pathname micro-race remains inside the repository's existing same-principal
  writer trust boundary. The endpoint never returns a result after observed identity loss and remains
  non-authoritative; it does not claim isolation from a malicious writer that already controls the project.
- The Dashboard decoder now rejects more than 100 items and inconsistent `active && L3` facts; the client
  additionally binds `loop_id` and the exact path sequence to the request before rendering.
- Focused green: server/kernel 293/293 and Dashboard 80/80. Full gates: web 52 files / 972 tests,
  repository 317 files / 5,462 passed / 5 skipped, plus build/type/architecture/comments/diff checks.

### Loop 6 — rebuilt browser and OpenSpec acceptance

- Rebuilt target URL `http://127.0.0.1:19766/` served this worktree's server and SPA; title was
  `Tenon Dashboard`, `/api/health` was 200, and the selected target root was confirmed before acceptance.
- Real success through `bundled-authority-live`: `packages/server/src/server.ts` allowed by `packages/**`;
  `secret.env` blocked outside allowlist. `Meta+Enter`, zero horizontal overflow and trigger focus return passed.
- A live intercepted success response carrying `loop_id=wrong-loop` was rejected into the localized
  retry state; empty input kept submission disabled.
- The rebuilt structured acceptance record is persisted at `/tmp/tenon-loop-scope-qa-final.json`;
  it binds the result to the rebuilt `index-6Vd7vRlM.js` asset, target root, health check, keyboard path,
  response-binding failure, empty state, focus return, overflow check and server cleanup.
- OpenSpec 1.6.0 show/strict validate passed. After the final platform-boundary amendment, isolation was
  rerun at `/tmp/tenon-loop-scope-openspec-final.sfgUAw`: show reported five requirements / eighteen
  scenarios, archive/apply generated a strict-valid `loop-scope-preview` main spec, and the real repository's
  main-spec digest stayed byte-identical. `validate --all` still reports 12 unrelated baseline failures and
  is not claimed green.

## Acceptance environment

- Dashboard URL: `http://127.0.0.1:19765/`
- Verified title: `Tenon Dashboard`
- Served server bundle: this worktree's `packages/server/dist/dashboard.mjs`
- Served SPA: this worktree's `packages/dashboard-app/dist/index.html`
- Registered fixture root: `/private/tmp/tenon-scope-preview-browser.LX6yFh`
- Fixture policy: allow `src/**`, `docs/**`; deny `src/secrets/**`, `**/*.env`; active L3.

## Review result

PASS. No critical, high, or medium UI findings remain.

The final two-axis Standards/Spec re-review reported no remaining actionable findings.
