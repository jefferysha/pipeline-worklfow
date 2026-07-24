# ADR: one complete plugin with explicit host ownership

- Status: accepted
- Date: 2026-07-24
- Change: `single-plugin-host-install-updates`

## Context

The former installation model mixed multiple host setup paths, project-local links, mutable
marketplace roots, and mandatory skills sourced outside the plugin. That could leave a new user
with only part of the pipeline, accidentally configure more than one host, or execute a checkout
that changed independently of the selected runtime.

At the same time, dashboard, AFK, tap, channel, and non-native adapters are real Pipeline Lite
capabilities. Host selection must not be confused with pruning those modules.

## Decision

Ship one complete plugin payload and require exactly one host selector for every setup/update
operation. Codex and Claude use their own native marketplace inventory and update mechanism.
Registered non-native hosts use their existing adapter installation contract and cannot claim
native automatic update support.

For native hosts, treat the installed checkout as a candidate and atomically publish a verified,
content-addressed local runtime. Stable `pipeline` and `pipeline-hook` launchers dispatch only to
that selected immutable release. Mandatory default-workflow skills are first-party files in the
same release.

Automatic updates are opt-in, host-scoped, daily bounded, failure-visible, and effective in a new
session. Runtime corruption permits only exact verified rollback through the stable launcher.

## Alternatives

### Keep mutable marketplace roots as the runtime

Rejected because cache replacement can change hook/CLI behavior between invocations and makes
rollback/audit unreliable.

### Install CLI, hooks, skills, and dashboard as separate packages

Rejected because independent versions create split-brain behavior and violate the clean-user
requirement that one installation yields the complete pipeline.

### Auto-detect and configure every installed host

Rejected because it produces surprising cross-host mutations and makes update ownership ambiguous.

### Remove non-selected adapters and product subsystems

Rejected because selection is an installation concern, not a product-capability deletion policy.

## Consequences

- A release is larger but internally coherent and reproducible.
- Setup and update need a managed release store, deterministic validation, stable launchers, and
  platform-standard application directories.
- Codex users still perform the host's explicit local hook-trust step.
- New skills/hooks are observed in a new session rather than hot-swapped into a running one.
- Failure paths preserve the active release and become visible in runtime status/doctor.
- The default seven-phase OpenSpec evidence chain remains mandatory and digest-bound.
