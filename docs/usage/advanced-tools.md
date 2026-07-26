# Advanced tools: Channel, memory, and Tap

## Goal

Use optional compatibility and diagnostics tools without confusing them with
canonical Workflow state or exposing sensitive local data.

## Prerequisites

- a clear diagnostic/worker-communication purpose
- local filesystem access to the relevant sessions or channel
- explicit approval and a controlled environment before Tap interception

## Channel

Channel is an event-sourced worker communication bus. It is orthogonal to the
Tenon state machine: it does not change barriers, review gates, `build_sha`,
Git state, or canonical Change fields.

Discover commands:

```bash
tenon channel help
```

Basic local flow:

```bash
tenon channel create research --task "Compare adapters"
tenon channel send research "Start the comparison" --as coordinator
tenon channel messages research --last 20
tenon channel wait research --as coordinator --since 0
```

`wait` exits `124` when no matching event arrives. Process-level
`spawn`/`kill`/`run` add real worker and OS-signal behavior and should be used
only with an explicit provider/config and worker budget.

Treat Channel as advanced/compatibility tooling, not the default agent runtime.

## Memory bridge

`tenon mem` reads supported local runtime sessions. It does not write or
synchronize another runtime's memory.

```bash
tenon mem list
tenon mem search "workflow"
tenon mem context <session-id>
tenon mem extract <session-id>
tenon mem projects
```

Useful filters include platform, date, cwd/global scope, and JSON output; inspect
command errors/help before scripting. Supported runtime families include
Claude, Codex, OpenCode, and Pi.

OpenCode session reading requires `node:sqlite`: Node 22.13 or later, or the
experimental SQLite flag on applicable Node 22.5–22.12 releases. When
unavailable, that reader degrades visibly.

## Tap

Tap is explicit opt-in local traffic diagnostics. Capture is off by default.

Run a command through a reverse-mode client configuration:

```bash
tenon tap start codex -- codex
```

Forward interception requires a local CA:

```bash
tenon tap start codex --forward --ca -- codex
```

For ChatGPT OAuth-based Codex traffic, reverse environment variables may be
ignored by the client; forward mode plus CA is the supported capture path.

Without a command, Tap stays in the foreground and prints environment exports
for the configured clients. Stop it with SIGINT/SIGTERM.

### Sensitive-data warning

Tap can observe:

- prompts and model responses;
- HTTP headers and tokens;
- request/response bodies;
- locally generated CA private material.

Use it only on a trusted workstation and test account, keep trace/CA paths
private, and remove retained diagnostics when no longer needed. Never attach raw
traces to a public Issue.

Tap's active-intercept registration is process-local. A `tenon doctor`
process in another terminal cannot prove whether a separate Tap process is
currently intercepting.

## Expected result

- Channel messages remain separate from Workflow state.
- Memory commands leave source sessions unchanged.
- Tap captures only after explicit start and stops with its process.

## Verification

```bash
tenon channel list --json
tenon mem list --global --limit 5
tenon doctor --json
```

For Tap, inspect only a sanitized local trace and confirm no unexpected external
asset or telemetry destination is involved.

## Common failures

### Channel event did not advance a Change

That is by design. Use Tenon state/review/transition commands for canonical
Workflow operations.

### OpenCode sessions are missing

Check the Node minor version and SQLite support.

### Tap sees no OAuth Codex traffic

Use explicit `--forward --ca` in a controlled environment.

## Next action

Read [security model](security-model.md) and
[troubleshooting](troubleshooting.md).
