# Pet Adoption Center: Explore Design

**Status:** Decision-ready under the Change-specific continuous authorization
for `pet-adoption-center`.

## User Outcome

Visitors should be able to scan available companion animals, narrow the list
without friction, understand the adoption journey, and begin a clearly local
application experience. The page needs to feel warm and credible while staying
truthful about its sample-only data.

## Constraints and Non-Goals

- Deliver a standalone HTML, CSS, and JavaScript demo rather than alter the
  production dashboard.
- Include pet cards, filter controls, adoption steps, and an application
  action; work at compact and desktop widths.
- Build semantics, keyboard access, visible focus, motion reduction, and
  status feedback into the primary experience.
- Do not add dependencies, APIs, data persistence, accounts, real submissions,
  or claims of live animal availability.

## Local Evidence

`design-demos/` is the repository's established home for self-contained HTML
prototypes. The root development dependencies already include Playwright, so
the demo can be browser-tested without changing the dependency graph.

## Approaches Considered

| Approach | Benefits | Trade-offs | Decision |
| --- | --- | --- | --- |
| Self-contained interactive HTML demo | Matches the request and local demo convention; deterministic; simple to serve and verify | Sample data is intentionally local-only | Chosen |
| Add a React route to the production dashboard | Reuses app shell and existing UI primitives | Broadens scope, ties a demo to product workflow state, and needs API/i18n work | Rejected |
| Static visual mockup with inert controls | Lowest code volume | Fails the filtering, application, keyboard, and browser-interaction requirements | Rejected |

## Decision

Add `design-demos/pet-adoption-center.html` as a dependency-free, self-contained
experience. It will include a local pet data set and small progressive
enhancement script. The visual treatment will use deterministic CSS and inline
illustrative shapes instead of external image requests, ensuring that the
content remains stable during local browser QA.

## Information Architecture

1. **Welcome / mission:** concise purpose statement and a primary jump to the
   adoptable-pet results.
2. **Find a companion:** labeled filters with a results count and reset action.
3. **Meet the animals:** a responsive grid of sample pet cards, each with
   temperament, age, compatibility information, and an application action.
4. **How it works:** three plain-language adoption steps that set expectations.
5. **Apply with confidence:** a local application panel that explains the
   sample nature of the experience and acknowledges a completed local form.

## Client State Model

| State | Source | Behaviour |
| --- | --- | --- |
| Filter values | Native select controls | Recompute matching cards and result count on each change. |
| Empty result | Derived from filtered list | Hide the card grid and expose an explanatory, resettable empty state. |
| Selected pet | Application button dataset | Pre-fill the local form heading with the chosen pet name. |
| Local acknowledgement | Form submit event | Prevent navigation, reveal a truthful confirmation, and focus it for keyboard users. |

## Interaction Rules

- Species, age, and home-energy filters must work independently and together.
- Result status must communicate both count and current filtering context via
  a concise polite live region.
- Reset must restore all filters and return focus to the first filter label.
- Each pet card has one unambiguous action: start a local application for that
  pet. A general action should remain available when no pet is selected.
- The local form must use labels, required-field validation, an error summary,
  and no network request. The acknowledgement must explicitly say that no
  application was submitted to a real shelter.

## Responsive and Visual Direction

The visual language should be inviting rather than clinical: warm parchment,
deep ink, leafy green, clay, and small coral accents; rounded but not overly
pill-like surfaces; a confident editorial heading paired with a highly legible
system body font. Start in one column, move filters to a comfortable grid, and
let pet cards expand from one to two and then three columns. Interactive
targets must remain comfortably touch-sized, and decorative motion must stop
when reduced motion is requested.

## Accessibility Requirements

- Use `header`, `nav`, `main`, `section`, `form`, `fieldset`, `legend`, and
  heading hierarchy before adding ARIA.
- Give every form control a visible label and every visual pet treatment an
  equivalent concise text alternative where it conveys identity.
- Preserve keyboard order, visible `:focus-visible` treatment, adequate color
  contrast, and target sizes.
- Use `aria-live` only for result and local-submission feedback; do not turn
  static card content into noisy announcements.
- Let native controls and native constraint validation handle basic semantics;
  supplement them with explicit inline errors and focus recovery where useful.

## Validation Plan

- Exercise filtering, no-results/reset, selected-pet application, validation
  error, and local-success paths with automated browser checks.
- Inspect the page at a compact mobile viewport and a wide desktop viewport in
  a real browser, including keyboard navigation and screenshot evidence.
- Check the generated document for semantic landmarks, associated labels,
  visible status feedback, and absence of external submission requests.

## Domain Language

- **Adoptable pet:** a sample animal card available for exploration only.
- **Filter:** a visitor-controlled criterion that narrows displayed sample
  pets.
- **Local application:** a non-persistent demonstration form that never sends
  data to a shelter.
- **Match result:** the current list of sample pets after all selected filters
  apply.

## Assumptions and Decision Log

- The user's request explicitly asks for an HTML page, so a standalone demo is
  the smallest correct delivery boundary.
- The user's continuous authorization permits this low-risk presentation and
  interaction choice; the document records it instead of implying a separate
  user design approval.
- No unresolved scope, security, cost, or external-publication decision
  remains. Browser verification is the remaining evidence gate.

## Documentation Challenge Review

| Assumption challenged | Owner and evidence | If false | Resolution captured in |
| --- | --- | --- | --- |
| A local demo is the right delivery boundary | User requested an HTML page; `design-demos/` already hosts standalone prototypes | The task becomes product routing/API work outside this Change | ADR Decision and proposal Explore Conclusions |
| The application action must not send real data | The request asks for an application button, not real intake; the OpenSpec non-goals exclude submission | Privacy, data ownership, validation, and server requirements must be designed separately | Delta requirement for truthful local application |
| Native controls are sufficient for the filter set | Research cites native-control keyboard behaviour; the filters are small, single-select criteria | A future faceted/multi-select search would need a new interaction design and test matrix | Research recommendation and client-state model |
| Deterministic illustration is preferable to remote photography | Browser QA must work from local HTTP without image-service availability | Image loading, licensing, failure handling, and responsive asset delivery become new scope | ADR Alternatives and visual direction |
| Playwright can support browser acceptance | The workspace declares Playwright, but browser availability is not yet proven | Verification must record the blocker and cannot claim complete real-browser acceptance | Verification plan and research follow-up |
| The browser test should stay with the design demo | The repository uses a `design-demos/` artifact surface and has no existing root test area for these static pages | A new top-level path would need unrelated repository-structure governance | Controlled plan revision and co-located test path |

```coverage
touches:
L1_api:      waived -> no HTTP or public API is added
L2_data:     waived -> in-memory sample cards only; no persisted data or schema
L3_rules:    filled -> #interaction-rules
L4_state:    filled -> #client-state-model
L5_errors:   filled -> #interaction-rules
L6_security: waived -> no network submission, authentication, persistence, or secrets
L7_perf:     waived -> bounded local sample list with no unbounded background work
L8_deps:     waived -> no dependency or package-manifest change
L10_terms:   filled -> #domain-language
```
