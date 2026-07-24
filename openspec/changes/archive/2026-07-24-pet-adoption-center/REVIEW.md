# Build UI Review Receipt

**Change:** `pet-adoption-center`
**Declared Build skill used:** `pipeline-lite:frontend-design`
**Review environment:** local HTTP server + real Chromium, headless, 1440 × 960 and 320 × 760 CSS pixels

## Workflow scope

The active `pet-adoption-live` Build DAG declares `pipeline-build`,
`test-driven-development`, and `frontend-design`. Its gate correctly rejects
generic `web-design-guidelines` and `design-taste-frontend` because they are
not declared for this custom workflow. This receipt records the declared
implemented-interface review rather than bypassing the DAG.

## Review rounds

### Round 1 — finding

| Severity | User task | Finding |
| --- | --- | --- |
| High | Browse initial companions | The no-results region was visually exposed on first load because `.empty-state { display: flex; }` overrode the native `hidden` presentation. This made the page claim there were no matches while six sample cards were available. |

### Fix

- Added `[hidden] { display: none !important; }` to preserve the semantic
  hidden state for the no-results region and other intentionally hidden UI.
- Added browser assertions that the empty state is hidden initially and hidden
  again after keyboard reset.
- Ran the focused assertion red first; it failed with the exposed empty state,
  then passed after the CSS correction.

### Round 2 — re-review result

| Review area | Result |
| --- | --- |
| Information hierarchy and copy | Pass — the mission, sample-data boundary, filters, process, and local-only form are distinguishable without implying live availability. |
| Normal, empty, validation, and success states | Pass — cards and count render normally; no-results has a recoverable reset; invalid submissions focus the error summary; success says nothing was sent or stored. |
| Keyboard navigation and focus | Pass — skip link is revealed by Tab, filters/reset/form controls are reachable, and the focus ring is visible. |
| Responsive behavior | Pass — 1440px and 320px Chromium views retain all requested sections and report no horizontal document overflow. |
| Contrast and visual signals | Pass — labels, focus ring, error styling, result copy, and status messages use text and structure in addition to color. |

No Critical or High issue remains after the second actual-browser review.

## Verify-feedback repair and re-review

The independent Verify reviewers identified three P2 issues. Each was repaired
inside the existing OpenSpec requirements, with a focused regression first
made to fail and then made to pass:

| Finding | Repair | Re-review evidence |
| --- | --- | --- |
| Stale error-summary item after a resolved field | `clearApplicationError()` now rebuilds the summary from only remaining invalid controls without moving focus away from the field being edited. | The browser test fills the name after an empty submit and asserts that only email and rhythm errors remain; `pet-adoption-center-form-errors.png` shows the result. |
| Smooth scrolling despite reduced-motion preference | `startApplication()` now chooses `behavior: 'auto'` when `prefers-reduced-motion: reduce` matches. | A browser test intercepts the real `scrollIntoView()` call under emulated reduced motion and requires `{ behavior: 'auto', block: 'start' }`. |
| Clipped desktop hero caption | At desktop widths the caption now has a narrower width and a safe inset from the rounded lower-right edge. | Fresh 1440px Chromium screenshot shows the full “A good match starts with a hello.” caption. The 320px layout preserves its compact placement. |

After this repair, the page was re-reviewed in Chromium at desktop and compact
sizes. No Critical, High, or Medium interface issue remains in the reviewed
scope.

## Evidence

- `node --test design-demos/pet-adoption-center.test.mjs` passes 3 browser
  scenarios: combined filtering/empty-reset, local application recovery and
  acknowledgement, and 320px keyboard/reflow checks.
- `design-demos/shots/pet-adoption-center-desktop.png` records the re-reviewed
  desktop state.
- `design-demos/shots/pet-adoption-center-mobile.png` records the re-reviewed
  compact state.
- `design-demos/shots/pet-adoption-center-form-errors.png` records the
  partially recovered validation state.
- Verify remains an independent acceptance phase; this build receipt does not
  replace the subsequent browser-qa evidence or review gate.
