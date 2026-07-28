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

### Iteration 5 — third Verify-fail remediation

1. **High — repeated-token search could monopolize the synchronous server.**
   Deduplicated query tokens for scanning, preserved multiplicity in exact public hit counts, bounded excerpt
   candidates, and pre-indexed paragraph boundaries. A 5,000-occurrence regression proves deterministic
   excerpts with at most six chunk slices while keeping the legacy repeated-token count.
2. **High — malformed OpenCode parent graphs could loop forever.**
   Added a `platform:id` visited set per root. Ordinary chains still flatten transitively, while two-node and
   self cycles terminate without duplicates or including the root as its own descendant.
3. **Medium — metadata and dialogue reads did not share one physical-file allowance.**
   Added optional range-bounded reads and request-local per-path accounting, so the 8 KiB metadata prefix is
   deducted from the same 2 MiB file ceiling. Oversized first events now produce an honest partial warning.
4. **Medium — OpenCode reset its allowance for each session in one database.**
   Request-local SQLite counters are now keyed by the shared budget identity and database path, so all selected
   sessions from one `opencode.db` consume one cumulative per-source allowance.
5. **Medium — unreadable selected source directories looked like complete empty results.**
   Production `nodeMemFs` exposes an optional checked directory read. Existing-but-unreadable selected sources
   now emit `directory-read-unavailable`; absent directories remain legitimate complete-empty sources.
6. **Medium — Related Sessions privacy handling regressed legacy CLI ranking.**
   Host-summary reclassification is now an explicit Related Sessions option. Existing CLI search retains its
   user counts, excerpts, scores, and ordering; the Dashboard path still excludes synthetic summaries from
   user-only matches.
7. **Low — wide validation moved the primary action below the input row.**
   Replaced `self-end` with the label-height-aligned wide breakpoint placement. Production Chrome measured a
   `0 px` top-edge delta while the 390 px form remained stacked with zero horizontal overflow.

The delegated review findings against earlier frozen commits were also rechecked rather than assumed current:
OpenCode child identity already uses `platform:id` and only OpenCode parent edges; the production synchronous
kernel/HTTP regression passes with one `200` and one queued `429`; and the opaque semantic hover background
computes to `5.0156:1` in light mode. Current Build browser evidence is
`/tmp/tenon-rsm-build4-browser.UeEuGi/browser-qa.json` with exact Tenon page/root/Change identity, all primary
states, keyboard order, light/dark computed styles, and responsive measurements.

### Iteration 6 — final bounded-search review

1. **Medium — early per-token excerpt caps could miss a later full-coverage paragraph.**
   Occurrences now merge as ordered token cursors. Every distinct chunk remains eligible while only the
   remaining top-K excerpt candidates are retained, preserving `coverage → rarity → start` ordering and
   repeated-token counts without restoring an unbounded occurrence array.
2. **Medium — cycle guards terminated traversal but the search layer absorbed every cycle node.**
   Absorption now removes the lexicographically smallest `platform:id` from each corrupt cycle as a stable
   searchable root. Public SQLite regressions cover an ordinary chain, a two-node cycle, and a self-cycle
   with unique result IDs and exact merged counts.
3. **Medium — a complete early metadata line could hide a later required Claude cwd beyond 8 KiB.**
   Adapters now receive checked metadata status and mark the response partial only when required project
   identity is still unknown after a truncated prefix. Complete, sufficient metadata remains non-partial.
4. **Medium — separately decoded ranges could corrupt a UTF-8 code point at the 8 KiB boundary.**
   Bounded reads optionally expose exact source bytes; the request wrapper accumulates those bytes and decodes
   the combined prefix once. A regression places an emoji across the exact boundary and still returns the
   matching user excerpt without a false partial warning.
5. **Medium — OpenCode session metadata bypassed the database content budget.**
   The budgeted SQL projection caps every text column, consumes returned metadata bytes from the same
   request/database counter as dialogue rows, and limits iteration from conservative per-source/aggregate
   capacity. The unbudgeted CLI branch remains byte-for-byte semantic compatible and returns long fields.

After this pass the strict read-only reviewer reported no remaining Critical or High and each confirmed Medium
has a focused red/green regression. The final architecture pass extracted the SQLite budget implementation
into `opencode-budget.ts`, keeping both production modules below the 450-line boundary without changing the
adapter contract. After that mechanical split, focused kernel coverage passed 74/74, the full repository suite
passed 5,495 with five honest external-environment skips, the standalone Dashboard suite passed 982/982, the
root production build passed, and architecture, documentation, repository-hygiene, hooks (482/482), skills,
and CLI oracle (two runs, zero differences) gates passed.

## Frontend design and browser review

- Reused existing semantic tokens and detail-section rhythm; no new visual system or raw palette was introduced.
- The search form keeps one primary action, visible labels, disabled loading controls, native focus treatment, structured result cards, and distinct warning/error surfaces.
- Verified the served page title is `Tenon Dashboard` and `/api/health` is the Tenon server before acceptance.
- Verified a real backend complete-empty response and Enter-key submission, plus built-page loading, result,
  source-partial, validation, error, and retry paths using valid/invalid HTTP envelopes.
- Verified settled light/dark normal/hover computed colors and contrast; all four states exceed 4.5:1.
- At `390 × 844`, the dialog and result region stayed within the viewport and the document had no horizontal overflow.
- Browser console review found no application errors.
