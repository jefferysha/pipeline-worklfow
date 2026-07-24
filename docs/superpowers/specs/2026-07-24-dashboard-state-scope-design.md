# Dashboard State Scope Isolation — Explore Design

## Reproduced failure

1. A Dashboard from the repository was already listening on 18765.
2. A first-install simulation used a fresh `HOME`, `CODEX_HOME`, runtime home and
   `PIPELINE_DASHBOARD_HOME`.
3. The immutable plugin release was the same, so `decidePreemption` returned `reuse`.
4. CLI readiness checked only `{ok, scope, version, releaseId}` and accepted the old process.
5. The browser opened the old process, whose registry pointed at the repository rather than the
   fresh project.

The UI was internally consistent with the process it reached; the defect was process identity,
not React state.

## Constraints

- Keep the single default endpoint `127.0.0.1:18765`.
- Preserve safe same-scope singleton reuse and same-semver release takeover.
- Do not expose the state Home path.
- Do not trust an unauthenticated health PID without verifying listener ownership.
- Keep `/api/health` backwards compatible.
- Make CLI success mean the exact intended process is ready.

## Selected model

The state Home is canonicalized lexically to an absolute path and namespaced before SHA-256. The
full digest is used to avoid introducing collision handling. Health and readiness use the same
first-party kernel primitive, preventing CLI/server drift.

Preemption order:

1. no process → bind;
2. mismatched or missing `stateScopeId` → preempt;
3. matching scope → compare semantic version;
4. equal version with a managed release → compare exact `releaseId`;
5. otherwise reuse.

The mismatch decision deliberately precedes version comparison: reusing a newer process with the
wrong registry is never correct. Takeover remains fail-closed because `preemptOldServer` must match
the reported/pidfile PID to the real TCP listener before sending `SIGTERM`.

## Validation matrix

| Existing process | Requested process | Expected |
| --- | --- | --- |
| none | any scope | bind |
| same scope, same release | same | reuse |
| same scope, newer release | new | preempt |
| different scope, same release | requested scope | preempt |
| legacy health without scope | scoped process | preempt once |
| wrong health PID | any takeover | fail closed |

## Open questions resolved

- Relative and trailing-slash paths are normalized with `path.resolve`.
- Symlink resolution is intentionally not required: the configured lexical state root is the
  operator-selected isolation boundary, and it can be fingerprinted even before all files exist.
- The fingerprint is identity only, never authentication or authorization.

## Coverage

```coverage
touches:
L1_api: filled -> plugin-distribution delta health contract
L2_data: filled -> stateScopeId canonical representation
L3_rules: filled -> Validation matrix
L4_state: filled -> Selected model preemption order
L5_errors: filled -> legacy migration and readiness fail-closed scenarios
L6_security: filled -> path privacy and listener ownership verification
L7_perf: waived -> one startup-only SHA-256 has no request-path impact
L8_deps: filled -> shared kernel primitive and additive API compatibility
L10_terms: filled -> state scope terminology in ADR and delta spec
```

The change touches local process lifecycle, loopback health and the machine-state registry boundary.
It does not touch authentication, payment, production data or remote user state.
