# Proposal: Resilient plugin runtime

## Problem

`pipeline-lite` currently lets host hooks and the user-facing `pipeline` launcher resolve
directly into a mutable marketplace checkout.  A partially installed or syntactically invalid
hook can therefore run before the CLI has an opportunity to diagnose it, leaving the agent
unable to perform its own repair.  The current update path verifies the newly discovered
checkout before refreshing `~/.local/bin/pipeline`, but it does not retain a verified runtime
release, atomically select one, or give the host hook a stable dispatch boundary.

The same change must also prevent a normal new request from inheriting an unrelated active
OpenSpec change.  The current router work is intended to improve that behavior, but the durable
runtime design needs one unambiguous workflow owner rather than an mtime-based recovery guess.

## Goal

Ship one self-contained `pipeline-lite` plugin that users install explicitly with
`pipeline setup --codex` or `pipeline setup --claude`.  The selected host receives all bundled
skills and hooks, while a separately managed local runtime selects only a fully verified release.
Updates must stage and validate a candidate before an atomic activation, retain a last-known-good
release, and expose a narrowly scoped recovery transaction that cannot bypass OpenSpec, Skill,
review, or human-confirmation policy.

## Scope

- Introduce a small, host-independent runtime manager that owns platform-standard state, release
  storage, active/previous selection, integrity metadata, and audit records.
- Replace direct host-hook execution of a mutable plugin checkout with a stable dispatcher that
  resolves the active verified release.
- Stage native-host marketplace candidates as content-addressed releases; validate required
  bundles, bundled skills, manifests, shell hooks, and a host-hook smoke path before activation.
- Atomically publish active selection and retain the previous verified release for deterministic
  rollback.
- Make runtime degradation recovery-only: normal project mutations remain denied; the dispatcher
  may run only a fixed local rollback/repair transaction against verified releases.
- Preserve the single-plugin distribution model, explicit `--codex` / `--claude` host selection,
  bundled-skill installation, and opt-in automatic updates.
- Define a deterministic current-workflow owner contract so a new normal-chat request cannot
  silently resume an unrelated change.
- Add compatibility, migration, package, hook, and failure-injection tests; update installation,
  update, recovery, and architecture documentation.

## Non-goals

- Removing optional or bundled pipeline skills, splitting the plugin into external packages, or
  changing the OpenSpec seven-phase protocol.
- Bypassing review markers, Skill evidence, OpenSpec document receipts, or host trust prompts.
- Silently deleting existing user configuration, active releases, project state, or marketplace
  installations.
- Adding a remote service, database, package manager, or a second marketplace dependency.

## Acceptance signals

1. A clean user can choose exactly one native host and receive the complete packaged pipeline
   (CLI, skills, hooks, dashboard assets, and update capability) without a source build.
2. A malformed or incomplete candidate release never becomes active; the previous active release
   continues to serve hooks and the `pipeline` launcher.
3. An invalid active release causes a visible degraded diagnostic and permits only the
   integrity-checked local recovery transaction; it cannot approve arbitrary writes or erase
   workflow gates.
4. A failed marketplace update leaves the active release pointer and launcher usable, with an
   auditable failure record.
5. A fresh normal-chat objective creates a new change unless the user explicitly asks to resume a
   named matching change; stale active state is never inferred by modification time.
6. The implementation passes targeted concurrency/failure tests plus the repository hook,
   adapter, skill, bundle, workflow, and build gates.
