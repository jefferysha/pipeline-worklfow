# Dashboard State Scope Isolation Verification

## Verdict

PASS. The frozen in-place build baseline
`workspace:sha256:852aec236c56b32e9f6411cefbffa280e52b82772f7746333e51b24751a4a765`
implements the state-scope identity contract without weakening listener ownership checks.

## Behavioral evidence

- TDD red phase failed for the intended reasons: the shared primitive was absent, cross-scope
  preemption still returned `reuse`, health omitted `stateScopeId`, and CLI readiness did not carry
  an expected scope.
- Focused green phase: 301 tests passed across kernel scope identity, CLI machine Home/readiness,
  server health and server preemption.
- Real bundled-process acceptance on port 21987:
  - state A: PID 4101,
    `sha256-v1-a8717a42e61ec114f79eb8926b8cc40976e6e072d0083af78c75a4dc870185b7`;
  - state B takeover: PID 4113,
    `sha256-v1-7b5a787abfd44804715901366f3fdbeb76c6d1b92014f59bde23d7e72d57c8c5`;
  - second state B start reused PID 4113.
  - raw local evidence: `/private/tmp/pipeline-scope-test.Uy3Qq6`.
- Built CLI smoke test resolved the packaged SPA/server and printed the single 18765 endpoint.
- Built kernel export returned the same scope ID for lexically equivalent paths.

## Verification commands

| Gate | Result |
| --- | --- |
| `npm run build` | PASS; kernel/CLI/server type build, web build and both production bundles |
| `npm test` | PASS; full Node/kernel/CLI/server/automation/channel/tap suite |
| `npm run test:web` | PASS; 46 files, 912 tests |
| `npm run typecheck:web` | PASS |
| `npm run check:comments` | PASS |
| `npm run check:default-workflow-freshness` | PASS |
| `bash tools/verify-skills.sh --quiet` | PASS |
| `bash tools/test-hooks.sh` | PASS |
| `npm run oracle` | PASS; selected legacy/new CLI golden oracles |
| `git diff --check` | PASS |
| changed-file credential signature scan | PASS; no matching secret/private-key material |

The full suite truthfully skipped its separately gated real-Codex CI case because
`PIPELINE_REQUIRE_REAL_CODEX` was not set, and skipped Claude-in-sandbox cases because
`CLAUDE_CODE_OAUTH_TOKEN` was absent. Docker-backed non-Claude integration tests did run. These
skips do not cover the state-scope code path; the real bundled-process acceptance above does.

## Review findings

No correctness, security, error-handling or compatibility finding remained.

- The scope mismatch check precedes version/release comparison, so a newer process serving the
  wrong registry cannot be reused.
- A missing legacy identity becomes a one-time takeover candidate.
- Signalling remains inside `preemptOldServer`, which cross-checks the candidate PID against the
  actual TCP listener.
- Health exposes a namespaced digest, never the Home path; the value is documented as identity,
  not authorization.
- CLI readiness requires exact release identity when managed plus exact state-scope identity in
  all managed/background starts.
- Server and CLI canonicalize through the same kernel primitive, avoiding cross-package drift.

## Changed-file to specification review

| Changed file | Specification | Reviewed |
| --- | --- | --- |
| `packages/kernel/src/machine-state-scope.ts` | `openspec/specs/plugin-distribution/spec.md` | yes |
| `packages/kernel/src/machine-state-scope.test.ts` | same | yes |
| `packages/kernel/src/index.ts` | same | yes |
| `packages/cli/src/machineHome.ts` | same | yes |
| `packages/cli/src/commands/dashboard.ts` | same | yes |
| `packages/cli/src/commands/dashboard.test.ts` | same | yes |
| `packages/server/src/paths.ts` | same | yes |
| `packages/server/src/types.ts` | same | yes |
| `packages/server/src/server.ts` | same | yes |
| `packages/server/src/server.test.ts` | same | yes |
| `packages/server/src/preempt.ts` | same | yes |
| `packages/server/src/preempt.test.ts` | same | yes |
| `packages/server/src/main.ts` | same | yes |
| `packages/cli/dist/pipeline.mjs` | same; generated from reviewed CLI/kernel source | yes |
| `packages/server/dist/dashboard.mjs` | same; generated from reviewed server/kernel source | yes |
| `docs/adr/2026-07-24-dashboard-state-scope-identity.md` | document evidence contract | yes |
| `docs/superpowers/specs/2026-07-24-dashboard-state-scope-design.md` | document evidence contract | yes |
| `docs/superpowers/plans/2026-07-24-dashboard-state-scope-isolation.md` | document evidence contract | yes |
| `openspec/changes/dashboard-state-scope-isolation/**` | document evidence and canonical state contracts | yes |
| `openspec/specs/plugin-distribution/spec.md` | applied capability contract | yes |

## Spec application

The change delta's two added requirements and all scenarios were incrementally merged into
`openspec/specs/plugin-distribution/spec.md`. The delta remains in the Change for archive
traceability.
