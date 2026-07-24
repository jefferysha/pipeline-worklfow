# Design: one release package, selected host entry points

## Distribution boundary

The repository root remains the single plugin root. It contains both native plugin manifests:

- `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` for Codex;
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` for Claude compatibility.

Both manifests reference the same root-level `skills/` and `hooks/hooks.json`. The existing CLI
bundle, templates, dashboard/server packages, AFK runner, tap, channel, and `adapters/` directory
remain beneath that root and are therefore included in one release artifact.

## Host selection

`pipeline setup` receives exactly one host flag (`--codex`, `--claude`, or a registered adapter
flag). Native hosts verify the installed plugin root and create the stable `~/.local/bin/pipeline`
launcher. Non-native hosts reapply their existing adapter from the current packaged root to the
selected project. The legacy no-selector path must not silently install two hosts.

## Skill policy

The default workflow may only make a mandatory reference to a first-party skill under `skills/`.
The registry describes those entries as `bundled`; verification proves every entry has a concrete
`SKILL.md`. Third-party skills and MCP tools remain optional extensions and may not decide whether
the default OpenSpec pipeline can start, create evidence, or transition.

## Update policy

Native update uses the host's own marketplace flow:

1. refresh the configured pipeline marketplace;
2. reinstall/update the `pipeline-lite` plugin;
3. resolve the installed root from the host's JSON inventory;
4. validate packaged assets and refresh the launcher.

`--auto-update` is an opt-in launcher setting. It performs a bounded, throttled native-host check
in the background; it never updates an unselected host and it informs users to open a new session
before expecting newly installed skills/hooks to load.

## Document continuity

The default OpenSpec document contract is unchanged: Open produces proposal/design/tasks;
Explore produces Superpower design and ADR; Spec produces delta spec and plans; Verify produces a
report; Ship applies the spec. Each transition requires the relevant recorded outputs and later
phases register their reads, so packaging changes cannot turn the documentation sequence into
unread, decorative files.
