# Research: Accessible, Deterministic Pet Adoption Interactions

**Change:** `pet-adoption-center`
**Research date:** 2026-07-24
**Question:** Which client-side interaction approach best delivers responsive
filtering and a local application form while preserving keyboard access,
truthful feedback, and deterministic browser QA?

## Verified Evidence

| Source | Verified fact | Design implication |
| --- | --- | --- |
| [WCAG 2.2 — Reflow](https://www.w3.org/TR/WCAG22/#reflow), accessed 2026-07-24 | Vertical content must work without two-dimensional scrolling at a 320 CSS-pixel equivalent width, except where two-dimensional layout is essential. | Test the ordinary page at a 320px-wide mobile viewport and avoid fixed-width filter/card layouts. |
| [W3C — Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible), accessed 2026-07-24 | Keyboard-operable UI needs a visible focus indicator. | Preserve native focus and add a clear `:focus-visible` outline for links, buttons, selects, and inputs. |
| [MDN — listbox role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/listbox_role), accessed 2026-07-24 | MDN recommends native `select`, radio, or checkbox controls when suitable because native elements provide complex keyboard interaction. | Use labeled single-value native selects for the filters instead of custom ARIA listboxes. |
| [W3C ARIA22 — `role=status`](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22), accessed 2026-07-24 | `role="status"` has an implicit polite live-region behavior for updated status information. | Put result-count and local-submission feedback in pre-existing concise status regions. |
| [MDN — Constraint Validation](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation), accessed 2026-07-24 | Semantic input types and attributes provide basic client-side constraints; `reportValidity()` exposes interactive validation. | Use native required/email constraints, then add only small custom error-summary/focus handling needed for the demo. |

## Alternatives Compared

| Alternative | Strengths | Risks | Recommendation |
| --- | --- | --- | --- |
| Native controls, native form semantics, small enhancement script | Browser-provided keyboard behavior; labels and constraints have direct semantics; compact and dependency-free | Select styling has browser variation | Choose |
| Custom ARIA listboxes and wholly scripted validation | Maximum visual control | Must recreate focus, key handling, selection, and announcement behavior; substantially more QA surface | Reject |
| Static visual filters and an inert application button | Fast to mock | Does not satisfy functional filtering, validation, or browser-interaction acceptance | Reject |

## Recommendation

Use semantic `<select>` controls inside a `<fieldset>` for filtering and a
native `<form>` for the local application panel. Update the cards and a short
`role="status"` result message in JavaScript. The app should block the default
submit only after successful local validation, then provide a clear statement
that no real application was sent. Use CSS/inline art rather than remote pet
photography so the visual state remains reproducible for browser tests.

## Interpretation and Scope Boundaries

- The cited sources establish accessible primitives and responsive expectations;
  they do not certify this specific page. Browser QA must still exercise the
  rendered implementation.
- Native controls are the appropriate trade-off here because the filter set is
  small and single-select. A future multi-select faceted search would need a
  fresh design decision.
- Server-side validation is intentionally out of scope because this demo does
  not submit data anywhere; the page must make that boundary visible to users.

## Remaining Unknowns and Follow-Up

- Assistive-technology announcements vary by browser and screen reader; this
  Change will verify status-region placement and keyboard behavior in the real
  browser, not claim a screen-reader matrix it did not run.
- Browser availability and local serving restrictions must be checked during
  verification; any limitation will be recorded rather than inferred away.
