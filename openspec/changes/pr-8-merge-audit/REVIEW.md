# PR #8 Build review

## Scope

This review covers the merged PR #8 source against current `main`, including the
CLI contract, local Dashboard server, Host Plan UI, generated distributions,
English and Chinese copy, and the real production Dashboard.

The Dashboard review used `frontend-design`, `web-design-guidelines`, and
`design-taste-frontend`; it was not treated as a backend-only change.

## Findings and fixes

### Round 1 — selected-card layout reflow

- Severity: Medium.
- Evidence: selecting a host expanded that card across the two-column catalog,
  moving every later card and making comparison difficult.
- Fix: use a stable master-detail workspace. The target catalog remains in its
  own bounded column and the selected plan appears in a separate sticky detail
  column.
- Regression: component tests assert the stable workspace and selected target
  detail.

### Round 2 — mobile detail was below the complete catalog

- Severity: Medium.
- Evidence: at 390 px, selecting a host left the detail after all twelve target
  cards, so the result was not visible at the interaction point.
- Fix: preserve the catalog-before-detail DOM order, switch to one column below
  900 px, and scroll then focus the selected detail. This keeps visual and
  keyboard order aligned while making the result immediately reachable.
- Regression: component tests assert DOM ordering, responsive classes, detail
  focus, and the mobile selection scroll path. Real browser checks confirm that
  the next Tab after selection reaches Setup instead of the following host.

### Round 3 — production asset transfer was unnecessarily large

- Severity: Medium.
- Evidence: the production server transferred the 851,010-byte JavaScript asset
  without content encoding.
- Fix: negotiate gzip for compressible immutable assets, emit
  `Vary: Accept-Encoding`, honor `gzip;q=0`, and cache the bounded set of
  generated asset encodings.
- Regression: real `node:http` tests cover gzip and identity responses. The
  final 851,512-byte JavaScript asset transfers as 257,888 bytes with gzip.

### Round 4 — Dashboard tests emitted asynchronous-render warnings

- Severity: Medium.
- Evidence: App/Workbench, SkillChain, AFK log polling, and empty TaskDetail
  animation paths left React `act` or GSAP empty-target warnings even though the
  assertions passed.
- Fix: drive asynchronous interactions and microtask settlement inside `act`,
  keep unrelated registry requests pending in projection-only tests, and skip
  animation dispatch when the scoped stage list is empty.
- Regression: all 1,098 Dashboard tests pass with no React or GSAP warnings.

### Round 5 — adapter command was not safe to paste

- Severity: High.
- Evidence: adapter previews used the literal shell metacharacters
  `<project>`. Pasting the displayed command could be interpreted as input
  redirection instead of a placeholder.
- Fix: adapter plans now use `--target .` and explicitly state that the command
  targets the current project directory. CLI, server decoder, Dashboard copy,
  tests, and user documentation use the same contract.
- Regression: the complete 12-host by 2-operation truth table is covered, and
  every adapter plan returned by the production API uses `--target .`.

### Round 6 — invalid CLI input reflected terminal controls and secrets

- Severity: Medium.
- Evidence: invalid host and operation values were interpolated into error
  output, allowing newlines, ANSI controls, or secret-like input to be echoed.
- Fix: return stable allow-list errors that never include the rejected value.
- Regression: hostile-input tests and real CLI black-box checks confirm no
  attacker-controlled text or fake secret is present in stderr.

### Round 7 — Host validation happened after protected routes

- Severity: High.
- Evidence: `/`, `/index.html`, and `/api/cadence/status` were reachable before
  the local Host guard; the HTML response could include the injected bearer
  bootstrap token.
- Fix: keep only immutable assets and `/api/health` before the guard. All HTML
  and state-bearing API routes now require an accepted Host header.
- Regression: real server tests and production HTTP checks return 403 for all
  three protected routes under `Host: evil.example.com`.

### Round 8 — stale plan requests were ignored but not cancelled

- Severity: Medium.
- Evidence: sequence checks suppressed stale rendering, but host switches,
  retries, and unmounts left obsolete requests running.
- Fix: carry `AbortSignal` through the API client and abort the exact active
  request on host switch, retry, and unmount while retaining sequence guards.
- Regression: client and component tests cover signal forwarding, host-switch
  cancellation, and unmount cancellation.

### Round 9 — selected target name and responsive reading order

- Severity: Medium, with one Low density finding.
- Evidence: the selected control exposed only the generic accessible name
  "已选择"; responsive CSS also placed detail before the catalog visually while
  leaving the opposite DOM order, and the 769 px two-column view was crowded.
- Fix: expose target-specific selected names in both locales, remove CSS
  reordering, focus the detail after selection, and move the two-column
  breakpoint to 900 px.
- Regression: tests assert `Cursor，已选择` / `Cursor, selected`, DOM and focus
  order, and the breakpoint. The exact production asset was rechecked at
  390/769/900/1024/1440 px in Chinese and English, light and dark themes.

### Round 10 — programmatic detail focus had no visible indicator

- Severity: Medium.
- Evidence: the detail received `:focus-visible` after keyboard selection, but
  `outline-none` left it with neither an outline nor a box shadow.
- Fix: retain the programmatic focus target and add an accent
  `focus-visible:ring-2` indicator around the detail.
- Regression: the mobile component test requires the focus-visible classes.
  Real keyboard activation on the exact rebuilt production asset leaves the
  detail active with `:focus-visible=true` and a computed two-pixel accent ring.

## Final visual and interaction matrix

- 1440 px and 1024 px desktop: light and dark theme; stable master-detail
  layout; no horizontal overflow.
- 900 px boundary: two columns remain usable without overflow.
- 769 px, 768 px, and 390 px: single-column layout; detail is focused at
  selection and the next Tab reaches Setup;
  no horizontal overflow.
- Chinese and English copy: host, operation, steps, notices, loading, empty,
  error, retry, and copy feedback remain readable.
- Keyboard: visible focus ring, Enter activation, native button semantics, and
  copy action verified.
- Reduced motion: the Host Plan introduces no required animation; existing
  shell motion-reduction behavior remains intact.
- Production console: zero errors and zero warnings.

## Final disposition

Critical: 0. High: 0. Medium: 0. Low: 0. All findings discovered in this review
were fixed and rechecked locally; the final independent incremental re-review
and exact-head CI remain required before Build may complete. The Vite
informational warning refers to the uncompressed aggregate chunk; the
production server transfers the immutable JavaScript asset as a 257,888-byte
gzip response and the exact production browser path was accepted.
