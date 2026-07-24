# Single-plugin host installation and release updates

> Change: `single-plugin-host-install-updates`
> Design doc: `docs/superpowers/specs/2026-07-24-single-plugin-host-install-updates-design.md`
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

## Build plan

### Stage 1 — tracer bullet: clean Codex install to a healthy active release

Implement the smallest complete vertical path first:

1. Declare the Codex native plugin and marketplace metadata.
2. Parse exactly one `setup --codex` host selector.
3. Resolve the Codex-reported plugin root, validate/stage it, publish the immutable runtime, and
   write stable launchers.
4. Start the dashboard from that active release and assert `/api/health` returns the same release
   ID.
5. Cover the path in `packages/cli/src/commands/setup.test.ts`, runtime integration tests, and an
   isolated temporary-home E2E.

Expected behavior: one command installs the full packaged product for Codex without modifying
Claude or requiring another skill installer.

Verification: focused setup/runtime tests, CLI bundle smoke, and isolated health check.

**Context boundary — 此处建议 /clear**

### Stage 2 — complete host-selection and adapter ownership

1. Align Claude native metadata with the same package version and payload.
2. Reject zero or multiple selectors and reject native auto-update options for non-native adapters.
3. Preserve all adapter registry entries and reapply only the selected adapter.
4. Add parser, selection, native-host, and adapter regression tests.

Expected behavior: distribution stays complete, while one invocation mutates only the selected
host.

Verification: program/setup tests plus `tools/test-adapters.sh`.

**Context boundary — 此处建议 /clear**

### Stage 3 — updates, rollback, and diagnostics

1. Add `pipeline update --codex|--claude` using the selected host's native inventory/update API.
2. Route manual and opt-in daily automatic update through the stable launcher.
3. Preserve the active release on refresh or candidate failure and surface `update-rejected`.
4. Bind recovery to exact `pipeline runtime repair --rollback` and validate the previous release.
5. Cover concurrency, interruption, tamper, audit failure, and rollback paths.

Expected behavior: every release has deterministic manual/automatic refresh and failure-safe
recovery, with no mutable checkout execution.

Verification: update/runtime/doctor tests and negative failure injection.

**Context boundary — 此处建议 /clear**

### Stage 4 — bundled skills and OpenSpec evidence continuity

1. Package first-party versions of every mandatory default-workflow skill.
2. Update workflow declarations, phase instructions, and installer verification so mandatory
   tokens cannot resolve externally.
3. Verify proposal/design/tasks, Superpowers design/plan, ADR, delta spec, verification report, and
   applied-spec receipts are generated and read by their later phases.
4. Add skill registry, hook, bundle, and document-ledger regression coverage.

Expected behavior: a clean install runs the complete seven-phase default pipeline without a second
skill marketplace.

Verification: `tools/verify-skills.sh`, hook/bundle suites, and workflow/document tests.

**Context boundary — 此处建议 /clear**

### Stage 5 — release documentation and direct-main delivery

1. Document install, host trust, port `18765`, manual/automatic update, restart, runtime status,
   rollback, and adapter reapply behavior.
2. Build the committed CLI bundle and run the full verification matrix.
3. Inspect every staged path, commit the governed changes, and push the user-authorized `main`
   branch.

Expected behavior: the repository and installed runtime describe and execute the same release.

Verification: full tests, build, hooks, adapters, skills, bundle, oracle, doctor, live setup, remote
SHA comparison, and clean worktree.

## Prototype decision

A disposable prototype is not inserted. The uncertain seams—host inventory, runtime publication,
stable launchers, and dashboard handoff—already have production implementations plus focused and
isolated E2E coverage. A separate prototype would duplicate those tests without reducing an
unresolved data-model or state-machine risk.

## Verification matrix

- `npx vitest run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/program.test.ts`
- native manifest/marketplace tests and bundled-skill registry tests
- `bash tools/verify-skills.sh`
- `bash tools/test-hooks.sh`
- `bash tools/test-adapters.sh`
- `npm run build` followed by `bash tools/test-bundle.sh`
- `pipeline setup --dry-run --codex` and `pipeline update --dry-run --codex` command-plan smoke
- review the complete staged path list before commit and verify every path belongs to the governed
  delivery.
