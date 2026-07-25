# Frontend design and taste review

Change: `open-source-docs-solution-site`  
Surface: bundled Dashboard `?view=overview`  
Review skills: `frontend-design`, `web-design-guidelines`,
`design-taste-frontend`, `hallmark`

## Round 1 — implemented page review

Evidence reviewed:

- production Vite bundle served by the current server at
  `http://127.0.0.1:18765/?view=overview`;
- DOM/accessibility snapshot;
- desktop dark screenshot;
- 390×844 and 320×568 responsive checks;
- source tokens and generated CSS;
- focused solution, Nav, App, location, and i18n tests.

Findings:

| Severity | Finding | User impact | Resolution |
| --- | --- | --- | --- |
| High | Solution copy used `text-muted`, which maps to the muted **background** token, not the muted foreground token. Dark-mode body copy rendered close to the page background. | Core value, mode, evidence, install, and safety descriptions were difficult to read. | Replaced all solution copy uses with `text-muted-foreground`, rebuilt, reloaded the production bundle, and inspected computed color (`rgb(143, 154, 173)` in dark; `rgb(95, 107, 128)` in light). |
| Medium | Workflow return notes and the AFK prerequisite notice used an undefined `bg-subtle` utility. | Intended grouping lacked a stable theme surface and relied on an ungenerated class. | Replaced with the existing `bg-fill` design token. |
| Low | The page is intentionally information-dense. | Long vertical reading path on mobile. | Kept progressive section numbering, single-column reflow, short paragraphs, and canonical docs links rather than duplicating manual detail. No new accordion/state was justified. |

## Round 2 — post-fix review

- Information hierarchy is clear: one outcome-oriented hero, trust strip, then
  Route → Govern → Prove → Operate → Install → Trust → Community.
- The page uses the existing neutral surfaces and blue structural accent; green
  remains the primary action/success color. There is no decorative gradient,
  fake metric, generic AI illustration, or remote asset.
- All secondary text now uses a real foreground token in both themes.
- The five operational rail items remain unchanged; Overview is a separate
  brand-level destination with an accessible name and current-page state.
- 390×844 and 320×568 have no document-level horizontal overflow.
- Chinese and English render without raw translation keys.
- One `h1`, ordered section headings, native links/buttons, safe new-tab
  attributes, visible focus contracts, and text equivalents are present.
- Reduced-motion media emulation leaves all content available.
- Browser console contains no warnings or errors for the exercised path.

Final result: **no unresolved high or critical design/taste issue**.

## Round 3 — independent Verify challenge

The first frozen Verify baseline was rejected. Independent review found that:

- the route model incorrectly placed research in Discussion;
- the Overview claimed zero requests although the shell keeps its local
  snapshot/SSE connection;
- setup copy overstated a single write location and the Simple shape omitted
  its escalation exit;
- visible section labels bypassed i18n and link transitions lacked an explicit
  reduced-motion fallback;
- 320 px exposed a grid/button min-content overflow;
- English did not update the document language;
- the light primary CTA measured 3.30:1;
- trust-card `h3` elements appeared before the first section `h2`.

## Round 4 — corrected implementation

- Product copy now follows the router, setup, and Simple Workflow source
  contracts. The Overview states that it does not write project state rather
  than claiming the complete shell makes no requests.
- All seven section eyebrows are localized; every Overview link declares
  `motion-reduce:transition-none`.
- Narrow grids use zero-minimum single-column tracks, hero children and actions
  can shrink, and a real 320×568 browser pass reports
  `scrollWidth === innerWidth === 320`.
- The language provider synchronizes `document.documentElement.lang`; browser
  switching observed `en` and `zh` with no raw keys.
- The CTA uses the theme-aware hover token as its solid surface: 5.02:1 in the
  light theme and dark foreground on the lighter dark-theme surface.
- Trust labels are no longer headings. The page outline now starts `h1 → h2`
  before section-card `h3` elements.
- Focused App and Solution tests pass (40/40), type checking passes, the
  production bundle was rebuilt, brand navigation works at 1440 px, and the
  browser console is empty.

Final result after the corrective review: **no unresolved high or critical
design/taste issue**.

## Round 5 — final narrow-screen and motion correction

- An independent 320 px pass showed that the document itself no longer
  overflowed, but the long hero badge still kept its one-line min-content width
  and was clipped by the root overflow boundary.
- Codex review also found that the brand-level Overview button had not received
  the same reduced-motion override as the page links.
- The badge now overrides the shared Badge defaults with `max-w-full`,
  shrinkable width, normal wrapping, centered text, and a stable compact line
  height. In the production page at 320×568 its rectangle is now
  `left=91`, `right=285`, `width=194`.
- The brand button now has `motion-reduce:transition-none`. With Chrome media
  emulation set to `prefers-reduced-motion: reduce`, both the brand control and
  Overview link compute `transition-property: none`.
- Focused Nav and Solution tests pass (29/29), type checking passes, the
  production bundle was rebuilt, and the 320 px document width remains exactly
  320 px.

Final result after the third corrective review: **no unresolved high or
critical design/taste issue**.

## Round 6 — view-memory contract

- Final Codex review found that entering Overview wrote `overview` to the same
  local-storage key used for operational view restoration, while startup
  intentionally accepts only the five operational views.
- The brand Overview is now ephemeral in view memory: `setView` persists only
  members of `PRIMARY_VIEWS`. Entering Overview preserves the last operational
  destination, so a later base-URL launch resumes real work instead of
  pretending Overview is an operational rail view.
- The App regression test enters Projects, opens Overview, and proves the
  stored operational value remains `projects`.
- Focused App/Nav/Solution tests pass (64/64), type checking passes, and the
  change does not alter the five-item rail or URL deep-link contract.

Final result after the fourth corrective review: **no unresolved high or
critical design/taste issue**.
