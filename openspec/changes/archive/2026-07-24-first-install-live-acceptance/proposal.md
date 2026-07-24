# Proposal: Repair live first-install dashboard registration

## Problem

A real first-installation run can start the dashboard before the first
`pipeline init`. The CLI then adds the project to the machine registry, but
the already-running dashboard has no trusted inode anchor for that new root.
The project appears in the read-only snapshot while workflow, track, hook and
configuration endpoints fail with HTTP 403. This prevents the promised
browser-first workflow creation path.

## Intended outcome

Allow a registered project that is first observed after dashboard startup to
become usable immediately, without weakening the root trust boundary. The
first successful observation captures a non-symlink inode anchor exactly once;
subsequent path replacement remains rejected.

## Scope

- Repair the server root-anchor lifecycle and cover the CLI-init-after-server
  scenario with an integration test.
- Re-run an isolated installation, dashboard, custom workflow, normal-chat and
  AFK acceptance journey with durable local evidence.

## Non-goals

- Trust arbitrary unregistered paths.
- Re-anchor a project whose existing anchor has failed validation.
- Change the default workflow phase semantics or bypass review gates.

## Acceptance signal

After a dashboard starts with no projects, `pipeline init` can register a
project and the browser can immediately create tracks and custom workflows;
the original inode anchor still rejects a later root path swap.
