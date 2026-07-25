# Troubleshooting

## Goal

Diagnose routing, waiting/running state, evidence, runtime, and Dashboard
problems with read-only checks before applying a bounded repair.

## Prerequisites

- project root and suspected Change name, when applicable
- the exact host and current session
- no manual edits to canonical state, ledgers, or pending markers

## First-response bundle

Run:

```bash
pipeline doctor --json
pipeline runtime status --json
pipeline list --json
pipeline status <change-name> --json
pipeline document status <change-name> --json
pipeline afk status <change-name> --json
```

If Dashboard is involved:

```bash
curl --fail http://127.0.0.1:18765/api/health
curl --fail http://127.0.0.1:18765/api/snapshot
```

Collect error messages and exit codes, but remove secrets and sensitive Tap
content before sharing.

## Symptom guide

### Normal conversation does not trigger a Workflow

Check:

1. whether the request was only discussion/system/slash-command input;
2. `pipeline doctor`;
3. Codex `/hooks` trust;
4. whether a new host session was opened after setup/update;
5. project root and hook installation.

Do not force a Change merely to make every conversation governed.

### An unrelated old Change is selected

Run `pipeline list --json` and inspect the prompt for an explicit resume. Recent
mtime is not selection authority. Explicitly activate the intended Change:

```bash
pipeline session activate <change-name>
```

### Everything takes the default seven phases

Inspect Track/Workflow identity and simple exclusions. Simple requires positive
bounded evidence and no exclusion. Free/custom require explicit selection.

### A task stays `waiting`

Waiting can be:

- an exact review request;
- unresolved agent/user interaction;
- a fresh confirm/review/interaction gate;
- AFK queued without a running worker;
- a guard/evidence failure.

Inspect status, document status, AFK status, and Dashboard detail. Re-request an
expired review through the CLI; do not delete a marker to fabricate approval.

### UI says waiting while work is running

Check the bound host-session identity and recent terminal/worker activity. A
normal conversation is running only while its host session is actually active;
an unfinished task alone is not running. AFK uses worker lifecycle, not host
conversation activity.

### Todo does not match the Workflow

Status must identify the effective Workflow. Default has seven phases; simple
has change/verify/done/escalated; custom uses its own graph. Restart/update only
after the health endpoint proves the Dashboard release is stale.

### Document exists but transition fails

```bash
pipeline document status <change-name>
pipeline check <change-name>
```

Confirm producer Skill, current phase visit, digest, and required read receipt.
File existence is not evidence.

### Port 18765 shows the wrong application

Check `/api/health` and release/state-scope identity. Stop the unrelated process
or choose another explicit port:

```bash
pipeline dashboard --port 19765 --open
```

Do not accept a page solely because the port responds.

### Dashboard mutations return 401

Use the packaged same-origin `pipeline dashboard`. Vite dev does not own the
production handshake token.

### AFK is queued but not running

Check Docker, image, credentials, loop admission, budget, concurrency, and
autonomy level. PM auto-enqueue does not start a worker.

### Managed runtime is damaged

```bash
pipeline runtime repair --rollback
```

If no verified previous release exists, rerun host-scoped setup.

### YAML projection drift

```bash
pipeline state status <change-name> --json
pipeline state repair-projection <change-name>
```

Use force only after reviewing unknown drift.

## Expected result

The symptom is mapped to a specific layer—host hook, routing, Change evidence,
review, worker, runtime, or Dashboard—before mutation.

## Verification

Repeat only the affected read-only commands and confirm the expected state or
health identity changed for the intended reason.

## Common failures

- treating a yellow optional doctor light as a core installation failure;
- deleting pending markers;
- hand-editing `.pipeline.yaml` or the document ledger;
- using `verify-pass` approval for `verify-fail`;
- assuming a port listener is the correct release;
- sharing tokens, CA material, prompts, or raw traces in a public Issue.

## Next action

Use [Support](../../SUPPORT.md) for a sanitized non-sensitive report, or
[Security](../../SECURITY.md) for a vulnerability.

