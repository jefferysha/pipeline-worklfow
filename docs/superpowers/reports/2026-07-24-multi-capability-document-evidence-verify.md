# Multi-capability document evidence verification

Status: PASS after four governed rework loops

## Frozen baseline

- Stored and independently recomputed:
  `workspace:sha256:2b21fb8847559e587132b43f6196e6b5213e9a0876eb4ddd4021b85e27d5b1c6`
- No implementation or configuration drift occurred during verification.

## Passing evidence

- `npm test`: 287 files, 5028 passed, 5 honest environment skips.
- Hooks: 412 passed; adapters: 262 passed; bundle: 15 passed.
- Skill references: 64 references / 63 directories, no dangling reference.
- Golden oracle: zero unexpected differences.
- Focused kernel and real CLI tests: 39 passed.
- Isolated CLI fixture retained three capability slots, read all three, allowed missing-slot
  backfill, and rejected duplicate-slot backfill.

## Blocking findings

1. A symlinked parent directory can give one physical delta document two lexical capability slots.
2. Registering a canonical delta silently removes malformed legacy delta records.
3. A malformed legacy delta can still receive a read receipt and pass evidence evaluation.
4. `document-ledger.ts` exceeds the backend 500-line production-file limit.

## Required rework

- Bind accepted paths to the same lexical and real project-relative path.
- Preserve legacy records during ordinary registration and fail closed with an actionable
  migration blocker in read/evaluation.
- Extract document path/slot validation into a focused module.
- Add red-green regression tests for each boundary and rerun the full matrix.

## Rework loop 2

The implementation correctly rejected a migration whose canonical file had a different digest.
The new unit fixture accidentally created that mismatch while expecting success. Because the shell
sequence did not enable fail-fast until after the focused test, the workflow entered verify despite
the red test. This is recorded as a failed verification visit; the Change must return to build,
make the fixture use identical bytes, and freeze a new baseline only after the focused suite passes.

## Rework loop 3

The symlink, legacy-preservation, migration command, and file-size findings were closed. Independent
review found one remaining lossless-migration conflict: when a canonical target slot already exists
with the same digest, selecting the target record can discard the explicitly named legacy source's
producer, recorded timestamp, or a conflicting same-phase read timestamp. The migration must fail
closed unless provenance is identical and overlapping receipts are byte-for-byte compatible; it
must never choose one evidence claim silently.

## Rework loop 4

Independent review passed with no high or critical findings. Before release, two non-blocking gaps
will still be closed: preserve a permanent positive regression for compatible source/target
receipts from different phases, and update the initial OpenSpec design with the final explicit
migration/collision policy. The existing atomic publication and change-lock suites already cover
write failure and concurrent mutation at the storage boundary.

## Final verification

- `npm test`: 287 files, 5032 passed, 5 honest environment skips.
- Focused ledger/CLI integration: 43 passed.
- Build, TypeScript, Dashboard production build, server bundle, and CLI bundle passed.
- Hooks: 412 passed; adapters: 262 passed; bundle smoke tests: 15 passed.
- Skill references: 64 references / 63 directories, no dangling references.
- Golden oracle: zero unexpected differences.
- Comment honesty and `git diff --check`: passed.
- Independent reviewer: PASS, Severity=None.
- Frozen baseline remained:
  `workspace:sha256:988df4c7ca8eedc453a88394d6f4162c892e7dac73bcc5f2d2b947777b2e0dc0`.
- One first full-suite attempt hit an unrelated `ENOTEMPTY` temp-directory cleanup race.
  The exact test and its full file passed on immediate rerun, and the subsequent full suite passed.
