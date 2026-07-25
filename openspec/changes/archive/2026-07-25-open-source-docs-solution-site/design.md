# Explored design

The selected product surface is a layered documentation system:

1. `README.md` acts as the open-source landing page and five-minute quickstart.
2. `docs/` provides task-oriented guides and reference material.
3. The existing React dashboard gains a dedicated `overview` experience at
   `/?view=overview` that explains the workflow model visually and links users
   into the guides.

The root README is English-first and has a complete `README.zh-CN.md`
counterpart. Canonical task guides live under `docs/usage/`. The in-product
overview remains bilingual through the existing i18n system.

The overview is a read-only feature domain under
`packages/dashboard-app/src/solution/`. It does not import API or snapshot
state, renders before onboarding/project gates, and is entered through an
accessible brand button. `overview` is a valid `View` but not a `RailView`, so
the five operational navigation items and the default Progress destination
remain stable.

Public claims are limited to the product-truth research and current CLI,
manifest, adapter registry, source, contracts, and tests. The page and docs
must distinguish discussion, simple, default, free, and custom execution; host
fidelity tiers; the default evidence chain; and contract-driven short Workflow
documents.

Primary risks:

- Documentation drifting from CLI behavior.
- Marketing language overstating verified capabilities.
- Duplicating content between README, guides, and the web experience.
- Adding a visually attractive page that does not fit existing navigation,
  accessibility, responsive, or localization constraints.

Mitigations:

- add focused command/link/model checks instead of hard-coded test counts;
- add Nav/location/App/i18n/component tests and production-bundle browser QA;
- add no dependency, remote asset, router, API, persistence, or new port;
- add only maintainable contribution, conduct, security, and support files;
- keep public deployment and release publication outside this Change.

The complete design and trade-offs are recorded in
`docs/superpowers/specs/2026-07-25-open-source-docs-solution-site-design.md`.
