# Verification report: single-plugin host installation and updates

## Outcome

PASS after one controlled verify-fail/build correction cycle. The first pass found one managed
candidate completeness gap; the corrected baseline closes it and passes the full build, regression,
bundle, hook, adapter, skill, oracle, independent review, and isolated installation E2E suites.

## Frozen baseline

- `workspace:sha256:9254d96703e68a486e18babaf001df800b77117bf49c5fe4f6b7156b066efcba`
- In-place implementation/configuration content remained unchanged throughout Verify.
- Verify-only main-spec and evidence documents are excluded from the implementation fingerprint.
- The first pass after correction correctly rejected an older frozen SHA because the distributable
  CLI bundle had just been rebuilt. Build re-froze the final bundle, then 3 focused files/21 tests,
  skill verification, bundle smoke, and diff checks passed against this final baseline.

## Passing evidence

- Full Vitest: 287 files, 5036 tests passed, 5 environment-dependent tests honestly skipped.
- TypeScript/dashboard/server/CLI build: pass.
- Hooks: 416 passed.
- Adapters: 262 passed.
- Bundled skills: 64 references, 63 directories, zero external dependencies, 63 installable tokens.
- Bundle smoke: 15 passed.
- Golden oracle: all stdout/exit/YAML comparisons matched; documented product evolutions only.
- Independent first-pass reviewer: 20 files, 536 tests passed.
- Independent correction review: 2 files, 11 tests; Critical 0, High 0, Medium 0, Low 0.
- Isolated first install: 8 files, 105 tests plus production setup path passed.
- Temporary stable launcher status: `activeValid=true`.
- Temporary dashboard health: HTTP 200 and health release ID matched the active immutable release.
- Default dashboard port contract: `18765`; isolation used a random port without touching user
  runtime.
- Auto-update projection: exact `host=codex` and `enabled=true`.
- Setup performed no external mandatory-skill installation.

## Quality/spec readback

| Changed area | Capability spec read back | Result |
| --- | --- | --- |
| `hooks/router.sh`, router tests | `normal-chat-routing` / `simple-task-routing` | pass |
| runtime bootstrap, release store, update command/tests | `plugin-runtime` / `plugin-distribution` | pass after correction |
| built CLI bundle | all affected runtime/routing specs | pass |
| archived Change ledgers and reports | `document-evidence-contract` | pass |
| dashboard setup/health evidence | `live-dashboard-project-anchor` / `plugin-distribution` | pass |

The `plugin-distribution` delta was applied immediately to
`openspec/specs/plugin-distribution/spec.md`.

## Closed finding

### MEDIUM: Claude marketplace metadata was not part of the managed candidate manifest

The first pass found that the repository and manifest tests included
`.claude-plugin/marketplace.json`, while the managed payload list, candidate fixtures, and package
asset verification omitted it.

The corrected baseline:

1. Requires `.claude-plugin/marketplace.json` in every managed payload.
2. Includes it in release-store and stable-hook candidate fixtures.
3. Verifies its Claude marketplace name and source through package validation.
4. Proves a candidate missing it is rejected while active selection remains unchanged.

## Final decision

All acceptance criteria and phase gates are satisfied. The single packaged plugin, explicit
host-owned setup/update, bundled mandatory skills, immutable managed runtime, default port `18765`,
and digest-bound OpenSpec document continuity are approved for Ship.
