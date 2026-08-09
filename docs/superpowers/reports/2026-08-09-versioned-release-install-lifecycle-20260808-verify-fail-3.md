# Versioned release install lifecycle verification failure, iteration 3

## Verdict

Frozen build commit `6788bd2a2fc9d540e497992038f78be90723341b` and build baseline
`workspace:sha256:e2370359fe819f874199c554d96def75ee36f5edbd59a238e5cce287d3c9e99c`
do not pass Verify. No pull request, tag, public release, live-plugin uninstall, or public reinstall
may proceed from this build.

The isolated functional lane passed its complete build, test, clean-install, and OpenSpec rehearsal,
but the two independent review lanes found reachable crash-recovery and trusted-executable defects.
Passing tests do not override those release blockers.

## Release-blocking findings

### 1. Rollback downgrades the trusted bootstrap before selection commit

Both `RuntimeReleaseStore.rollbackToPrevious()` and the standalone stable bootstrap copy the
previous release's `runtime/tenon-bootstrap.mjs` into the active bootstrap slot before publishing
the rollback selection. A crash or selection-write failure in that window leaves selection on the
current v2 release while the active v1.0.1 bootstrap can only decode v1 manifests, making the
previously valid runtime unavailable.

A successful rollback to the real v1.0.1 payload also reactivates the v1.0.1 bootstrap, whose hook
runner resolves bare `bash` through `PATH`. That removes the v1.0.2 absolute-Bash protection and
permits an attacker-controlled PATH entry to execute during `tenon-hook`.

Build must keep the current compatible and hardened bootstrap TCB while switching only the
verified payload selection, or introduce an equally durable atomic/recoverable bootstrap-selection
transaction. Tests must use the real v1.0.1 bootstrap bytes, inject failure between bootstrap and
selection publication, and run the rolled-back hook under a malicious PATH.

### 2. A mixed stable-launcher pair is not recoverable

Activation publishes selection before `writeStableLaunchers()` writes `tenon`, `tenon-hook`, and
their modes in separate operations. A process death after only one launcher is committed leaves a
mixed old/new pair. `recoverActivationWithinTransaction()` accepts only the complete checkpoint
pair or the complete committed pair, so the durable `activating-runtime` WAL cannot converge and
retries remain indeterminate.

Build must recognize only an installer-owned partial commit in which every launcher independently
matches either the exact checkpoint or the exact committed content, finish the pair under the same
managed transaction, and reject every third-party state. Add process-crash tests after each file and
mode boundary.

## Medium findings that also require closure

- `tenon runtime status --json` proves only selection validity. It must expose the closed verified
  manifest identity needed by the product identity contract: release id, source host/version,
  stable tag/commit, and payload digest. The clean-install harness must assert that public output
  rather than privately reading `release.json` for the missing version identity.
- Update failure audit persistence currently swallows `recordUpdateFailure` errors. Preserve the
  primary update error, but emit a stable warning with the audit persistence cause so a failed audit
  is not reported as though it was recorded.

## Full-release compatibility gate

The real public v1.0.1 CLI, when supplied explicitly as `TENON_N_MINUS_ONE_CLI`, currently fails
three `tools/test-bundle.sh` checks while reading or mutating the current generated Change
(`workflow plan snapshot` schema rejection). This appears to predate this diff, but it is still an
overall release-compatibility gate for the requested plugin review. The next Build iteration must
either restore the documented real N-1 compatibility or revise the gate and contract with evidence;
it must not silently rely only on the simplified frozen reader.

## Evidence already passed

- Isolated `npm ci` and `npm run build` passed with zero dependency vulnerabilities.
- Release-specific suites passed: 318/318 targeted tests and 72/72 real cross-process release-store
  tests.
- Full core passed: 378 files, 6616 tests, 14 honest environment skips.
- Full web passed: 97 files, 1737 tests.
- Identity, release-workflow, docs, repository-hygiene, legacy-bridge, OpenSpec, npm bootstrap, and
  local clean-install/repeat-install gates passed.
- OpenSpec archive rehearsal passed in an isolated copy; the real specs remained byte-identical.
- The real checkout fingerprint remained
  `997db91a0ebd5f3543e716788e21a7508e247042edc60cb532cb6199c4641845` throughout the isolated lane.
- Public v1.0.2 installation was correctly not attempted because the immutable tag and Release do
  not yet exist.
