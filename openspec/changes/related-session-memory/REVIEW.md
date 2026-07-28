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

## Frontend design and browser review

- Reused existing semantic tokens and detail-section rhythm; no new visual system or raw palette was introduced.
- The search form keeps one primary action, visible labels, disabled loading controls, native focus treatment, structured result cards, and distinct warning/error surfaces.
- Verified the served page title is `Tenon Dashboard` and `/api/health` is the Tenon server before acceptance.
- Verified real success, complete empty, partial empty, stopped-server error/retry, and Enter-key submission.
- At `390 × 844`, the dialog and result region stayed within the viewport and the document had no horizontal overflow.
- Browser console review found no application errors.
