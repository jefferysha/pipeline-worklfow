# Proposal

## Intent

`pipeline loops init` accepts `--workflow` and `--skill-bundle` for both starter and
manual loops, but manual initialization currently drops both explicit bindings.
This leaves the loop paused and unwired while returning success, and later AFK
admission rejects the change.

## Scope

- Preserve explicit manual `workflow_id` and `skill_bundle_id` bindings.
- Keep omitted bindings absent/unwired for backward compatibility.
- Add CLI regression coverage for the persisted YAML and parsed registry.
- Close `simple` workflow terminal branches so completed/escalated changes stop
  appearing active and can satisfy downstream `depends_on` guards.
- Do not change activation policy, runner behavior, or AFK admission rules.

## Acceptance

A manual `loops init --workflow default --skill-bundle pm` invocation exits zero
and produces a loop whose registry entry contains both bindings.
Both `simple` terminal paths also set the canonical run to done/archived.
