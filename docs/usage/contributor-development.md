# Contributor development

## Goal

Build and verify Tenon from source without drifting tracked bundles,
generated workflow assets, public contracts, or documentation.

## Prerequisites

- Node.js 22 or later
- npm
- Git
- Docker only for sandcastle/real AFK tests
- credentials only for explicitly selected real-host integration tests

## Setup

```bash
git clone https://github.com/jefferysha/tenon.git
cd tenon
npm ci
npm run build
```

The root package is private. This source workflow is not a published global npm
installation path.

## Architecture

| Path | Responsibility |
| --- | --- |
| `packages/kernel` | state, Workflows, Tracks, guards, evidence, persistence, loops |
| `packages/cli` | command interface and runtime assembly |
| `packages/server` | local HTTP/SSE server and cross-package orchestration |
| `packages/dashboard-app` | React SPA |
| `packages/automation` | AFK queue, admission, runners, lifecycle |
| `packages/channel` | advanced/compatibility worker bus |
| `packages/tap` | local proxy and trace store |
| `hooks` | thin host hook shims |
| `adapters` | host capability/install adapters |
| `templates` | manifest, Skill sources, built-in Workflows |
| `skills` | distributed Tenon Skills |

Read [CONTRIBUTING.md](../../CONTRIBUTING.md), `AGENTS.md`, and the relevant
`.agent-rules/` files before editing.

## Verification

Core:

```bash
npm test
npm run test:web
npm run typecheck:web
npm run build
```

Contracts and distribution:

```bash
npm run check:comments
npm run check:architecture
npm run check:default-workflow-freshness
bash tools/test-hooks.sh
bash tools/test-adapters.sh
bash tools/verify-skills.sh
bash tools/test-bundle.sh
npm run oracle
git diff --check
```

The repository currently has no general lint or format npm script. Do not claim
one ran.

## Change-specific responsibilities

- Workflow template changes: regenerate/check the tracked default artifact.
- CLI/server/web source: rebuild the tracked distribution assets.
- Adapter changes: update registry truth and run conformance tests.
- Skill changes: update sources/locks and run Skill verification.
- Dashboard behavior: run focused tests, full web checks, and real browser
  acceptance against the exact built 18765 release.
- Public behavior: update relevant contracts and docs in the same Change.
- Security/persistence/concurrency: add failure/abuse coverage and document
  recovery.

## Expected result

Source, generated assets, bundles, contracts, tests, and documentation describe
the same behavior.

## Common failures

- editing `dist` or generated workflow files by hand;
- changing source without rebuilding tracked bundles;
- adding a host without registry/conformance evidence;
- bypassing review/document receipts to make a test pass;
- committing credentials, local paths, caches, or traces;
- reporting skipped credential tests as passing.

## Next action

Follow [CONTRIBUTING.md](../../CONTRIBUTING.md) for patch/PR expectations and
[SECURITY.md](../../SECURITY.md) for sensitive findings.

