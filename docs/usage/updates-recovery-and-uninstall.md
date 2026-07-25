# Updates, recovery, and uninstall

## Goal

Update one host, recover from a damaged managed release, and uninstall only
Pipeline Lite-owned project files.

## Prerequisites

- an existing verified installation
- exactly one host selected for update
- a new host session after update

## Update

Immediate native-host update:

```bash
pipeline update --codex
# or
pipeline update --claude
```

Inspect without mutation:

```bash
pipeline update --codex --dry-run
```

Enable the native daily background check explicitly:

```bash
pipeline setup --codex --auto-update
```

Auto-update is opt-in and host-scoped. The updater verifies the complete
candidate, atomically activates it, and refreshes the managed Dashboard. A
running coding-agent session keeps the Skills/hooks already loaded; start a new
session. Codex may ask you to trust changed hooks again.

Redeploy a non-native adapter from the current release:

```bash
pipeline update --cursor --target /absolute/path/to/project
```

The adapter does not own an independent marketplace auto-updater.

## Runtime status and recovery

Read-only status:

```bash
pipeline runtime status
pipeline runtime status --json
```

Exact rollback:

```bash
pipeline runtime repair --rollback
```

Repair can select only the previous complete verified release. It is not a
general unsigned path or a bypass around project Workflow gates.

If no valid previous release exists, reinstall the selected host:

```bash
pipeline setup --codex
```

## Canonical project-state recovery

Inspect before repair:

```bash
pipeline state status <change-name> --json
pipeline status <change-name> --json
```

If only the YAML projection drifted from canonical state:

```bash
pipeline state repair-projection <change-name>
```

`--force-canonical` is an explicit destructive preference when unknown YAML
drift exists. Do not use it until the diff and canonical record have been
reviewed.

Never hand-edit canonical state or manufacture review/document receipts.

## Uninstall project assets

Preview from the project root:

```bash
pipeline uninstall --dry-run
```

Then explicitly confirm:

```bash
pipeline uninstall --yes
```

The uninstaller uses `.pipeline-owned.json`:

- unchanged opaque files owned by Pipeline Lite may be deleted;
- structured host files are scrubbed while user fields are preserved;
- user-modified opaque files are preserved;
- missing files are skipped;
- known scrubber stubs are reported and conservatively preserved;
- the project `.pipeline/` directory is removed;
- the command refuses to run at the home-directory root by default.

This project-level uninstaller does not claim to remove arbitrary host-owned
marketplace caches or user data outside its ownership manifest.

## Expected result

- update activates a verified release for one host;
- recovery selects only a known-good managed release;
- uninstall prints a precise ownership plan and preserves user-modified files.

## Verification

After update:

```bash
pipeline runtime status --json
pipeline doctor --json
pipeline dashboard --dry-run
```

After uninstall, inspect the printed preserved/stub list and repository diff.

## Common failures

### Update succeeded but current session behaves like the old version

Open a new host session and review Codex hook trust.

### Rollback is unavailable

There is no previous complete verified release. Re-run setup for the selected
host.

### Uninstall refuses without `--yes`

This is the fail-closed confirmation contract. Use `--dry-run` first.

### Uninstall preserves a file

The file was user-modified or the scrubber cannot safely prove ownership.
Review it manually; do not force-delete unrelated host configuration.

## Next action

Read [troubleshooting](troubleshooting.md) or
[security model](security-model.md).

