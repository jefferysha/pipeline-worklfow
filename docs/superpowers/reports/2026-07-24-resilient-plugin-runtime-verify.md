# Verification report: resilient plugin runtime

## Outcome

PASS after one controlled verify-fail/build correction cycle. The first review reproduced two
critical trust-boundary bypasses and one high-severity transaction inconsistency; the corrected
baseline closes all findings and passes both independent code review and isolated installation E2E.

## Frozen baseline

- `workspace:sha256:fbaec2c14a96f50dd2de33e1aa2da383ad7450d52a4fb92ea69840a60ae902ed`
- Reviewer probes were read-only with respect to the repository and retained user runtime.
- Installation E2E used an isolated temporary home, runtime root, and dashboard port.

## Passing evidence

- Runtime/setup/update focused Vitest: 9 files, 113 tests.
- Independent correction review: 4 files, 22 tests.
- Independent installation E2E: 7 files, 106 tests.
- Hook suite: 416 checks.
- Adapter suite: 262 checks.
- Bundle suite: 15 checks.
- Skill inventory: 64 references, 63 bundled skill directories, zero external dependencies.
- Temporary `setup --codex` publication: immutable release active and valid.
- Temporary stable launcher and bootstrap dispatch: valid.
- Temporary dashboard health: HTTP 200 and release ID exactly matches the active runtime.
- Auto-update projection: `host=codex`, `enabled=true`.

## Closed findings

### CRITICAL: active payload integrity was not recomputed

Normal CLI/hook dispatch now recomputes the selected payload digest. A forged active payload exits
with failure, never executes the injected marker, and status reports `activeValid=false`.

### CRITICAL: degraded recovery accepted an arbitrary launcher path

Recovery authorization is now bound to the exact stable launcher command. The canonical repair
command remains reachable, while `/tmp/evil/pipeline runtime repair --rollback` is denied.

### HIGH: activation could commit before a failing audit append

Activation and rollback now use failure-safe audit ordering. Injected audit append failures leave
selection unchanged for both paths.

### MEDIUM: storage adapter exceeded the project size boundary

Codec and persistence helpers moved into `release-store-codecs.ts`; `release-store.ts` is 487 lines.

### MEDIUM: host refresh failures were not runtime-audited

Host refresh and verification failures now persist an `update-rejected` audit event, and runtime
status exposes the last audit record for diagnosis.

## Final decision

The corrected baseline satisfies the managed-runtime trust boundary, recovery-only contract,
transaction consistency, diagnostics, and backend file-size rule. It is approved for Ship.
