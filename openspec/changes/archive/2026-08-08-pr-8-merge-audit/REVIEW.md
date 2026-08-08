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
were fixed and independently rechecked at
`4decb6e59cbfea36786bcef3b732c83ba32f9049`; all three review tracks passed at
C0/H0/M0/L0. Exact-head CI run `30419488435` also passed every configured gate;
only the workflow-defined real-Codex step was honestly skipped because its
repository secret was unavailable. The Vite informational warning refers to
the uncompressed aggregate chunk; the production server transfers the
immutable JavaScript asset as a 257,888-byte gzip response and the exact
production browser path was accepted.

## Verify return loop 1

The first frozen Verify at
`f4c29f0a0acc82beb3f7e759d4b385b334a4b0c3` supersedes the earlier final
disposition and failed with C0/H0/M2/L0. The canonical report is
`docs/superpowers/reports/2026-07-29-pr-8-merge-audit-verify-fail.md`.

### Spec correction

- Medium: the MODIFIED delta initially omitted canonical scenarios. OpenSpec
  1.6.0 stopped at `不接受自定义目标`, then exposed six additional missing plan
  scenarios after the first correction.
- Fix: compare every MODIFIED requirement and scenario title against the
  canonical `host-target-plan` spec, keep the five exact requirement names and
  every existing scenario, then add the new current-main constraints as
  additive scenarios or strengthened bodies.
- Evidence: Change strict validation passes. A second isolated clone completed
  `openspec archive pr-8-merge-audit --yes --json` with exit 0,
  `specsUpdated=true`, `modified=5`, and the generated canonical spec retained
  every prior scenario plus the new bounded-runtime, copy-only and visual
  acceptance scenarios.

### Completed Build correction

- Medium fixed: every scheduled load now records an absolute deadline from
  enqueue time. Drain rejects an expired item without starting its child, and a
  queued item with time remaining receives only that remaining budget.
- RED/GREEN evidence: the two new deterministic fake-timer regressions first
  timed out against the old implementation, then passed after the minimal
  runtime change. They prove expired-child call count zero, remaining-budget
  abort, slot recovery, and a subsequent healthy request.
- Focused server validation is 79/79. The full server source suite is 676/676
  with 9 declared skips; server typecheck passes.
- Real built runtime evidence: `maxConcurrent=1 / timeout=100ms` resolves the
  active and expired queued items near 101 ms, with the expired loaders never
  called. Default production HTTP `maxConcurrent=4 / timeout=10s` resolves all
  five distinct keys near 10 seconds instead of the former 20-second fifth
  response.

### Return-loop full validation

- Root full: 322/322 files, 5,616 pass and 14 declared external-token skips.
  The canonical Web command passes 61/61 files and 1,098/1,098 tests; isolated
  Workbench/Progress rechecks pass 133/133; Web and server typechecks pass.
- A deliberately unsupported one-fork Web experiment exposed cross-file jsdom
  pollution and was stopped with exit 130. It is not the repository gate; the
  canonical parallel Web command above is green. The initially attempted root
  `--maxWorkers=1` option was invalid for this Vitest configuration and ran zero
  tests; the supported root single-fork command is the recorded full PASS.
- A second isolated OpenSpec 1.6.0 clone archives the Change with exit 0,
  `specsUpdated=true` and five modified requirements. All 22 canonical
  scenarios are retained and the applied spec has 30 scenarios. Strict change
  and post-archive spec validation both pass.
- CLI black-box coverage passes all 12 hosts by 2 operations plus two hostile
  inputs. Darwin production API coverage passes catalog 12, plans 24, invalid
  queries 8, and protected Host routes 5. Linux Node 22 read-only Docker passes
  catalog 12, plans 24 and four hostile Host routes.
- Build output is reproducible: rebuilding CLI, server and Dashboard twice
  leaves the aggregate generated-asset SHA unchanged. Architecture, comments,
  documentation, repository hygiene, identity, document templates, workflow
  freshness, migration CAS, hooks 482/482, adapters 272/272, Skill references,
  bundle 31/31, npm package 39/39 and golden oracle all pass.

### Independent pre-Verify reviews after the fix

- Spec/apply: implementation semantics and the 362 paths in the immutable
  `4c242b928b61285561f9cdbc63617db899a18a12...b179309e62b414b6fb622daa9c1b4c7cfc77f650`
  pre-Verify snapshot map to the five requirements; focused server 79/79,
  strict validation and isolated archive/apply pass with zero scenario loss.
- Rules/Correctness/Architecture/Security: C0/H0/M0/L0. The reviewer
  independently reproduced expired-child call count zero and five real HTTP
  responses at about 10.02 seconds, and confirmed fixed argv, strict DTO,
  Host guard, error redaction, cache/in-flight/retry cleanup, generated
  artifacts, clean-room and dependency boundaries.
- Dashboard `design-taste-frontend`, Web guideline, accessibility, Browser QA
  and performance: C0/H0/M0/L0. The independent run covers
  390/768/769/900/1024/1440, zh/en, light/dark, all loading/empty/error/ready/
  retry/copy/race states, keyboard/focus/ARIA/reduced-motion and GET-only
  traces. It reports zero overflow, console/page errors, contrast failures,
  mutation controls or long tasks; ready is 71–82 ms and CLS is 0.
- Primary browser evidence is
  `/private/tmp/pr8-build-browser-final-hSVTEZ/trace.zip`
  (`sha256:23077380becef1d18695a4f00b5cbe9c7ffbae471ab9972a273b178db9c3a3d1`);
  the independent Dashboard trace is
  `/private/tmp/pr8-dashboard-preverify-uaZI7R/`
  (`sha256:332334b598d28dac0f23885aff5c0de1de6c86d0b950dd711527cd10c4e705b1`).
- The Spec and Standards reviews of that immutable `b179309e...` snapshot both
  report C0/H0/M0/L0. Its independently recomputed 362-path mapping has zero
  unmapped paths
  (`sha256:0b0a62fae91bed8d0e016809abc23899a84d064edd09f891eae233b70a0b8726`).
  GitHub Actions run `30425286953` passes `CI/verify` and Documentation Pages for
  `b179309e62b414b6fb622daa9c1b4c7cfc77f650`; the PR-only Pages deployment is
  correctly skipped.

### Second frozen Verify disposition

- The later frozen snapshot
  `4c242b928b61285561f9cdbc63617db899a18a12...dac0daa66ca5f2ad38a5e4fb9cf774d40bf9b224`
  contains 364 paths. GitHub Actions CI run `30425722325` and Documentation
  Pages run `30425722321` pass for that exact head.
- The second Verify completed every track. Product, API, OpenSpec, CLI,
  Dashboard, architecture, security, accessibility and performance remain
  C0/H0/M0/L0, including a fresh 24/24 Dashboard matrix with
  `design-taste-frontend`.
- The aggregate disposition is C0/H0/M2/L0 because the preceding paragraph had
  incorrectly called the `b179309e...` 362-path evidence current, and the
  archived `host-target-plan-dashboard` document ledger still bound the earlier
  byte-exact design document while a later commit had edited that shared path.
  The canonical report is
  `docs/superpowers/reports/2026-07-29-pr-8-merge-audit-verify-fail-2.md`.
- Build restores the archived design document to its ledger-bound immutable
  bytes. The current `--target .` contract remains in the dated PR #8 audit
  design, delta/canonical specs, CONTRACT, implementation, tests and user docs.
  A new full pre-Verify review must enumerate the complete candidate including
  all governance companions; only the new Verify report may assert the final
  frozen-head path count.

The dependency audit remains the unchanged main baseline: production has one
High and one Moderate, while the full tree has one Critical, one High and five
Moderate. This PR changes no manifest or lockfile, so it is not a PR regression;
it remains a hard blocker that the later independent dependency/release Change
must clear before any tag or GitHub Release.
