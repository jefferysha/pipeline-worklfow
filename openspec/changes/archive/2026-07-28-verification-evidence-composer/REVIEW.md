# Build design review

## Scope

Reviewed the Verify-only evidence composer against the accepted design, frontend rules, surrounding
Task Detail patterns, and the generated production Dashboard bundle.

## Findings and fixes

1. **Medium — stale response could replace an edited draft.** Entry controls and “add” remained
   active while a request was in flight. The composer now disables all draft mutations until the
   request settles, and the loading path is covered by a component test.
2. **Medium — English workspace close control had a Chinese accessible name.** `Dialog` now accepts
   an optional localized `closeLabel`; the composer supplies its current locale.
3. **Low — root-level structured errors rendered an empty path.** Empty paths now fall back to the
   localized `request` label rather than producing a dangling message.
4. **Low — unexpected formatter failures were classified as root authorization failures.** The
   server now scopes `403` handling to the two root-anchor checks; formatter failures retain the
   normal server error path.

## Re-review

- Critical findings: 0
- High findings: 0
- Medium findings remaining: 0
- Low findings remaining: 0
- Visual hierarchy: the composer is subordinate to OpenSpec evidence and appears only in Verify.
- Accessibility: native labels/fieldset, modal semantics, initial focus, Escape, focus restoration,
  focus trap, disabled loading controls, live error announcements, and manual clipboard fallback.
- Responsive behavior: 780 px maximum workspace with a 94 vw cap and single-column form fallback.
- i18n: all feature-visible strings are symmetric in `zh` and `en`.

True-browser acceptance remains a Verify-phase gate and is intentionally not claimed by this Build
review.

## Verify-fail repair round

The frozen `fe2067f` Verify round returned four actionable defects to Build. All were reproduced
with failing tests before implementation:

1. **Medium — `__proto__` escaped the closed DTO.** The server now copies untrusted request fields
   into a null-prototype record. A true HTTP regression proves an own `__proto__` field returns
   `unknown_field` instead of disappearing through the legacy setter.
2. **Medium — evidence whitespace was changed.** Kernel validation now uses a trimmed view only to
   reject blank bodies while preserving the CRLF-normalized command/result/skipReason bytes.
   Dashboard validation follows the same rule and sends the preserved values.
3. **Medium — one Escape closed two nested surfaces.** The shared Dialog consumes its topmost
   native Escape event, while the progress drawer ignores Escape when a nested modal exists. The
   integrated ProgressView regression proves the composer alone closes, the drawer remains, and
   focus returns to the composer entry point.
4. **Low — non-object validation was not decodable.** The server now includes `overflow:false` in
   the same structured error envelope used by other validation failures.

Focused re-review after the fixes: Critical 0, High 0, Medium 0, Low 0. The new tests are additive;
no assertion was weakened.

## Evidence integrity and repository hygiene

During the repair round, an external `codex exec review` process unexpectedly attempted to clean
tracked verification evidence in the live worktree. It was stopped; the canonical current pointer
was restored byte-for-byte from its matching signed immutable revision, the removed failure report
was restored at its original digest, and every subsequently changed governed document was
re-recorded through the Tenon CLI. `tenon state status`, document status, and immutable revision
checks passed after recovery.

The repository's identity hygiene gate rejects the two research-source identities in every tracked
path and text. Tracked research therefore uses the neutral labels “上游 A / 上游 B” while retaining
the read date, branch, release/tag fallback, exact commit SHAs, source file/line anchors, and design
mapping. Full repository names and immutable URLs remain in the automation memory and PR evidence;
`npm run check:repository-hygiene` passes without an exemption.

## Pre-Verify machine gates

- Focused kernel formatter: 12/12 passed.
- Focused protected HTTP route: 4 passed, 275 intentionally filtered.
- Composer + integrated nested Dialog regression: 57/57 passed.
- Dashboard typecheck and suite: 52 files, 974/974 passed.
- Full workspace suite: 316 files, 5,415 passed and 5 honestly skipped.
- Production build: kernel/CLI/server TypeScript, Dashboard, server bundle, and CLI bundle passed.
- Static/release gates: architecture, comment honesty, repository hygiene, docs, product identity,
  npx package, and hooks (482/482) passed.

Build re-review after all generated artifacts stabilized: Critical 0, High 0, Medium 0. The
pre-existing Vite chunk-size warning remains informational and does not change this feature's
runtime contract.

## Second Verify-fail repair round

The frozen `41481ab` browser tracks found one remaining keyboard defect: forward Tab from the
last focusable control in the nested composer escaped to the outer TaskDetail close button. The
integrated ProgressView regression was added first and failed with that exact focus target. The
outer progress drawer now yields the complete keyboard boundary whenever a nested modal exists,
so the shared Dialog alone owns both Tab directions and Escape. The focused suite then passed
58/58.

The frozen reviewer also reported one Low directory-boundary issue: the two composer-only
components were under `src/shared/` despite having a single feature consumer. They now live under
`src/verification/`; only the stable shared Dialog and TaskDocuments integration remain shared.
The move preserved the focused tests and Dashboard typecheck without changing the public API,
visual treatment, copy, or governed data boundary.

Post-repair machine gates: focused nested/composer tests 58/58; Dashboard 52 files and 975/975;
full workspace 316 files with 5,415 passed and 5 honestly skipped; production build; architecture,
comment honesty, repository hygiene, docs, identity, npx package, and hooks 482/482 all passed.
Existing React `act(...)` diagnostics and the Vite chunk-size warning remain non-failing baseline
output and are unrelated to this keyboard-boundary repair.
