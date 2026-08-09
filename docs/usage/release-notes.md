# Release notes

Tenon release notes explain what changed, what users need to do, and how to verify an upgrade.

Only capabilities included in a public distribution belong here. Plans, internal ADRs, and unmerged experiments are not presented as shipped work.

## v1.0.2 · 2026-08-08

### Versioned installation and updates

- The public one-line installer is pinned to immutable `v1.0.2` prebuilt assets; it never installs from `main` or compiles source.
- `tenon update --codex` resolves the official latest stable GitHub Release, freezes its tag and commit, and rebinds the Codex Marketplace through host-owned commands.
- Exact same-version host/runtime/Dashboard state is a zero-mutation no-op; downgrade attempts and unverifiable Release metadata fail before mutation.
- Setup always waits for Dashboard readiness. Piped/CI installs and all updates keep the browser closed and print the verified URL plus `tenon dashboard --open`.

### Upgrade

Existing v1.0.1 users run the immutable `v1.0.2/install.sh` one-liner once; the
v1.0.1 launcher cannot safely self-rebind the new tag in one old-updater
invocation. From v1.0.2 onward, run one `tenon update --codex`. Open a new Codex
session to load the released Skills and hooks, then run `tenon doctor --json`.

## v1.0.1 · 2026-07-26

### Normal-chat entry contract

- `product/identity.json` now declares `entrySkill: "tenon"` as the only public entry.
- Codex normal chat invokes `tenon:tenon`; no secondary entry alias is retained.
- Root `AGENTS.md` and the Codex static adapter consume one generated managed block.
- `tenon doctor` verifies the entry Skill and reports an enabled conflicting workflow plugin as a red finding.
- `tenon setup --codex -y` removes that exact retired registration through the official Codex plugin manager before activating Tenon.

### Repository and release hygiene

- CI and Release scan every tracked path and text file for restricted external reference identities.
- Matching is case-insensitive, has no exemptions, and diagnostics never echo a restricted identity.
- The same checks run before the release payload is built.

### Upgrade

Run `tenon update --codex`, then `tenon setup --codex --auto-update -y`. Open a new Codex session and run `tenon doctor --json`.

## v1.0.0 · 2026-07-26

### Governed document locale

- New Changes pin governed documents to `zh-CN` by default.
- `tenon init`, `tenon document scaffold`, and the default OpenSpec fallback share one Document Presentation Registry.
- Users can explicitly select `--document-locale en`.
- A pinned Change cannot silently switch locale.
- Historical Changes infer locale from the writing system used by existing H1 headings.
- Mixed or ambiguous signals fail loudly and require an explicit locale.

### Execution modes

- Discussion handles ordinary conversation without a state machine.
- Simple uses `change → verify → done` and does not create the full OpenSpec chain.
- Default uses `open → explore → spec ⇄ build ⇄ verify → ship → archive`.
- Free binds an explicit workflow without adding a domain Track.
- Custom follows only its declared DAG, Skills, gates, and document contract.

### Documentation site

- The repository README defaults to Chinese and links to `README.en.md`.
- The site exposes Chinese at the root and the English mirror under `/en/`.
- Local search is built from the public content manifest.
- GitHub Pages deploys only from `main`.
- Pull requests build and verify but do not deploy.
- The artifact is checked against a closed allowlist and scanned for sensitive material.
- `llms.txt` indexes only public pages.
- Internal ADRs, Superpowers plans, review receipts, and local control-plane state are excluded.

### Installation and updates

- Install for Codex with `tenon setup --codex`.
- Install for Claude with `tenon setup --claude`.
- Update with the matching `tenon update --codex` or `tenon update --claude`.
- The managed runtime is content-addressed and the stable launcher targets a verified release.
- A failed update preserves the previous release for `tenon runtime repair --rollback`.
- Dashboard listens on `127.0.0.1:18765` by default.

## Upgrade checklist

1. Inspect the repository working tree.
2. Run the update command for the selected host.
3. Run `tenon runtime status`.
4. Run `tenon doctor`.
5. Run `tenon list --json` in the project.
6. Confirm Dashboard uses `127.0.0.1:18765`.

## Verification

- `tenon --help` lists the command families.
- `tenon runtime status` reports the active runtime.
- `tenon doctor` reports no missing bundled Skills.
- Repeated `tenon setup --codex` remains idempotent.
- Updating does not rewrite canonical Change state.
- A new test Change creates Chinese proposal, design, and tasks files.
- An explicitly English Change keeps newly scaffolded documents in English.

## Compatibility

The canonical Change codec does not gain a locale field. Locale lives in the rollback-compatible `.pipeline-document-locale.json` sidecar.

## Rollback

Run `tenon runtime status`, then use `tenon runtime repair --rollback` to return to the previous verified content-addressed release.

Runtime rollback does not remove project Changes, OpenSpec documents, or evidence ledgers.

## Next action

Read [Updates, recovery, and uninstall](./updates-recovery-and-uninstall.md) for the complete maintenance and recovery workflow.
