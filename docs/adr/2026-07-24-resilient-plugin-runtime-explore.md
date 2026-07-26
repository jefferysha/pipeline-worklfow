# ADR: Runtime release manager is the host trust boundary

## Context

The plugin previously executed host hooks and the `pipeline` launcher directly from a mutable
marketplace checkout.  A failed update or malformed hook could therefore prevent the agent from
running the same command needed to repair the installation.  The project must remain a single,
host-selectable plugin with all bundled skills, normal-chat workflow routing, and automatic updates.

Tenon contract protects managed project files with hashes and backups, but its hooks execute project-local
scripts and its upgrade path does not use a local active-release pointer.  Tenon runtime is closer: it has
one workflow router, validates an npm candidate in a temporary prefix, attempts exact-version
rollback, and repairs hooks with `doctor`.  However, its host hook still directly executes the
mutable installed router and its router errors fail closed; a broken router can still block the
repair path.

## Decision

Add a managed runtime release layer between the host and plugin payload:

1. host manifests invoke one stable local `pipeline-hook` launcher;
2. the launcher invokes an independently stored bootstrap;
3. the bootstrap resolves an atomically selected, integrity-checked release;
4. release activation keeps a previous verified release and append-only audit evidence;
5. policy denials remain fail-closed, while runtime corruption enters a recovery-only state that
   permits only a fixed local rollback transaction;
6. the workflow router remains inside the selected release and owns exactly one explicitly bound
   current change.
7. setup and update launch the dashboard only from the selected immutable payload; they wait for
   the local global-health response before reporting it ready, and only interactive setup/manual
   update requests the OS browser open. Background automatic updates refresh the same service
   without opening a browser.

## Alternatives considered

### Continue direct marketplace execution with stronger `verify-skills`

Rejected.  A pre-install verifier reduces bad candidates but cannot prevent a host from invoking a
broken in-place payload after a partial replacement, nor does it retain an executable previous
release.

### Tenon contract-style project snapshot and direct hook repair

Rejected as the primary solution.  File-level backup is useful for project-managed content but
does not establish a stable host runtime boundary.  It cannot recover when the hook entry itself is
the defective object.

### Tenon runtime-style one router plus update-and-reinstall rollback

Rejected as the primary runtime boundary, adopted for workflow ownership and candidate validation.
One router resolves multiple guard competition, but a mutable router is still a single point of
bootstrap failure.  Reinstalling the old package after failure also leaves an avoidable mutation
window.

### Globally fail open when a hook errors

Rejected.  It would make a broken policy payload silently authorize ordinary project mutation.  A
runtime failure must remain visible and recovery-only, not become policy approval.

### Let setup run `open http://...` immediately after spawning a dashboard child

Rejected.  It races server startup, can point users at a failed or stale process, and makes a
marketplace checkout accidentally become an execution source.  The retained server's own
version-preemption protocol is the singleton authority; setup/update only launch the release
payload, prove `{ok:true, scope:"global"}` from `/api/health`, then optionally ask the platform to
open the one default endpoint (`127.0.0.1:18765`). The health response also carries the managed
payload digest when available, so a same-semver content release (or an explicit runtime rollback)
still replaces the correct server rather than falsely reusing stale code.

## Consequences

The plugin gains a small additional local runtime footprint and explicit release retention.  Setup
and update become transactions with more tests and migration behavior.  In exchange, host hooks no
longer depend on marketplace cache layout, a bad candidate cannot replace a healthy active release,
and recovery has a narrowly defined, auditable authority rather than a broad bypass. The dashboard
also gains a deterministic first-install path: an interactive setup can open it only after its
health check, while automatic updates stay non-disruptive.
