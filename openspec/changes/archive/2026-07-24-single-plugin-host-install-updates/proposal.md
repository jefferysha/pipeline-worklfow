# Proposal: package pipeline as a self-contained, host-selectable plugin

## Problem

The current installation path mixes Codex and Claude commands in one `pipeline setup`, writes
project-local links for a global plugin concern, and fetches required workflow skills from several
third-party sources. A new user therefore cannot reliably choose one host, install a complete
default pipeline, or update the package after a release. The current approach also incorrectly
makes unrelated product modules look removable even though dashboard, AFK, tap, channel, and all
adapters are part of the pipeline product.

## Goal

Publish one complete pipeline plugin that a user installs for a selected host with a command such
as `pipeline setup --codex`. The plugin must carry its CLI, hooks, default-workflow skills,
OpenSpec document contract, and adapters; its normal release path must provide a safe automatic
update option and a deterministic manual update command.

## Scope

- Add native Codex packaging while keeping Claude plugin compatibility.
- Make host selection explicit and mutually exclusive for Codex, Claude, and every registered
  adapter host.
- Replace mandatory default-workflow external skill installation with first-party packaged skills.
- Add a fresh-install bootstrapper, stable launcher, update command, and opt-in automatic update
  mechanism for native marketplace hosts.
- Preserve every existing pipeline subsystem and adapter; only remove cross-host installation
  behavior that is provably wrong for the selected host.

## Acceptance signals

1. A clean user can install the one plugin, run `pipeline setup --codex` or `--claude`, and obtain
   all default pipeline assets without a separate skill marketplace or global npm skill install.
2. `pipeline setup` never installs both Codex and Claude accidentally, and rejects ambiguous host
   selections.
3. Every release can be refreshed with `pipeline update --codex` / `--claude`; automatic checks
   are opt-in, bounded, and announce that a new session is needed.
4. Default workflow document requirements (OpenSpec proposal/design/tasks, Superpower design/plan,
   ADR, verification report, and applied spec) remain generated, recorded, and read by later
   phases.
5. Existing dashboard, AFK, tap, channel, and non-native adapters remain packaged and covered by
   regression checks.
