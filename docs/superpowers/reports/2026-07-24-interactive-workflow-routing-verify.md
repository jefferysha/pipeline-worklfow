# Verification report: interactive workflow routing

## Outcome

PASS after one audited Verify→Build correction cycle. A first independent review found that a
built-in Track overridden to a non-default workflow bypassed selection. Build corrected the
predicate and added a permanent regression; the second independent review and E2E track found no
remaining issue.

## Frozen baseline

- Build baseline: `workspace:sha256:6cb37c68ed093566ee4ae2f9ce4910a14eb1d1dfe34cc4c2a6ddf4d68b8617f7`
- Delivery implementation commit reviewed: `cd67e5bdd838a3c8e6ef378e618861b6a181cdd7`
- Verify did not modify implementation or runtime configuration.

## Verification tracks

### Focused behavior and integration

- `npx vitest run packages/kernel/src/tracks/router-projection.test.ts packages/cli/src/commands/gen-router.test.ts packages/cli/src/workflow-skill-orchestration.integration.test.ts`
  - PASS: 3 files, 15 tests.
  - Covers effective Track workflow projection, V4 inert cache generation, and real workflow/skill
    orchestration.
- `bash tools/test-hooks.sh`
  - PASS: 416 checks.
  - Covers clean default routing, simple exclusion rules, custom candidate selection, fail-closed
    cache handling, project/session isolation, and hook evidence.
- `bash tools/test-bundle.sh`
  - PASS: 15 checks.
  - Covers the distributable CLI/dashboard bundle and canonical Change lifecycle.
- Independent E2E track:
  - `bash tools/test-adapters.sh`: PASS, 262 checks.
  - focused custom-gate, transcript-receipt, and workflow orchestration Vitest: PASS, 3 files,
    21 tests.
  - Used temporary fixtures only and did not modify repository files.
- `git diff --check`
  - PASS.

### Independent reviewer

- Initial cycle: FAIL, HIGH. `hooks/router.sh` classified a candidate as custom only when
  `builtin=0`, so an allowed built-in `frontend → pet-adoption` override skipped selection.
- Corrected cycle: PASS, no findings.
  - Built-in `frontend → pet-adoption` now emits `workflow: select`, candidate pairs,
    `selection_required: true`, and the correct recommendation.
  - Canonical plugin policy `simple → simple` still emits `workflow: simple`, `phase: change`, and
    no selection gate.
  - The reviewer confirmed the frozen baseline matched before and after its probes.

### Quality-check mapping

| Reviewed implementation file | Capability spec | Result |
| --- | --- | --- |
| `packages/kernel/src/tracks/router-projection.ts` | `openspec/specs/normal-chat-routing/spec.md` | matched |
| `packages/cli/src/commands/gen-router.ts` | `openspec/specs/normal-chat-routing/spec.md` | matched |
| `hooks/router-gen.mjs` | `openspec/specs/normal-chat-routing/spec.md` | matched |
| `hooks/router.sh` | `openspec/specs/normal-chat-routing/spec.md` | matched |
| `skills/pipeline/SKILL.md` | `openspec/specs/normal-chat-routing/spec.md` | matched |
| focused kernel, CLI, hook, server, and bundle tests | `openspec/specs/normal-chat-routing/spec.md` | matched |

## Spec application

The delta under
`openspec/changes/interactive-workflow-routing/specs/normal-chat-routing/spec.md` was applied to
`openspec/specs/normal-chat-routing/spec.md` during Verify, before the verify-pass decision.

## Correction evidence

- `hooks/router.sh` now requires selection for a project-defined Track or a non-default effective
  workflow, with the canonical plugin-owned `simple → simple` pair as the explicit lightweight
  exception.
- `tools/test-hooks.sh` contains four permanent assertions for the built-in workflow override.
- Independent behavior probes verified:
  - built-in override: picker required;
  - canonical simple: direct lightweight route;
  - clean default: direct default route.

## Residual risk

The host interaction UI presentation differs by adapter, but the dispatch contract and
selection-before-creation rule are covered at the router, adapter, bundle, and orchestration
boundaries.
