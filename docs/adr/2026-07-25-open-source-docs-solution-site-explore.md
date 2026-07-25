# ADR: Layer open-source documentation around a bundled Dashboard overview

Status: Accepted for specification  
Date: 2026-07-25  
Change: `open-source-docs-solution-site`

## Context

The repository has a capable but internally oriented 248-line README, dated
engineering documents, and a single local React Dashboard served with its API
at `127.0.0.1:18765`. The README contains stale Dashboard descriptions and does
not provide a task-oriented adoption path, complete module/tutorial index, or
standard community entry points.

The requested open-source solution page could be built as another site, another
route model, or a view inside the Dashboard. Only the last option preserves the
current single-runtime contract without adding a hosting/publication decision.

## Decision

Create a three-layer documentation experience:

1. English-first `README.md` plus `README.zh-CN.md` as the concise repository
   entry;
2. canonical task-oriented guides under `docs/usage/`;
3. bilingual `?view=overview` inside the existing Dashboard bundle.

Add `overview` to the application view and query allowlist, not to the five-item
operational rail. Convert the brand mark into the overview entry. Render the
view independently of project/snapshot state and before onboarding gates.
Preserve Progress as the default.

Use Pipeline Lite as the product name while retaining the real
`jefferysha/pipeline-worklfow` repository slug and existing package IDs in
commands and links. Describe plugin and workspace versions separately until
their release versions are intentionally unified.

Add maintainable contribution, conduct, security, and support files. Do not
invent a release cadence, SLA, npm publication, hosted docs URL, public API
stability policy, or equal adapter guarantees.

## Alternatives

### Separate public documentation site

Rejected for this Change. It requires a new frontend/deployment/publication
boundary and creates another copy of product facts. It remains the correct
future option if public SEO and pre-install discovery become explicit goals.

### Pathname-routed landing and app

Rejected. The existing server's SPA fallback, token injection, deep links, and
installed default would all change for no user-facing capability unavailable
through query routing.

### Add Overview as a sixth rail view

Rejected. It mixes product orientation with operational workflow controls and
weakens the current five-view information architecture.

### Keep all material in the README

Rejected. A monolithic README makes first-use conversion and complete
operational reference compete for the same space and increases drift.

## Consequences

Positive:

- new users have a short path from evaluation to first governed task;
- every public module and tutorial has a canonical home;
- installed users get a polished overview without a second port or dependency;
- zero-project and offline users can still understand and install the product;
- README, guides, and page can share a source-backed claim discipline;
- current navigation, local security, and runtime boundaries remain intact.

Costs:

- English and Chinese README structures must be maintained together;
- the translation dictionary grows with bounded product-overview copy;
- tests and browser acceptance must cover a new view across language, theme,
  viewport, and no-project states;
- future public hosting will still require an explicit site/deployment design.

Risks are controlled through focused documentation checks, source-backed
claims, no new dependencies or remote assets, and full production-bundle
browser verification on port 18765.

