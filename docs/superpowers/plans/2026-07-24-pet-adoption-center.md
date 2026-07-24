---
change: pet-adoption-center
design-doc: docs/superpowers/specs/2026-07-24-pet-adoption-center-design.md
---

# Implementation Plan: Pet Adoption Center

## Goal

Deliver a dependency-free, locally served pet-adoption center demo with
functional filtering, a transparent local application path, responsive layout,
and real-browser acceptance evidence.

## Compatibility and Rollout

- Add a new design-demo entry point and its local CSS/JavaScript companions;
  do not alter the dashboard, package manifest, server, or public API.
- Link the new entry point from the existing `design-demos/index.html` so it is
  discoverable without changing existing demo routes.
- The change is reversible by removing the four new co-located demo/test assets and its
  index link; it has no migration, persisted state, network request, or rollout
  coordination requirement.

## Controlled Plan Revision

The initial test path would have introduced a new top-level `tests/` directory
that does not match this repository's existing colocated design-demo pattern.
The browser regression test will instead live beside the page at
`design-demos/pet-adoption-center.test.mjs`. This is a file-placement
correction only: the feature scope, OpenSpec requirements, accessibility
contract, and verification command remain unchanged.

## Build Stage 1 — Tracer Bullet: Render, Filter, and Start an Application

**Files:**

- Create `design-demos/pet-adoption-center.html`
- Create `design-demos/pet-adoption-center.css`
- Create `design-demos/pet-adoption-center.js`
- Create `design-demos/pet-adoption-center.test.mjs`

1. Write the initially failing Playwright-driven test for the initial cards,
   a species filter, and the filter result status; serve `design-demos/` from
   a local HTTP server inside the test.
2. Build semantic page landmarks, a concise welcome region, a properly labeled
   filter fieldset, a pet-results section, and the three-step adoption process.
3. Define a deterministic in-memory sample data set with enough distinct pet
   combinations to prove normal, filtered, and empty-result states.
4. Render cards using semantic articles, concise matching details, meaningful
   CSS/inline visual treatments, and one per-card application action.
5. Implement native-select filtering, a result-count `role="status"` region,
   an empty state, and a reset action that restores values and focuses the
   filtering context.

**Expected behavior:** Initial results render without a network request;
species/age/home-energy filters compose; an unmatched combination shows a
recoverable empty state; an application action scrolls/focuses the form with
the pet name selected.

**Verification:** `node --test design-demos/pet-adoption-center.test.mjs`.

**Context boundary:** Stage 1 ends with the first vertical interaction slice.
**Suggested session reset:** `/clear` before Stage 2.

## Build Stage 2 — Complete the Local Application and Responsive Experience

**Files:**

- Modify `design-demos/pet-adoption-center.html`
- Modify `design-demos/pet-adoption-center.css`
- Modify `design-demos/pet-adoption-center.js`
- Modify `design-demos/pet-adoption-center.test.mjs`

1. Add a labeled application form with `required` and `email` constraints, a
   non-network submit handler, an error-summary/focus-recovery path, and a
   local-only success acknowledgement.
2. Style compact-first layout, 320px reflow, progressively larger card grids,
   touch-friendly controls, high-contrast focus rings, and reduced-motion
   behavior.
3. Check that no visual status is communicated only by color, that all actions
   remain reachable by keyboard, and that the local-only boundary is visible in
   the form and success text.

**Expected behavior:** An incomplete submit reports a recoverable error; a
valid submit stays on the page and announces that nothing was sent to a real
shelter; compact and desktop layouts keep the requested sections reachable.

**Verification:** `node --test design-demos/pet-adoption-center.test.mjs`.

**Context boundary:** Stage 2 completes implementation without browser
acceptance sign-off. **Suggested session reset:** `/clear` before Stage 3.

## Build Stage 3 — Automated Browser Regression Coverage

**Files:**

- Modify `design-demos/pet-adoption-center.test.mjs`
- Modify `design-demos/index.html`

1. Expand the Node/Playwright test to cover combined filters, no-results/reset,
   selected-pet context, invalid form handling, valid local acknowledgement,
   keyboard focus visibility, and compact-viewport document width.
2. Add a small entry-point link in the design-demo index without altering
   existing links or their labels.

**Expected behavior:** Regression checks exercise public DOM behavior rather
than private JavaScript state and fail if the application attempts navigation
or loses essential interaction paths.

**Verification:** `node --test design-demos/pet-adoption-center.test.mjs`.

## Verify Stage — Real Browser Acceptance and Evidence

1. Run the automated browser suite and use an actual Chromium instance to
   inspect desktop and compact mobile viewports.
2. Capture deterministic screenshots under `design-demos/shots/` only if the
   browser run succeeds and the images contain no sensitive data.
3. Inspect keyboard navigation, filtering/no-results/reset, selected-pet
   application, invalid form, valid local acknowledgement, and ordinary
   horizontal overflow at compact width.
4. Record commands, environment, observations, screenshot paths, and any
   limitation in the verification report; do not call constrained/data-URL
   evidence a full browser acceptance if local HTTP execution is unavailable.

## Prototype Decision

No separate prototype step is planned. The custom workflow does not declare
the `prototype` skill, and research established that native select/form
behaviour is already well-defined and available. The tracer bullet supplies
the only needed integration proof before the full visual treatment is added.
