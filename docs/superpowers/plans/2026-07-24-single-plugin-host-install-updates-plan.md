# Single-plugin host installation and release updates

> Change: `single-plugin-host-install-updates`
> Status: approved for inline implementation — the user explicitly requested full execution.

## Goal

Ship the whole pipeline product as one plugin distribution. A new user chooses a host with a
flag such as `pipeline setup --codex`; the selected host receives the complete packaged pipeline,
including its hooks, CLI, default-workflow skills, OpenSpec document contract, dashboard/AFK/tap/
channel code, and adapters. A release must have an explicit and automatable upgrade path without
pulling mandatory skills from third-party marketplaces at install time.

## Non-goals and compatibility boundary

- Do not remove dashboard, AFK, tap, channel, or any existing adapter: they are product modules.
- Do not vendor third-party skill text without a redistributable license. Replace mandatory default
  dependencies with first-party pipeline skills instead; third-party tools remain optional extras.
- Keep `.claude-plugin` compatibility while adding native Codex packaging. Existing project-level
  adapter installation remains available for hosts that do not have a native plugin marketplace.
- Do not silently install arbitrary network code. Automatic updates are opt-in and limited to the
  selected native marketplace host; each host session still needs a restart to load a newly installed
  skill set.

## Design

```text
plugin repository (one release)
├── .codex-plugin/plugin.json       Codex native manifest → skills + shared hooks
├── .agents/plugins/marketplace.json Codex marketplace entry
├── .claude-plugin/*                Claude-compatible manifest + marketplace
├── skills/                         first-party default-workflow skill pack
├── hooks/                          shared orchestration hooks
├── packages/cli/dist/pipeline.mjs  committed runtime bundle
└── adapters/                       non-native host bridges

bootstrap/install.sh --codex|--claude
        │
        └── host marketplace install → `pipeline setup --<host>`
                                      ├── stable ~/.local/bin/pipeline launcher
                                      ├── packed asset verification
                                      ├── selected host adapter (if non-native)
                                      └── optional automatic-update registration

pipeline update --codex|--claude
        │
        └── marketplace refresh → plugin reinstall → launcher refresh → new session
```

## Implementation tasks

1. Add the Codex manifest and repository marketplace, align the Claude/Codex version metadata,
   and extend packaging checks so both manifests, the shared hook config, and every declared
   bundled skill are validated.
2. Replace setup's cross-host external installer with a strict selected-host command surface:
   `pipeline setup --codex`, `--claude`, or one of the registered adapter flags. Reject zero or
   multiple host selectors; preserve `setup skills` and `setup runtime` as compatibility commands.
3. Generate a stable launcher under `~/.local/bin/pipeline` from the selected plugin root. It must
   be refreshable after a host plugin upgrade and support opt-in, bounded automatic update checks.
4. Add `pipeline update --codex|--claude` using each host's native marketplace refresh/install
   commands, parse the host's plugin inventory to resolve the newly installed root, then verify
   packaged assets and refresh the launcher. For non-native adapters, reapply the adapter from the
   already-updated package instead of pretending it can update a marketplace it does not own.
5. Create first-party versions of every skill that the default workflow treats as mandatory;
   update the default manifest, phase instructions, source registry, document contract, and skill
   verification so no mandatory default step relies on `npx skills`, a Claude-only plugin, or an
   unlicensed local copy. Keep external integrations marked optional.
6. Add a checked-in bootstrap script for fresh Codex/Claude installations. It is only an installer
   for this plugin repository; it does not introduce a second product or a global npm package.
7. Update README and distribution/release documentation with exact first install, host selection,
   automatic-update opt-in, manual update, restart, and multi-host adapter behavior.
8. Add/extend unit and integration coverage for option parsing, host exclusivity, launcher updates,
   marketplace command plans, Codex/Claude plugin manifests, bundled skill completeness, and the
   existing hooks/adapters/bundle smoke tests.
9. Build the committed CLI bundle, run the relevant test suite, stage only this change and the
   already-approved related pipeline fixes, then commit and push `main` after inspecting the
   staged diff for unrelated files.

## Verification matrix

- `npm test -- --run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/program.test.ts`
- native manifest/marketplace tests and bundled-skill registry tests
- `bash tools/verify-skills.sh`
- `bash tools/test-hooks.sh`
- `bash tools/test-adapters.sh`
- `npm run build` followed by `bash tools/test-bundle.sh`
- `pipeline setup --dry-run --codex` and `pipeline update --dry-run --codex` command-plan smoke
- review the staged path list before commit; never use `git add -A` in this dirty worktree
