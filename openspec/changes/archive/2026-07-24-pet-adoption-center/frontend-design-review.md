# Frontend Design Review

**Change:** `pet-adoption-center`
**Reviewed implementation:** `design-demos/pet-adoption-center.html` with its local CSS and JavaScript
**Browser:** locally served Chromium, headless, at 1440 × 960 and 320 × 760 CSS pixels

## User-task review

| User task | Review result |
| --- | --- |
| Understand the page and begin browsing | Clear hero, primary jump link, named sample-only scope, and visible result count establish a readable starting point. |
| Narrow the companion list and recover | Native labeled filters, result status, empty-state explanation, and reset action remain visible and keyboard-operable. |
| Begin an introduction | Each card has one explicit action; selecting it updates the form context and moves focus to the first useful field. |
| Recover from an incomplete form | The form presents an in-context error summary, marks invalid controls, and returns focus to the summary. |
| Use the experience on a narrow or keyboard-only viewport | Desktop and 320px layouts retain all sections; focus rings and the keyboard-revealed skip link are visible. |

## Finding and fix

| Severity | User task affected | Finding | Resolution | Re-review result |
| --- | --- | --- | --- | --- |
| High, fixed | Browse the initial result set | The author rule `.empty-state { display: flex; }` overrode the native `hidden` presentation, so the no-results message was visible while six sample cards were available. | Added `[hidden] { display: none !important; }` and a regression assertion for the initial and post-reset state. | Fresh Chromium screenshots show only the matching card grid initially; the browser test now passes all three interaction scenarios. |

## Re-review evidence

- Automated browser coverage: filtering/empty-reset, selected-pet form context,
  invalid and valid local submission, focus movement, visible keyboard focus,
  and 320px reflow all pass.
- Desktop screenshot: `design-demos/shots/pet-adoption-center-desktop.png`.
- Compact screenshot: `design-demos/shots/pet-adoption-center-mobile.png`.
- No unresolved hierarchy, copy-clarity, contrast, keyboard-order, or responsive
  defect was observed in this bounded static demo. Full browser acceptance is
  still recorded in the Verify phase rather than inferred from this build review.
