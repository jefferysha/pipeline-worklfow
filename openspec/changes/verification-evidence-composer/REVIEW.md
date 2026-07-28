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
