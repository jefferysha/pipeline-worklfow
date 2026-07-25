# CLI reference

## Goal

Provide a navigable command-family map while keeping `pipeline <command>
--help` as the exact flag authority.

## Prerequisites

- installed `pipeline` launcher
- current project directory for project/change commands

## Installation and runtime

Canonical first-host examples:

```bash
pipeline setup --codex
pipeline update --codex
pipeline runtime status
pipeline runtime repair --rollback
pipeline dashboard --open
```

```text
pipeline setup --<one-host> [--target <dir>] [--auto-update] [--dry-run] [-y]
pipeline update --<one-host> [--target <dir>] [--dry-run] [-y] [--auto]
pipeline runtime status [--json]
pipeline runtime repair --rollback [--json]
pipeline dashboard [--port <port>] [--background] [--open] [--dry-run]
pipeline doctor [--json]
pipeline uninstall [--dry-run] [-y]
```

Host flags:

```text
--codex --claude --cursor --gemini --copilot --pi
--devin --zed --aider --continue --cline --amp
```

## Changes and state

```text
pipeline init <name> --track <track> --preset <preset> [--workflow <name>]
pipeline list [--json]
pipeline status [name] [--json]
pipeline workflow plan <name> [--json]
pipeline get <name> <field>
pipeline set <name> <field> <value>
pipeline set-many <name> <key=value...>
pipeline cas <name> <field> <expect> <next>
pipeline transition <name> <event>
pipeline check <name>
pipeline advance <name>
pipeline handoff <name> [--phase <phase>] [--json]
pipeline handoff <name> --bundle --target <phase> \
  [--budget-bytes <bytes>] [--json]
pipeline session activate <name> [--continuous] [--host-session <id>]
pipeline session route-context <name> [--json]
pipeline state status|repair-projection|import-legacy <name> [--json]
```

`get` returns an empty line with exit `0` for a missing/unknown field. CAS
mismatch exits `3`; failed guard check exits `2`; invalid transitions exit `1`.
Use command help and machine-readable output before scripting additional
assumptions.

`pipeline workflow plan <name> --json` is the Agent-facing orchestration source
for an in-flight Change. It returns the immutable plan captured when the
WorkflowRun started, including steps, Skills, gates, guards, artifacts, and
transitions. Editing or deleting `.pipeline/workflows/<workflow>.yaml` affects
new runs only; it does not rewrite the Todo or Skill DAG of an existing run.

`handoff --bundle` compiles a deterministic `context-bundle/v1` from the
authoritative document ledger for the target phase. Each input carries its
document kind, path, recorded SHA-256, materialization mode, and policy reason;
the bundle itself carries an aggregate SHA-256. Missing files, digest drift,
duplicate slots, or an exceeded UTF-8 byte budget fail closed. The bundle is a
derived handoff artifact, not a replacement canonical document; repair stale
inputs with `pipeline document record` under an allowed producer and then
re-run the handoff.

## Documents, artifacts, and review

```text
pipeline document init <change>
pipeline document record <change> <kind> <path> --producer <skill-id>
pipeline document read <change> <kind|all>
pipeline document status <change> [--json]
pipeline artifact register <change> <field> <path> --producer <skill-id>
pipeline review request <change> --event <event>
pipeline review acknowledge <change> [--delegated]
```

Document structures and project-level spec scaffolds default to Chinese. English
is explicit:

```text
pipeline init <name> ... --document-locale en
pipeline document scaffold <change> <kind>
pipeline document scaffold <change> delta-spec --capability <capability>
pipeline scaffold spec web [--document-locale zh-CN|en] [--strategy skip|overwrite|append]
```

The Change locale is pinned in `.pipeline-document-locale.json`, outside the
strict canonical state schema so an older release can roll back safely.
The `overwrite` scaffold strategy stages the complete top-level project envelope beside the target
and commits it with a persistent transaction receipt. A later invocation first recovers an
interrupted directory switch. A live writer, or an unknown path occupying the target after the old
envelope moved, causes a fail-closed error while preserving recovery evidence.

## Tracks and custom workflow use

```text
pipeline tracks list [--json]
pipeline tracks show <id> [--json]
pipeline tracks create <id> --label <text> --workflow-default <id> \
  (--workflow-allowed <ids...> | --workflow-any) --policy <preset>
pipeline tracks update <id> <set-options...>
pipeline tracks delete <id>
pipeline init <change> --workflow <workflow> --track <track> --preset <preset>
```

Custom Workflow authoring is file/Dashboard based; there is no public
`pipeline workflow create` command in the current CLI. `pipeline workflow plan`
is a read-only runtime introspection command, not a workflow authoring command.

## AFK and loops

```text
pipeline afk enqueue <change> [--loop <id>]
pipeline afk scan [--json]
pipeline afk status [change] [--json]
pipeline afk run <change> [--level L1|L2|L3] [--image <image>]
pipeline afk cancel <change>

pipeline loops init <options>
pipeline loops list [--json]
pipeline loops status [--json]
pipeline loops enforce [--loop <id>]
pipeline loops budget|cost [loop]
pipeline loops graduate [loop]
pipeline loops level <loop> [set <L1|L2|L3>] [--confirm]
pipeline loops run <loop|pattern> [--dry-run] [--level <level>] [--commit] [--json]
pipeline loops sync <loop> <--dry-run|--apply> [...]
```

## Advanced

```text
pipeline channel help
pipeline mem list|search|context|extract|projects
pipeline tap start <client...> [--ca [dir]] [--forward] [--json] \
  [-- <command> ...]
```

Channel is orthogonal worker messaging; memory is read-only; Tap is explicit
opt-in sensitive local diagnostics.

## Verification

Use the installed command as exact authority:

```bash
pipeline --help
pipeline setup --help
pipeline tracks create --help
pipeline afk --help
pipeline loops --help
pipeline channel help
```

## Common failures

- choosing zero or multiple setup/update hosts;
- inventing a workflow CRUD command not in help;
- treating `check` as an automatic transition;
- scripting human-readable output when `--json` exists;
- using advanced mutation flags without dry-run/review.

## Next action

Return to the [usage index](README.md) or
[troubleshooting](troubleshooting.md).
