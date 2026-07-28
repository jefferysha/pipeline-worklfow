# Build Review

## Scope reviewed

- Compared the complete implementation diff with the approved proposal, design, delta spec, and plan.
- Reviewed the kernel bounded-read and adapter paths, server authorization and error boundary, Dashboard decoder/state/UI, i18n, tests, and generated artifacts.
- Exercised the built Tenon Dashboard against the exact `related-session-memory` Change, including narrow viewport and keyboard behavior.

## Review iterations

### Iteration 1

1. **Medium — OpenCode project candidates could be hidden by unrelated recent sessions.**
   The bounded SQLite query originally applied its 100-row limit before project filtering. A busy global database could therefore return no target-project sessions even when they existed. Fixed by constraining the SQL query to the exact project root and descendants before ordering and limiting. Added a regression fixture with 101 newer sessions from another project.
2. **Medium — a partial empty response looked complete.**
   When budgets were exhausted with no matches, the Dashboard discarded the successful response and rendered the ordinary no-results copy. Fixed the empty state to retain the response, show the partial warning, and state that the result covers only the bounded read window in both English and Chinese.
3. **Medium — the explicit keyboard path failed in the built in-app browser.**
   Pressing Enter in the query field did not submit in the real Dashboard runtime even though the form used native submit semantics. Added a narrow `requestSubmit()` fallback on Enter and confirmed the rebuilt production Dashboard returns a result through `locator.press("Enter")`.
4. **Medium — a valid 320-code-point excerpt containing emoji could fail Dashboard decoding.**
   The kernel truncates by Unicode code point, while the decoder used UTF-16 string length. Fixed the decoder to use code-point length and added a 320-emoji protocol test.

### Iteration 2

- Re-reviewed the complete diff after all fixes.
- Confirmed root anchoring, Change existence, shared Host/token/content-type/body guards, single-flight behavior, stable error codes, and the absence of write/resume/cache effects.
- Confirmed the public DTO contains only opaque session metadata and bounded user excerpts; source paths, cwd, assistant, reasoning, and tool content are not serialized.
- Confirmed the CLI memory-search behavior remains unchanged when no related-search budget is supplied.
- Confirmed stale requests are aborted and generation-checked, and the UI resets when either project root or Change name changes.
- Confirmed loading, results, partial-results, partial-empty, complete-empty, error, retry, and bilingual paths are represented in tests.

No remaining Critical, High, or Medium findings.

### Iteration 3 — Verify-fail remediation

1. **High — Claude sessions without cwd failed open inside a sanitized project directory.**
   Changed scoped listing to require `sameProject(cwd, requestedRoot)` even when `cwd` is absent, and added a
   collision-shaped regression fixture.
2. **Medium — the 100-candidate limit happened after adapter metadata reads.**
   Added a request-local candidate admission budget before session-file reads, sorted file-backed adapters by
   mtime first, and surfaced `candidate-limit-reached` as an honest partial result.
3. **Medium — an unavailable or invalid OpenCode SQLite reader looked like a complete empty result.**
   Existing databases that cannot be opened or queried now add `opencode-reader-unavailable`; an absent database
   still remains the legitimate complete-empty case.
4. **Medium — query length diverged between Unicode code points and UTF-16 code units.**
   Dashboard validation and response decoding now match the kernel's code-point contract, including 128 emoji.
5. **Medium — Enter could submit during IME composition.**
   The explicit fallback now ignores `isComposing` and legacy key code 229.
6. **Medium — the primary search button's light-theme contrast was below 4.5:1.**
   The button now uses the existing theme-aware `--btn-hover` background with `--btn-fg`; this yields the darker
   green/white pair in light mode and the bright green/dark-ink pair in dark mode.
7. **Low — documentation and concurrent append edge.**
   Corrected the 上游 B mapping from GET to protected read-semantics POST and re-checks final file size after the
   bounded read so a concurrent append is reported as truncated.

The targeted TDD regressions, root build, and generated Dashboard/server/CLI bundles pass after this remediation.
The rebuilt production Dashboard was then re-opened at `http://127.0.0.1:62419/`: the page title was
`Tenon Dashboard`, the search button computed to `rgb(21, 128, 61)` on `rgb(255, 255, 255)` (contrast
`5.02:1`), a composing Enter emitted zero requests, and an explicit click submitted all 128 emoji through
the real POST endpoint. At `390 × 844`, document `scrollWidth` remained exactly `390`.

### Iteration 4 — second Verify-fail and delegated review remediation

1. **High — candidate admission was adapter-ordered instead of globally recent within the project.**
   File-backed adapters now perform bounded metadata discovery before body reads, exclude foreign-project
   sources, and return project-eligible metadata for one global recency sort and 100-session cut. TDD covers
   100 older Claude sessions versus one newer Codex session and 100 newer foreign Codex/Pi sessions.
2. **High — Claude/Pi host summaries could satisfy the user-only contract.**
   Host compaction and branch summaries retain internal non-enumerable provenance and are treated as
   assistant content by matching/excerpt selection without changing the public CLI dialogue JSON shape.
3. **High — bare session ids could merge an OpenCode child into another host.**
   Child indexes, candidate membership, DFS traversal, context lookup, and descendant counts now use
   `platform:id`; parent edges are accepted only from OpenCode to OpenCode. A cross-host same-id regression
   proves Codex is not absorbed.
4. **Medium — a synchronous production scan made the HTTP busy gate unobservable.**
   A real production-kernel HTTP regression queues a second socket request while the event loop is blocked.
   The executor keeps `inFlight` through one post-scan poll turn, so the queued request receives
   `429 memory-search-busy` and a later request succeeds.
5. **Medium — partial and input error states were not truthful or actionable enough.**
   The Dashboard maps stable warning codes to read-limit, unavailable-source, or safe generic copy; warning
   messages and paths remain hidden. Queries outside 2–128 Unicode code points now render localized,
   focusable `role=alert` validation with `aria-invalid`/`aria-describedby`. Inputs also have stable names
   and disable autocomplete.
6. **Medium — the light hover state fell below normal-text contrast.**
   Removed the `/90` hover blend and retained the opaque semantic background. Production Chrome settled
   computed styles measured light normal/hover at `5.016:1` and dark normal/hover at `10.994:1`.

The final Build review found no remaining Critical, High, or Medium defect. Combined focused verification
passed 68 kernel, 10 server, and 55 Dashboard tests plus kernel/server/Dashboard type checks and the root
production build. Browser evidence is recorded at
`/tmp/tenon-rsm-browser.jq3NWC/browser-qa-summary.md`.

## Frontend design and browser review

- Reused existing semantic tokens and detail-section rhythm; no new visual system or raw palette was introduced.
- The search form keeps one primary action, visible labels, disabled loading controls, native focus treatment, structured result cards, and distinct warning/error surfaces.
- Verified the served page title is `Tenon Dashboard` and `/api/health` is the Tenon server before acceptance.
- Verified a real backend complete-empty response and Enter-key submission, plus built-page loading, result,
  source-partial, validation, error, and retry paths using valid/invalid HTTP envelopes.
- Verified settled light/dark normal/hover computed colors and contrast; all four states exceed 4.5:1.
- At `390 × 844`, the dialog and result region stayed within the viewport and the document had no horizontal overflow.
- Browser console review found no application errors.
