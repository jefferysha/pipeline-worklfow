# Resilient Plugin Runtime Design

> change: `resilient-plugin-runtime`
> track: `backend`
> design-doc: `openspec/changes/resilient-plugin-runtime/design.md`

## Decision

`pipeline-lite` will treat a native marketplace checkout as a release candidate, never as the
runtime trust anchor.  A small stable bootstrap installed in the user's executable directory
selects an immutable, verified local release.  Host hooks call that bootstrap rather than a path
inside the marketplace checkout.

The implementation deliberately combines the strongest relevant patterns from Tenon contract and Tenon runtime:
Tenon contract-style managed-content validation and backup discipline, and Tenon runtime-style single workflow
ownership plus staged candidate validation.  It adds the missing release-level atomic activation
and an independent bootstrap boundary.

## Runtime topology

```text
Codex / Claude hook manifest
  -> ~/.local/bin/pipeline-hook
  -> managed bootstrap active.mjs
  -> selection.json active release
  -> releases/<digest>/payload/hooks/<event>.sh
  -> workflow-owner router / OpenSpec guards / Skill DAG

~/.local/bin/pipeline
  -> managed bootstrap active.mjs
  -> releases/<digest>/payload/packages/cli/dist/pipeline.mjs
```

The two launcher scripts are intentionally tiny and use only an absolute, setup-generated managed
runtime location plus `node`.  They are not symlinks to a marketplace checkout.  The bootstrap
sets `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` to the selected payload before it invokes a payload
hook, so existing hook-internal relative asset resolution remains valid without trusting the
host-provided plugin root.

## Platform locations

The runtime resolves distinct data, state, and configuration roots.

| Platform | Data / releases / bootstrap | State / selection / audit | Configuration |
| --- | --- | --- | --- |
| Linux | `$XDG_DATA_HOME/pipeline-lite`, otherwise `~/.local/share/pipeline-lite` | `$XDG_STATE_HOME/pipeline-lite`, otherwise `~/.local/state/pipeline-lite` | `$XDG_CONFIG_HOME/pipeline-lite`, otherwise `~/.config/pipeline-lite` |
| macOS | `~/Library/Application Support/pipeline-lite` | `~/Library/Application Support/pipeline-lite/state` | `~/Library/Application Support/pipeline-lite/config` |
| test / explicit operator override | `$PIPELINE_RUNTIME_HOME/data` | `$PIPELINE_RUNTIME_HOME/state` | `$PIPELINE_RUNTIME_HOME/config` |

`~/.local/bin` remains the POSIX executable location for the two stable launchers.  The setup
operation writes the absolute runtime roots into those scripts, avoiding an implicit dependency on
the shell's XDG environment at hook time.

## Immutable release model

Each staged candidate is copied into a private staging directory, has its curated runtime payload
validated, and is published as `releases/sha256-<tree-digest>/payload`.  The payload contains the
CLI bundle, dashboard bundles, hooks, skills, templates, adapters, manifests, verifier, and
bootstrap source required to run the packaged plugin.  Symlinks in a candidate payload are
rejected; a candidate cannot turn a managed release into an alias for arbitrary user files.

`release.json` records the release identifier, tree digest, source plugin version, creation time,
and the verified payload path.  `selection.json` contains a monotonic revision, one active release,
an optional previous release, and update metadata.  A separate append-only audit JSONL records
activation, validation rejection, rollback, and retention actions.

The dashboard launched from a managed payload reports both the marketplace semantic version and
the release digest in `/api/health`. Its singleton handoff compares semantic version first and, at
equal version, compares the digest: a different selected payload preempts the stale service while
the same payload reuses it. This makes each successful release activation observable even when a
local marketplace cache has not changed its semantic plugin version yet.

Publication uses a runtime-root mkdir lock, temporary siblings, and atomic rename.  The release
directory is completely verified before it is renamed into `releases/`; only then is the selection
record atomically replaced.  Interrupted staging creates no active selection.  An interrupted
activation is reconciled by validating the referenced release at next startup; the prior valid
selection remains usable.

## Candidate verification

Before activation the runtime manager must:

1. verify the curated file set and reject path traversal or symlinked payload entries;
2. run the packaged `tools/verify-skills.sh --quiet --root <stage>`;
3. run `bash -n` on every distributed shell hook and adapter shell entrypoint;
4. run `node --check` on the CLI, dashboard-server, and bootstrap modules;
5. run the CLI bundle's `--help` smoke command;
6. parse the hook manifest and prove that every registered hook invokes the stable
   `pipeline-hook` ABI, not `${PLUGIN_ROOT}` or `${CLAUDE_PLUGIN_ROOT}` directly.

No launcher, selection, or bootstrap pointer changes before every check succeeds.

## Failure semantics and recovery authority

There are two intentionally different failure classes:

| Condition | Result |
| --- | --- |
| Active runtime loaded and a workflow policy rejects an action | fail closed; the payload guard returns its normal denial. |
| Active runtime is absent, tampered, or cannot be loaded | recovery-only; normal project mutation hooks deny, but the bootstrap recognizes exactly `pipeline runtime repair --rollback` and can atomically select the verified previous release. |

Recovery does not delete project markers, change OpenSpec state, fetch arbitrary code, accept a
release path, or execute user-supplied shell.  It only validates the persisted `previousRelease`,
switches selection to it under the runtime lock, updates bootstrap slots, and appends audit evidence.
If no previous verified release exists, the command fails loudly with an operator reinstall hint;
the bootstrap never silently treats this as approval to mutate a project.

The bootstrap itself is a finite trusted computing base.  It is separately syntax-checked, stored
as active/previous bootstrap slots, and atomically replaced only after the new release passes
validation.  No software architecture can remove the root of trust entirely; this design minimizes
it and keeps it outside the mutable marketplace checkout.

## Host installation and update flow

`pipeline setup --codex` and `pipeline setup --claude` remain the only native-host selections.
The selected host installs its marketplace candidate first.  Setup then stages that root, verifies
it, activates the managed release, writes stable launchers, and writes opt-in auto-update config.
All default workflow skills remain packaged in the candidate; no step installs a separate workflow
package or deletes non-selected bundled skills.

`pipeline update --<host>` asks the host to refresh its marketplace package, resolves the host's
reported root, stages that root, and only then atomically activates it.  A marketplace or candidate
failure retains the active managed release and launcher.  The host cache may change during a failed
update, but it is no longer on the runtime execution path.

The SessionStart auto-update helper invokes the stable launcher, not a bundle located through the
host's mutable plugin root. Interactive setup/manual update starts the selected release's dashboard
as a detached managed child, waits for the loopback health proof, and then opens the browser; the
automatic SessionStart update refreshes that same service without opening a browser. Updates remain
opt-in and take effect for a new host session.

## Workflow ownership

The host-level bootstrap makes a payload healthy; it does not choose a project workflow.  The
payload router has a separate, deterministic responsibility:

- new objectives always emit `intent: new` and create a fresh change;
- explicit `continue` / `resume <name>` may bind only to the named or uniquely eligible change;
- multiple candidates generate `intent: select`, never an mtime winner;
- `.pipeline-active` is a recovery candidate, not a cross-conversation binding;
- a current-change record identifies one workflow owner at a time and is validated before use.

This adopts Tenon runtime's single-router principle without making the router itself the host bootstrap
root of trust.

## Migration and retention

Existing `~/.local/bin/pipeline` symlinks are replaced only after the first candidate has been
verified and activated.  The new launcher script is idempotent.  Existing host cache directories,
project `.pipeline-*` state, skills, and user configuration are never deleted.  The runtime keeps
the active release, its immediately previous verified release, and a bounded number of older
verified releases; pruning is performed under lock and never removes either protected slot.

## Coverage

```coverage
touches:
L1_api:      filled -> CLI setup/update/runtime commands and stable hook ABI
L2_data:     filled -> managed release manifest, selection record, and audit JSONL
L3_rules:    filled -> candidate validation and recovery-only authority invariants
L4_state:    filled -> stage -> verify -> publish -> activate / rollback lifecycle
L5_errors:   filled -> validation rejection, interrupted update, and no-LKG diagnostics
L6_security: filled -> immutable payload, no symlink escape, fixed recovery command grammar
L7_perf:     waived -> local bounded tree hashing only during setup/update, never per normal tool call
L8_deps:     waived -> Node 22 built-ins and existing shell tools only; no new runtime dependency
L10_terms:   filled -> this document's Runtime topology and Immutable release model
```

## Verification strategy

Unit tests cover path resolution, release record codec, tree digest determinism, invalid candidates,
selection CAS, and fixed recovery argument parsing.  Filesystem integration tests cover concurrent
activation, injected validation failure, interrupted publication, rollback, migration from the old
launcher, and audit retention.  Hook/adapter tests prove manifests no longer execute a mutable
plugin-root path.  The final verification runs the repository's hook, adapter, skill, bundle,
workflow-freshness, oracle, test, and build gates.
