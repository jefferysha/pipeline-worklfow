# Pipeline-Lite Full-System Acceptance

Date: 2026-07-24

Target host: Codex

Dashboard: `http://127.0.0.1:18765/`

## Outcome

The repository now ships one host-selected plugin containing the CLI,
dashboard, hooks, workflow engine, OpenSpec governance, AFK runtime, and the
complete built-in skill inventory. New installations use:

```bash
pipeline setup --codex --auto-update
```

The managed runtime is content-addressed, activated atomically, and reached
through stable `~/.local/bin/pipeline` and `pipeline-hook` launchers. Updates
use the same host selector:

```bash
pipeline update --codex
```

Opted-in SessionStart updates are bounded to once per day and call
`pipeline update --codex --yes --auto`. Candidate verification failure keeps
the previously selected release active.

## Routing and workflow matrix

| Intent | Canonical route | Standard domain policy | Evidence |
| --- | --- | --- | --- |
| Pure explanation/chat | no Change | none | router chat cases |
| Strictly bounded edit | `simple: change → verify → done` | none | `doctor-active-change-count` ended `done/done/archived=true` |
| Product/research | `pm + default` | PM profile | routing/profile and AFK wiring suites |
| Frontend/UI | `frontend + default` | frontend profile | full workflow, dashboard, browser-state suites |
| Backend/shared runtime | `backend + default` | backend profile | archived `bundled-skill-authority` Change |
| Explicit free mode | `free + <workflow>` | none | free Track has `allowed='*'` |
| Custom workflow | exact selected Track/Workflow pair | only its declared profile | `pet-adoption-live` and custom-workflow integration suites |

`free` is a single orthogonal built-in Track rather than copied configuration
inside every workflow. Because its workflow binding is `allowed='*'`, every
current and future workflow has a free entry. `free + custom` executes only
that custom workflow's DAG, Skills, Hooks, gates, and OpenSpec contract; it
does not add PM, frontend, or backend phases. `free + default` intentionally
executes the default workflow itself, because free removes the domain Track,
not the selected Workflow.

## Default governance

The default workflow remains:

```text
open → explore → spec → build ⇄ verify → ship → archive
```

- New normal-chat goals create independent Changes; an old active pointer
  cannot capture an unrelated goal.
- Resume occurs only when the user explicitly resumes or names a Change.
- Top-level Todo items are the workflow's real phases; task detail comes from
  the Change `tasks.md`.
- OpenSpec proposal/design/tasks, Superpowers design/plan, ADR, delta spec,
  verification report, and applied-spec receipt are SHA-256 registered.
- Later phases must record reads of the exact document versions before guards
  allow a transition.
- Review receipts are bound to the exact phase and event. Continuous authority
  records delegated confirmation but cannot skip Skills, documents, checks, or
  the Build/Verify barrier.

The archived
`openspec/changes/archive/2026-07-24-bundled-skill-authority` Change proves the
complete seven-phase document and review chain, including a real
`verify-fail → build → verify-pass` correction loop.

## Skill authority and AFK

- The selected managed release bundle is the first trust tier.
- Machine-global or runner-native roots are initialized only after bundled
  lookup returns `SkillContentNotFoundError`.
- Permission, schema, invalid-content, and ambiguity errors fail closed.
- Same-tier divergent external candidates remain an error.
- Real L1 Docker/TAP/Codex execution was observed as
  `queued → running → paused`; report-only verification passed and host HEAD
  did not change.
- Separate acceptance attempts proved that stale images, empty allowlists, and
  immutable-policy violations stop execution rather than silently merging.

Evidence:

- `docs/superpowers/reports/2026-07-24-bundled-skill-authority-afk.md`
- `docs/superpowers/reports/2026-07-24-bundled-skill-authority-verify.md`

## Dashboard and ports

- The only managed dashboard listens on `127.0.0.1:18765`.
- Legacy test ports `19765` and `19876` are not listening.
- Queue cards distinguish queued, running, paused, failed, and terminal states;
  queued work is not rendered as running.
- Setup and update refresh the same managed service and preserve the stable
  URL.

## Verification

- Full regression: 289 files passed.
- Tests: 5057 passed, 5 environment-gated honest skips.
- Bundled-resolution/wiring/Docker focus: 103 passed.
- Final doctor/list focus: 51 passed.
- TypeScript, dashboard, server, and CLI bundle build: passed.
- Comment-honesty and `git diff --check`: passed.
- Doctor: 18 green, 0 yellow, 0 red.
- Active Change list after terminal migration: empty.

Honest skips:

- Claude Code in-sandbox execution requires its runner authentication in that
  environment.
- The separate real-Codex CI flag was not enabled; the local real
  Codex/TAP/Docker L1 path did run successfully.

Codex retains one intentional host security boundary: after first install the
user may need to open `/hooks` once and trust `pipeline-lite` before
third-party SessionStart/UserPromptSubmit hooks execute. The plugin, Skills,
CLI, dashboard, and runtime are already installed; this host-controlled trust
decision is not bypassed by the installer.
