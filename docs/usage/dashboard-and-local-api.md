# Dashboard and local API

## Goal

Run the one production Dashboard, understand its views and status labels, and
use the local API within its security boundary.

## Prerequisites

- a verified managed release
- a supported local browser
- at least one project for operational views; the bundled Overview remains
  readable without one

## Start the Dashboard

```bash
pipeline dashboard --open
```

`--open` implies a managed background start and waits for a compatible health
response before opening the browser.

Other supported forms:

```bash
pipeline dashboard
pipeline dashboard --background
pipeline dashboard --port 19765 --open
pipeline dashboard --dry-run
```

The default production entry is:

```text
http://127.0.0.1:18765/
```

One server owns the built SPA and `/api/*` on the same origin. Vite's separate
development port is not a second production frontend.

## Views

The five operational destinations are:

- Projects — registered local roots and project selection
- Progress — Workflow graph, phase, Todo, history, and evidence
- AFK — readiness, queue, worker state, logs, and control
- Workbench — Workflows, Tracks, hooks, automation, loops, and configuration
- Machine — runtime identity, traffic, and advanced diagnostics

The product Overview at `/?view=overview` is a separate brand-level read-only
view, not a sixth operational destination and not the installed default.

Optional surfaces are advertised by snapshot capability flags. A disabled
capability is not an empty success state.

## Status semantics

| State | Meaning | First check |
| --- | --- | --- |
| Running | An active host session or AFK worker owns current work | inspect run/worker details and recent activity |
| Waiting | A review, user interaction, queue admission, or gate is pending | inspect exact pending interaction and Change phase |
| Queued | AFK work is admitted but no worker is currently running it | inspect AFK readiness and queue |
| Blocked/failed | A guard, verification, worker, or operation failed | read the recorded reason before changing state |
| Complete/archived | The Workflow reached its terminal delivery/archive state | inspect final evidence |

“Waiting” is not a synonym for “broken.” The UI must not infer running merely
from an unfinished Todo.

## Read-only diagnostics

```bash
pipeline status <change-name> --json
pipeline document status <change-name> --json
pipeline afk status <change-name> --json
pipeline doctor --json
```

HTTP checks:

```bash
curl --fail http://127.0.0.1:18765/api/health
curl --fail http://127.0.0.1:18765/api/snapshot
```

Health includes release and state-scope identity. A process merely listening on
18765 is not enough to prove it is the correct Dashboard.

## Local API

The loopback API exposes current health/snapshot/SSE plus local operations for
projects, Changes/runs, Workflows, Tracks, hooks, automation, loops, AFK,
configuration, and diagnostics.

Mutation requests require:

- loopback/local Host validation;
- the random Dashboard handshake token;
- JSON content type;
- a bounded request body;
- a trusted registered project root where filesystem access is involved.

Use the same-origin Dashboard for ordinary mutations. The API is a local
integration surface, not a public hosted or multi-tenant API, and no independent
long-term API version promise is made here.

## Expected result

The health endpoint identifies the active managed release/state scope, the SPA
loads from the same origin, and Progress uses the Change's effective Workflow
steps.

## Verification

```bash
pipeline dashboard --dry-run
curl --fail http://127.0.0.1:18765/api/health
```

In the browser, confirm that default, simple, free, and custom Changes show their
own step shapes rather than one hard-coded Todo.

## Common failures

### Port is occupied

Run the health check first. A compatible managed instance may be reused; an old
managed release may be preempted. For an intentional alternate port:

```bash
pipeline dashboard --port 19765 --open
```

### Vite loads but writes return 401

The development server does not own the production token handshake. Use the
packaged `pipeline dashboard`.

### UI is waiting forever

Inspect review/interaction markers, current phase, host-session activity, and
AFK status. Do not delete markers or edit canonical state by hand.

## Next action

Read [troubleshooting](troubleshooting.md) or
[security model](security-model.md).

