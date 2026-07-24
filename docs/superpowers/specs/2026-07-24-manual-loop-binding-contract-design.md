# Manual Loop Binding Contract

## Problem

The CLI parser accepts `--workflow` and `--skill-bundle`, but the manual-loop
assembly path discards both. The serializer and registry already support the
fields, so the data loss occurs entirely between argument parsing and
`NewLoopEntryInput`.

## Decision

Add optional `workflowId` and `skillBundleId` properties to the resolved raw
input. Always copy explicitly provided values into the new loop entry. Starter
metadata remains conditional on `--template`; explicit workflow/profile
bindings do not.

## Compatibility

- No flag supplied: preserve the current absent workflow field and unwired
  `skill_bundle_id` normalization.
- Starter supplied: preserve template id/version and the existing explicit
  override behavior.
- Manual bindings supplied: persist exactly the user-selected workflow/profile.

## Verification

Use a focused unit test for both parsed registry values and serialized YAML,
then run the built CLI against an isolated temporary repository.

## Simple Terminal Closure

Simple tasks deliberately omit the full Archive phase. Their declared edges
into `done` and `escalated` therefore carry `archive-run`. The generic
transition executor derives `phase_status=done` from that action, while the
action handler remains the owner of `archived` and `archived_at`. A downstream
default Change can then depend on the escalated audit Change without deadlock.
