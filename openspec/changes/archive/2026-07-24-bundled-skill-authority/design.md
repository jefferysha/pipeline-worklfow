# Design

Split source selection into explicit trust tiers:

1. selected release bundle;
2. runner-native external roots;
3. compatible fallback roots where the runner policy allows them.

Each tier retains content-hash deduplication and fail-loud ambiguity checks.
Resolution advances to a lower tier only for `SkillContentNotFoundError`.
Access, schema, invalid-content, and ambiguity errors never fall through.

Explore must confirm that both runner-aware and compatibility production
locators share this contract without changing the low-level filesystem
locator's source-neutral semantics.

The selected approach is documented in
`docs/adr/2026-07-24-bundled-skill-authority.md`.

> TODO(open): Capture the initial architecture or interaction hypothesis. Explore will replace this scaffold with evidence and decisions.
