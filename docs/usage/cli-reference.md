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
pipeline get <name> <field>
pipeline set <name> <field> <value>
pipeline set-many <name> <key=value...>
pipeline cas <name> <field> <expect> <next>
pipeline transition <name> <event>
pipeline check <name>
pipeline advance <name>
pipeline handoff <name>
pipeline session activate <name> [--continuous] [--host-session <id>]
pipeline session route-context <name> [--json]
pipeline state status|repair-projection|import-legacy <name> [--json]
```

`get` returns an empty line with exit `0` for a missing/unknown field. CAS
mismatch exits `3`; failed guard check exits `2`; invalid transitions exit `1`.
Use command help and machine-readable output before scripting additional
assumptions.

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
`pipeline workflow create` command in the current CLI.

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
