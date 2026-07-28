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

### Iteration 7 — fourth Verify-fail and independent Codex review remediation

1. **High — Codex replacement-history summary could qualify as original user content.**
   The final generated user message in replacement history now carries the same internal, non-serializing host-summary
   provenance used by Claude/Pi. A summary-only query is excluded, while a preserved real user message in the
   same replacement history remains eligible and legacy CLI turn serialization is unchanged.
2. **High — filesystem discovery was unbounded before content and candidate limits.**
   Production `nodeMemFs` now exposes an `opendirSync`-backed bounded directory primitive. Related Sessions
   applies one request-wide entry/depth/time budget and bounded newest-first top-K storage across
   Claude/Codex/Pi, returning `candidate-discovery-truncated` when any edge is reached. A 2,000-file
   production-fs regression proves entry/file caps and bounded event-loop delay.
3. **High — OpenCode dialogue projections left relationship identifiers and SQL work outside the budget.**
   Message ids and part message ids are byte-capped and accounted with row data; truncated relationships are
   rejected. Both queries now carry an explicit SQL row limit and deterministic primary-key order, then restore
   dialogue order within the bounded row set.
4. **Medium — the exported child index silently dropped historical bare-id lookups.**
   Internal search/context remain strictly keyed by `platform:id`, while the public map also publishes a
   compatibility alias only for OpenCode parent edges. The cross-host collision regression remains green.
5. **Medium — project/Change switches and invalid token counts were incomplete at the UI boundary.**
   TaskDetail now keys the section by root plus Change name, guaranteeing synchronous remount before any old
   excerpt can commit. The form also mirrors the server's eight-token limit with accessible Chinese/English
   validation and never sends the invalid request.

Focused red tests failed for each prior behavior, then passed after the smallest implementation changes. The
new frozen commit must rerun all Verify tracks; no E2E, visual, or review PASS from `51e5237` is reusable.

### Iteration 8 — pre-Verify full-diff closure

1. **High — remote Codex compaction lost the last real user message.**
   Current Codex has two persisted shapes: local compaction ends with a plaintext user-role summary, while
   remote compaction ends with an opaque `compaction` item. Summary provenance is now applied only when the
   final replacement item itself is a user message; a focused remote-shape regression proves the preceding
   real user remains searchable.
2. **Medium — bounded directory failures and top-K drops could look complete.**
   The production `readDirBounded` path now preserves the existing unreadable-directory warning, and accepting
   more files than the bounded top-K emits `candidate-discovery-truncated`. An older project session displaced
   by 400 newer foreign files therefore yields an honest partial response instead of a complete empty result.
3. **Medium — one large directory could overrun the discovery deadline while ranking.**
   The traversal rechecks the request deadline before each entry stat and stops with the stable truncation
   warning. A deterministic injected-clock regression proves only budget-admitted entries reach `mtimeMs`.
4. **Medium — a small positive SQLite remainder could silently stop dialogue reads.**
   When fewer than 512 bytes remain for the relationship-id reservation, the adapter now reports source or
   aggregate exhaustion before returning. The 256-byte regression proves the response cannot claim complete.
5. **Medium — generated production bundles lagged the final source fixes.**
   The root production build was rerun after all source changes, regenerating both `dashboard.mjs` and
   `tenon.mjs`; the final frozen review must inspect those new bytes rather than the earlier bundle.

This pass used the complete pending diff against `origin/main`, not only the fourth Verify findings. Every
confirmed Critical/High/Medium issue received a red/green regression or deterministic generation check before
the final full repository validation.

### Iteration 9 — request-wide discovery and key-space closure

1. **Medium — the file ceiling restarted for every host/root traversal.**
   The request budget now owns both remaining and consumed discovery-file slots. Each bounded traversal
   reserves from that shared counter, so multiple Pi roots and an all-host search cannot each admit a fresh
   400 candidates.
2. **Medium — an exact bounded directory read was falsely marked partial.**
   Truncation now follows the bounded reader's explicit `truncated` bit. Fallback readers compare the full
   materialized entry count before slicing, avoiding a warning when the directory ends exactly at the
   remaining-entry boundary.
3. **Medium — a legacy bare alias could overwrite a canonical OpenCode child key.**
   Canonical `platform:id` entries are populated first; compatibility aliases are added only when their key is
   unambiguous. A regression with parent ids `x` and `opencode:x` proves both canonical descendant lists remain
   isolated.

The focused regression set passes 72/72 after these fixes. Because these findings changed production source
and generated bundles, the final full validation and frozen four-track Verify must run again.

### Iteration 10 — fair host admission and boundary-level hard limits

1. **High — a busy first host could starve later hosts in `platform=all`.**
   The fixed request totals are now partitioned across selected filesystem hosts for files, entries, and
   elapsed discovery time. Single-host filters retain the full budget; all-host searches reserve a bounded
   share for Claude, Codex, and Pi before adapter fan-out. A 400-file Claude adversary can no longer hide a
   newer matching Codex session, while the response remains honestly partial.
2. **Medium — SQLite advanced the row iterator before proving projection capacity.**
   The adapter now checks room for the maximum relationship-plus-data projection before `iterator.next()`.
   A constant-only `SELECT 1` probe distinguishes true EOF from an unread row without materializing that row's
   bounded payload, preserving honest partial reporting without reading beyond the declared byte ceiling.
3. **Medium — the 75 ms deadline began outside the production directory reader.**
   `readDirBounded` now accepts the request's continuation predicate and checks it before every synchronous
   `readSync`. A production-fs regression stops inside one directory and reports truncation, rather than
   waiting until all admitted entries have already blocked the event loop.

Focused kernel coverage passes 74/74 after these changes. Generated server and CLI bundles, the full repository
suite, and every review track must be regenerated from the next frozen SHA.

### Iteration 11 — nested-host privacy and multibyte SQLite closure

1. **High — recursive Claude discovery admitted nested subagent transcripts.**
   Related discovery now traverses only the documented Claude layout: direct JSONL children of the selected
   project directory, or one project-directory level below the Claude projects root. Session-local
   `subagents/*.jsonl` files are never promoted to top-level related sessions, cannot expose delegated prompts,
   and cannot consume the candidate quota. A newer matching subagent adversary leaves only the real parent
   session in the response.
2. **Medium — multibyte SQLite truncation could be mistaken for a complete relationship id.**
   Truncation now compares SQLite's original BLOB length with the exact SQL byte cap, rather than the
   replacement-character text after decoding. A 513-byte id split inside `é` is rejected, emits the stable
   partial warning, and cannot join to a similarly corrupted part projection.

The red/green kernel set now passes 76/76. These findings invalidate every earlier frozen review result; the
next Build freeze must regenerate production bundles and rerun all four Verify tracks from the new SHA.

### Iteration 12 — pre-query work bounds

1. **High — Claude fallback eagerly materialized every project directory.**
   Full-recall `allDirs()` enumeration is now lazy and exclusive to the legacy unbudgeted CLI branch. When the
   encoded project directory is absent, Related Sessions begins directly at the bounded provider-backed walk.
   A regression makes unbounded root `readDir` throw while the fallback still finds the matching project.
2. **High — SQLite `LIMIT` did not prove bounded query work.**
   Bounded dialogue reads now compile and inspect `EXPLAIN QUERY PLAN` before execution and fail closed with a
   partial source warning on any table scan or temporary sort. Message reads use OpenCode's official
   `(session_id,time_created,id)` index; part reads are scoped per admitted message through the official
   `(message_id,id)` index. A fixture with both indexes removed returns no dialogue and records source
   unavailability instead of running a history-size-dependent synchronous scan.

The focused kernel set passes 78/78 and kernel typecheck passes. The production build and every frozen Verify
track remain mandatory after the next final independent full-diff review.

### Iteration 13 — stable partial-warning contract

1. **Medium — query-plan failure bypassed the Dashboard source classification.**
   The fail-closed OpenCode path now emits the existing stable `opencode-reader-unavailable` warning instead
   of deriving a new query-plan-specific protocol code. The kernel-to-Dashboard contract therefore selects
   the source-unavailable empty/partial state and continues to hide internal storage details. An integration
   regression drops the message composite index and verifies the exact stable warning.

The focused kernel set passes 79/79 and kernel typecheck passes. Because the protocol output changed after the
last review, the next independent review and all frozen Verify evidence must be newly generated.

## Frontend design and browser review

- Reused existing semantic tokens and detail-section rhythm; no new visual system or raw palette was introduced.
- The search form keeps one primary action, visible labels, disabled loading controls, native focus treatment, structured result cards, and distinct warning/error surfaces.
- Verified the served page title is `Tenon Dashboard` and `/api/health` is the Tenon server before acceptance.
- Verified a real backend complete-empty response and Enter-key submission, plus built-page loading, result,
  source-partial, validation, error, and retry paths using valid/invalid HTTP envelopes.
- Verified settled light/dark normal/hover computed colors and contrast; all four states exceed 4.5:1.
- At `390 × 844`, the dialog and result region stayed within the viewport and the document had no horizontal overflow.
- Browser console review found no application errors.
