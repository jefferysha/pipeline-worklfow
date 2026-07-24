# Applied specification receipt: resilient plugin runtime

- Date: 2026-07-24
- Source: `openspec/changes/resilient-plugin-runtime/specs/plugin-runtime/spec.md`
- Target: `openspec/specs/plugin-runtime/spec.md`

## Applied effects

The durable main specification now owns the verified contracts for native host installation,
content-addressed managed releases, atomic active/previous selection, stable launcher and hook
bootstrap dispatch, exact recovery-only rollback authority, failure-visible automatic updates, and
new-intent routing that cannot revive an unrelated Change.

The target already matched the approved delta when Ship began, so application was idempotent.
Unrelated main-spec content was not changed and no conflict resolution was required.
