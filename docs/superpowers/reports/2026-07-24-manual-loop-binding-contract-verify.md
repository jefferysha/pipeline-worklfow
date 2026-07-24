# Manual Loop Binding Contract Verification

## Result

PASS — the final verification target was frozen after all production builds,
and every required review track passed against that exact target. The two
earlier failed attempts remain recorded below as part of the audit trail.

## Verified behavior

- Manual `loops init` preserves explicit `workflow_id` and
  `skill_bundle_id` without a starter template.
- Starter-template behavior and omitted-binding compatibility remain intact.
- `simple` transitions into both `done` and `escalated` now write
  `phase_status=done` and `archived=true`.
- A canonically archived in-place Change satisfies `depends_on`; physical
  OpenSpec archive directories remain supported.

## Blocking review findings

- HIGH: the first implementation used one composite lookup for both active
  canonical state and historical archive directories. A new active Change with
  the same name as an older physical archive, or a damaged active canonical
  state, could therefore pass the dependency guard. The active branch must be
  canonical-only and fail closed.
- MEDIUM / project hard gate: touched production files exceeded the repository
  limits (`loops.ts`, `transition-application.ts`, and CLI `main.ts`). The
  affected responsibilities must be split before delivery.

## Evidence

- `npx vitest run packages/kernel/src/flow/guard.test.ts
  packages/cli/src/commands/loops.test.ts
  packages/kernel/src/workflow/loadWorkflow.test.ts
  packages/kernel/src/workflow/transition-application.test.ts
  packages/cli/src/init-workflow.integration.test.ts`
  — 5 files, 196 tests passed.
- `npm test` — complete repository suite exited 0.
- `npx tsc -b packages/kernel packages/cli` — passed.
- `npm run bundle` — generated the production CLI bundle successfully.
- Real isolated CLI probe at
  `/private/tmp/manual-loop-binding-probe.lRxyZi` wrote and parsed:
  `workflow_id: default` and `skill_bundle_id: pm`, with no template metadata.
- The live `manual-loop-binding-contract` Build transition accepted the
  canonically archived `manual-loop-binding-preservation` dependency.

## Review tracks

- Independent backend reviewer: FAIL with the HIGH and hard-gate findings
  above.
- E2E/full suite: passed, but did not cover stale same-name archive or damaged
  active canonical state.
- Codex CLI review was started read-only but its own pipeline hook stopped
  before a final verdict; this is recorded as an incomplete/degraded third
  track, not a pass.

## Second verification attempt

FAIL — the full production build ran after `build-complete` and updated bundled
distribution assets. The independent reviewer recomputed the in-place
fingerprint and found it no longer matched the frozen baseline. The Change was
returned to Build so generated artifacts could settle before the final freeze.

## Final verification attempt

### Frozen target

`workspace:sha256:30ff176a470029a84852597ea06c7da0416c2f02782bfcabc64b2d501a909eac`

The fingerprint matched before and after both independent review tracks.

### Review tracks

- Backend reviewer: PASS with no severity findings. It rechecked manual loop
  bindings, simple terminal closure, stale same-name archive handling, damaged
  canonical fail-closed behavior, atomic/CAS registry writes, and touched-file
  length limits.
- Isolated CLI E2E: PASS. It exercised the built production CLI in temporary
  repositories for:
  - explicit manual `workflow_id=default` and `skill_bundle_id=pm` persistence;
  - `simple` `done` and `escalated` terminal states with
    `phase_status=done`, `archived=true`, and no active-list entry;
  - active archived dependency acceptance;
  - active unarchived plus stale physical archive rejection;
  - damaged active canonical plus stale physical archive rejection.
- Codex CLI review: degraded because its own pipeline hook stopped the
  subprocess. The independent reviewer and isolated E2E tracks both completed
  against the frozen target, so this unavailable optional track is not
  represented as an independent pass.

### Fresh checks

- Six focused suites: 198 tests passed.
- `git diff --check`: passed.
- Full repository `npm test`: exited 0 after the final implementation changes.
- Production `npm run build`: passed before the final target was frozen.
- Touched production modules are below their repository limits:
  `main.ts` 391, `transition-application.ts` 499, `loops.ts` 404,
  `loops-init.ts` 323, `loops-init-input.ts` 263,
  `loops-governance.ts` 308, and `guardContext.ts` 85 lines.

### Capability-spec quality check

| Changed responsibility | Main capability spec | Result |
| --- | --- | --- |
| Manual loop parsing, assembly, persistence, and CLI wiring | `openspec/specs/automation-loop-init/spec.md` | PASS |
| Simple `done` / `escalated` terminal closure | `openspec/specs/automation-loop-init/spec.md` | PASS |
| Active canonical versus physical dependency archive lookup | `openspec/specs/automation-loop-init/spec.md` | PASS |

The delta was incrementally applied to the main capability spec before this
final verification attempt.

## Honest skips

The full suite reported its existing credential-gated skips for real Codex and
Claude-Code sandbox jobs. Docker-backed non-credential integration coverage
ran successfully. These skips are unrelated to the changed contracts and are
not represented as passes.
