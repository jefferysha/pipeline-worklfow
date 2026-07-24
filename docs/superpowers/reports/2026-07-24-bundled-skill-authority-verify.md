# Bundled Skill Authority Verification

## Verdict

PASS with no severity findings.

Frozen baseline:
`workspace:sha256:2c61d1084c67289f21c75901635d847f27bea328325d8d3b754bc01d85300959`.
The independent reviewer confirmed the same fingerprint before and after its
read-only review.

## Repair history

The first Verify cycle failed because both production adapters eagerly
enumerated lower-trust Codex cache roots and the CLI assembly file exceeded the
project's 500-line hard limit. The governed `verify-fail` transition returned
the Change to Build. The repair added a deterministic red test per adapter,
made lower-tier discovery lazy, and extracted execution-coordinate assembly.

## Fresh checks

- Focused skill-resolution and wiring regression: 5 files, 103 tests passed,
  including the real Docker read-only snapshot integration.
- Independent reviewer selection: 4 files, 81 tests passed.
- Full regression: 289 files, 5057 tests passed, 5 environment-gated honest
  skips.
- TypeScript, dashboard, server, and CLI bundle build: passed.
- Comment-honesty gate: passed.
- `git diff --check`: passed.
- Real Docker-backed L1 AFK: selected bundle reached Codex agent execution and
  settled at the expected report-only human handoff without changing host
  HEAD.

## Independent reviewer

PASS with no findings:

- Bundled content resolves before any lower-trust root is enumerated.
- Only `SkillContentNotFoundError` permits tier descent.
- Access, schema, damaged-content, and ambiguity errors remain fail-closed.
- Namespaced lookup, logical aliases, Claude fallback isolation, and same-tier
  ambiguity rejection did not regress.
- `skillBundleAssembly.ts` is 481 lines; extracted
  `executionCoordinatePort.ts` is 130 lines.
- The original public re-export and capture/current-digest TOCTOU contract are
  unchanged.

## Spec conformance matrix

| Changed production file | Capability | Result |
| --- | --- | --- |
| `packages/automation/src/skills/production-content-locator.ts` | `skill-content-resolution` | PASS |
| `packages/cli/src/skillBundleAssembly.ts` | `skill-content-resolution` | PASS |
| `packages/cli/src/executionCoordinatePort.ts` | execution-coordinate compatibility | PASS |
| Corresponding regression tests | `skill-content-resolution` | PASS |

The delta at
`openspec/changes/bundled-skill-authority/specs/skill-content-resolution/spec.md`
is applied to `openspec/specs/skill-content-resolution/spec.md`.

## Honest skips

- Real Codex CI mode remained gated because
  `PIPELINE_REQUIRE_REAL_CODEX != 1`.
- Claude Code in-sandbox authentication remained unavailable.

The real local Codex/TAP/Docker L1 run covers the production Codex path; the
Claude-only skip remains a runner-specific residual environment gap.
