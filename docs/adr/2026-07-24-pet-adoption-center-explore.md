# ADR: Deliver the Pet Adoption Center as a Self-Contained Demo

**Status:** Accepted under the active Change's continuous authorization

## Context

The requested experience is an HTML pet-adoption page with meaningful client
interactions and real-browser acceptance. The existing repository includes a
`design-demos/` collection of standalone prototypes, while the production
dashboard is a separate React application with workflow-specific concerns.

## Decision

Create `design-demos/pet-adoption-center.html` as a self-contained, local-only
HTML/CSS/JavaScript demo. Use a small in-page sample data set, deterministic
CSS/inline illustrations, native form controls, and a non-persistent local
application acknowledgement.

## Alternatives Considered

- **Production dashboard route:** rejected because it would extend a focused
  UI demo into dashboard routing, i18n, component, and API concerns.
- **Pure static poster:** rejected because filters, application feedback, and
  keyboard interaction would not be demonstrably functional.
- **Remote pet photography:** rejected because it introduces network-dependent
  rendering and makes local browser acceptance less deterministic.

## Consequences

- The page can be inspected and served independently of the dashboard build.
- All visible animals and application outcomes must be clearly presented as
  sample content.
- Browser QA can test the complete requested interaction surface without
  secrets, network writes, or external service setup.
