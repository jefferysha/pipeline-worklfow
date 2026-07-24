# Applied spec receipt: interactive workflow routing

- Date: 2026-07-24
- Source:
  `openspec/changes/interactive-workflow-routing/specs/normal-chat-routing/spec.md`
- Target: `openspec/specs/normal-chat-routing/spec.md`
- Effect: added durable requirements for effective Track workflow preservation,
  selection-before-Change-creation, clean default routing, and fail-closed cache compatibility.
- Conflict resolution: none; the capability did not previously have a durable main spec.
- Verify correction: the applied requirement is backed by a regression for a built-in Track whose
  effective workflow is overridden to a non-default workflow.
