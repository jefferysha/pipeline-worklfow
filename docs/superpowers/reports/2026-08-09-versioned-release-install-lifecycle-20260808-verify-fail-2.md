# Versioned release install lifecycle verification failure, iteration 2

## Verdict

Frozen build
`workspace:sha256:df74e6f763bd162795da6bb197511f3b763e3d6df7ac7e721520b737486d07fb`
does not pass Verify. No pull request, tag, public release, live-plugin uninstall, or public reinstall
may proceed from this build.

## Release-blocking finding

The managed runtime store now publishes every new activation as a v2 manifest with the framed v2
payload digest and a release identity bound to payload, host, plugin version, and stable
tag/commit. The stable launcher still dispatches `runtime/tenon-bootstrap.mjs`, whose manifest
decoder, payload verifier, and rollback verifier accept only the v1 manifest and legacy hash.

Consequently setup/update can commit and report a valid v2 activation, but the next invocation of
`tenon` or `tenon-hook` rejects that active release and enters recovery-only/failure behavior.
Evidence: `packages/cli/src/runtime/release-store.ts`, `packages/cli/src/runtime/release-payload.ts`,
and `runtime/tenon-bootstrap.mjs`.

## Additional Build requirements

- Teach the packaged bootstrap to read v1 legacy and v2 current manifests, calculate the matching
  payload digest algorithm, and validate the complete v2 release identity including host, plugin
  version, and optional stable target.
- Keep v1.0.1 rollback/recovery readable and executable.
- Add a real cross-process test that activates a v2 release, executes the generated stable launcher,
  and proves `runtime status` plus ordinary CLI dispatch; retain a v1 rollback compatibility test.
- Split the native update orchestration by responsibility because the touched
  `packages/cli/src/commands/update.ts` exceeds the backend 500-line hard limit.
- Move public tag/release uninstall and reinstall acceptance from Verify to Ship. Verify must prove
  the isolated candidate; Ship must merge, create the immutable SemVer release, and then run the
  real public one-line install, repeat install, and update acceptance.

## Evidence already closed

The previous payload framing, cross-host release identity, Dashboard-only reconciliation, trusted
absolute installer commands, candidate revalidation, legacy WAL, convergence cleanup, doctor
identity, documentation, and generated-asset findings are closed in this frozen build. They remain
subject to full regression after the new Build iteration.
