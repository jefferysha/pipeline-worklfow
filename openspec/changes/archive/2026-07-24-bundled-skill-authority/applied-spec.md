# Applied Spec Receipt

- Change: `bundled-skill-authority`
- Applied on: 2026-07-24
- Source:
  `openspec/changes/bundled-skill-authority/specs/skill-content-resolution/spec.md`
- Target: `openspec/specs/skill-content-resolution/spec.md`

## Effects

- Added selected-release-bundle authority as the first trust tier.
- Required lower-tier descent to occur only after
  `SkillContentNotFoundError`.
- Preserved fail-loud ambiguity within each external trust tier.

The target main spec already contained the verified delta from the Verify
instant-application gate. Ship re-read both files and found no conflict; the
operation was therefore an idempotent no-op.
