# Applied Spec Receipt

Date: 2026-07-24

## Source

- `openspec/changes/manual-loop-binding-contract/specs/automation-loop-init/spec.md`

## Target

- `openspec/specs/automation-loop-init/spec.md`

## Applied effects

- Preserve explicit manual Workflow and skill-profile bindings without starter
  metadata.
- Keep starter metadata independent from binding persistence.
- Close both built-in `simple` terminal branches canonically.
- Require active canonical dependency state to take precedence over historical
  physical archives.

The delta had already been incrementally applied before final Verify. Ship
re-read both files and confirmed the operation is idempotent with no conflict
or unrelated main-spec modification.
