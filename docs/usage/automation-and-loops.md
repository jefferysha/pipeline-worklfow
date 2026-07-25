# AFK automation and loop governance

## Goal

Queue and run optional sandboxed work with explicit readiness, autonomy level,
budget, and failure controls.

## Prerequisites

- a Change eligible for automation
- Docker daemon for container execution
- the `sandcastle:local` image or an explicitly selected image
- credentials for the selected Codex/Claude runner
- an explicit loop binding when loop policy is required

Interactive workflows do not require Docker. Missing optional AFK prerequisites
should appear as visible degradation, not invalidate the core installation.

## Check readiness

```bash
pipeline doctor --json
pipeline afk status --json
pipeline loops status --json
```

Doctor never prints credential values. It reports whether each supported runner
has a usable source.

## Enqueue a Change

```bash
pipeline afk enqueue <change-name>
```

Bind it explicitly to a loop:

```bash
pipeline afk enqueue <change-name> --loop <loop-id>
```

PM's built-in policy can enqueue after Spec completes. Enqueueing does not
automatically start Docker or a runner.

## Run safely

L1 is the default report-only level:

```bash
pipeline afk run <change-name> --level L1
```

Use another image only when it is trusted and prepared:

```bash
pipeline afk run <change-name> --level L1 --image sandcastle:local
```

Cancel an active job:

```bash
pipeline afk cancel <change-name>
```

Cancellation records intent and terminates the owned container. Inspect final
status and preserved artifacts before retrying.

## Loop lifecycle

Create a paused draft:

```bash
pipeline loops init \
  --id nightly-fix \
  --goal "Repair flaky tests" \
  --runner codex \
  --yes
```

Or use a starter template:

```bash
pipeline loops init \
  --id ci-loop \
  --template ci-sweeper \
  --skill-bundle backend \
  --yes
```

Inspect policy:

```bash
pipeline loops list --json
pipeline loops status --json
pipeline loops enforce --loop <loop-id>
pipeline loops budget <loop-id>
```

Autonomy levels:

| Level | Meaning |
| --- | --- |
| L1 | report-only safe default |
| L2 | assisted execution within admitted policy |
| L3 | explicitly graduated unattended execution |

Changing level requires admission and explicit confirmation:

```bash
pipeline loops level <loop-id> set L2 --confirm
```

Directed loop execution:

```bash
pipeline loops run <loop-id> --dry-run --level L1 --json
```

Do not use `--commit` or L3 until sandbox, allowlists, verification/review
gates, budget, credentials, and recovery have been reviewed.

## Enforcement

Loop governance evaluates R1–R11 policy, including budget, maximum in-flight
work, failure and dry-run streaks, admission, and kill/warn decisions. Level
labels do not bypass normal Workflow gates or Skill/document evidence.

## Expected result

Queued, running, waiting, cancelled, and failed states remain distinct; every
worker action is bounded by the selected loop/autonomy policy.

## Verification

```bash
pipeline afk status <change-name> --json
pipeline loops enforce --loop <loop-id>
pipeline loops status --json
```

## Common failures

### Queued but not running

Check Docker, image, runner credential, loop admission, budget, and concurrency.
Queue state alone does not launch a worker.

### L2/L3 graduation rejected

Read the enforcement verdict. Do not edit the registry to bypass failed
admission.

### Worker failed

Preserve logs and artifacts, inspect the terminal reason, then retry only after
the underlying condition changes.

## Next action

Read [advanced tools](advanced-tools.md) or
[troubleshooting](troubleshooting.md).

