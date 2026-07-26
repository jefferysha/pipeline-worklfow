# Installation and host selection

## Goal

Install one complete Tenon release for exactly one coding-agent host,
verify the managed runtime, and load its packaged hooks and Skills.

## Prerequisites

- Node.js 22 or later
- Git
- the selected host CLI available on `PATH`
- Docker only for later AFK container execution

Tenon does not require users to install mandatory Skills one by one.

## Native host setup

New users install the complete Codex plugin without cloning the repository:

```bash
curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/main/install.sh | bash -s -- --codex
```

For Claude:

```bash
curl -fsSL https://raw.githubusercontent.com/jefferysha/tenon/main/install.sh | bash -s -- --claude
```

The bootstrap adds the selected native marketplace plugin, resolves the install
root from the host's own inventory, and invokes the same
`tenon setup --<host>` operation. Tenon does not guess private host
cache locations.

This Marketplace bootstrap is the currently available one-command install.
The repository also builds a thin npx package, but documentation will publish
the final `npx --yes @<publisher>/tenon setup --codex` command only after an
owned npm scope is configured and the package is publicly released. It is not
a second runtime or installer transaction.

Setup validates the complete package, publishes an immutable managed release,
creates stable `tenon` and `tenon-hook` launchers, starts the packaged
Dashboard, and opens it after its health check succeeds.

After installation, use `tenon setup --codex` to repair host wiring and
`tenon update --codex` to refresh the installed release.

### Codex hook trust

Codex keeps a one-time local trust boundary for third-party hooks:

1. finish `tenon setup --codex`;
2. open Codex and run `/hooks`;
3. trust `tenon`;
4. start a new Codex session.

Until trust is granted, the plugin and Skills can be installed while
SessionStart/UserPromptSubmit hooks remain inactive. Normal-chat routing will
therefore not run. If an update changes the hook bundle and Codex asks again,
review and trust it again.

### Claude session loading

Start a new Claude session after setup or update. A running host session keeps
the Skills and hooks it already loaded.

## Adapter setup

An installed release can deploy a non-native adapter into a project:

```bash
tenon setup --cursor --target /absolute/path/to/project
tenon setup --gemini --target /absolute/path/to/project
```

Supported flags:

```text
--codex --claude --cursor --gemini --copilot --pi
--devin --zed --aider --continue --cline --amp
```

Exactly one flag is accepted. `--target` defaults to the current directory for
non-native adapters. Use `--dry-run` to inspect the plan:

```bash
tenon setup --cline --target /absolute/path/to/project --dry-run
```

Native Codex/Claude marketplace releases own automatic refresh. Other adapters
are redeployed from the currently installed complete release; they are not
independent marketplace products.

## Host fidelity

Fidelity describes three governance capabilities: session/task context
injection, pre-tool veto, and Skill-execution tracking.

| Tier | Hosts | Injection | Veto | Tracking |
| --- | --- | --- | --- | --- |
| A | Claude Code, Codex, Gemini CLI, Continue CLI, Cline, Amp | native equivalent | native equivalent | native equivalent |
| B | Cursor | static/later fallback | native fail-closed | native |
| B | GitHub Copilot coding agent | instructions/user-prompt fallback | native | native |
| B | Pi | native | advisory extension | native |
| B | Aider | process-start file | commit gate | post-commit |
| C | Devin, Zed | static | manual CLI review receipt | manual/degraded |

Boundaries:

- Continue means Continue CLI (`cn`), not the IDE extension.
- Gemini's known caveat concerns sub-agent context injection, not the main
  session hooks.
- Amp uses an in-process plugin protocol. Its adapter capabilities are Tier A,
  but payload details have not been verified in a credentialed real Amp session.
- Tier C has no native enforcement hook. Static instructions are not a hard
  pre-tool veto.

## Managed runtime locations

Payload, state, and configuration use OS-standard application-data locations:

- macOS: `~/Library/Application Support/tenon/`
- Linux: XDG data/state/config locations
- Windows: Local AppData locations

The stable command launcher is normally `~/.local/bin/tenon`. Treat the
host-owned marketplace/cache directory as private implementation detail.

## Expected result

```bash
tenon runtime status --json
tenon doctor --json
```

The runtime reports an active verified release. Doctor reports the effective
protections and any honest yellow degradation, such as optional Docker or AFK
credentials not being configured.

## Verification

```bash
tenon dashboard --open
```

The packaged SPA and API become healthy on
`http://127.0.0.1:18765/` unless `--port` is explicitly used.

## Common failures

### `tenon: command not found`

Run the one-line Marketplace installer again, then
ensure `~/.local/bin` is on `PATH`.

### Setup accepts neither zero nor multiple hosts

This is intentional. Choose one host per operation.

### Codex is installed but normal conversation does not route

Run `/hooks`, trust `tenon`, and open a new session.

### Adapter has weaker enforcement than Codex

Check the fidelity table. Degraded behavior is part of the adapter contract, not
an installation failure.

### Docker or credentials are yellow in doctor

They are optional for interactive workflows. Configure them only before using
AFK with the corresponding runner.

## Next action

Continue with the [first governed task](quickstart.md), or read
[updates and recovery](updates-recovery-and-uninstall.md).
