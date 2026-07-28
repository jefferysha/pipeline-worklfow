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
