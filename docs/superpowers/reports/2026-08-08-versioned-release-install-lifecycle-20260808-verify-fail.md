# Versioned release install lifecycle verification failure

## Verdict

Frozen build
`workspace:sha256:35d90b6d80ceb22a425fe3791f0108436835067fd2285d8bf4c111ecd74a2dfa`
does not pass Verify. No pull request, tag, public release, uninstall, or real-user reinstall may
proceed from this build.

Independent read-only review found three release-blocking HIGH findings and four MEDIUM findings.
The previously identified v1.0.1 migration, legacy journal, trusted launcher, host convergence, and
Dashboard recovery defects are closed and their regression suites pass. The findings below are new
gaps in the frozen build and require a new Build iteration.

## HIGH findings

1. **Candidate payload activation has a time-of-check/time-of-use identity gap.** The release store
   copies the candidate into a staged payload, hashes that staged payload, but reads the manifest
   version from the still-mutable candidate root. Setup/update ready evidence revalidates source
   identity without comparing the active release payload digest to a fresh candidate digest. A
   candidate changed during or after staging can therefore produce mixed evidence or activate a
   payload that is not the currently proved candidate. Evidence:
   `packages/cli/src/runtime/release-store.ts:177-198` and the setup/update ready-evidence paths.
2. **Runtime payload verification drops the frozen Bash trust boundary.** Native lifecycle setup and
   update freeze absolute host, Git, and Bash executables before mutation, but
   `verifyReleasePayload` launches a bare `bash`. A relative or empty `PATH` element can therefore
   execute an attacker-controlled current-directory program during activation. Evidence:
   `packages/cli/src/runtime/release-payload.ts:180-185` and the default runtime activation wiring.
3. **The public installer mutates the existing host before proving the requested immutable tag.**
   Marketplace/plugin removal and re-registration run before the remote tag and peeled commit are
   resolved and proved. If the tag is missing, moved, or unavailable, the installer can destroy the
   working installation and only then fail. Evidence: `install.sh:224-265` versus the later tag proof
   at `install.sh:316-353`.

## MEDIUM findings

1. **A fresh managed WAL is written before latest-stable resolution succeeds.** The managed release
   journal coordinator can create an empty transaction before the candidate coordinator resolves and
   proves the stable target. Resolver failure therefore changes managed runtime state despite the
   specification's zero-mutation failure contract. Evidence:
   `packages/cli/src/commands/managed-release-journal-coordinator.ts:29-36` and
   `packages/cli/src/commands/release-candidate-coordinator.ts:138-149`.
2. **An already-absent legacy plugin can leave a stale cleanup receipt permanently pending.** The
   host-ahead recovery path returns before reading and superseding an existing cleanup-pending
   receipt when the legacy plugin has already disappeared. A first command may report convergence,
   while the next command reads the stale receipt and fails. Evidence: the early return in
   `recordPendingHostPluginConflict` and the host-ahead recovery path.
3. **`tenon doctor --json` does not prove product release identity.** The current doctor output does
   not cross-check the expected Tenon package version, native host inventory version, active managed
   runtime version/release identity, and Dashboard health version/release identity. This leaves the
   explicit `tenon-product-identity` diagnostic contract unimplemented.
4. **Quickstart documentation is outside the versioned-install contract.** The English and Chinese
   quickstarts link to installation documentation but do not include the official immutable
   `v1.0.2` one-line installer or the no-source-compilation guarantee. The documentation checker also
   omits both quickstarts, so this regression is not gated. Evidence: the two quickstart files and
   `tools/check-docs.mjs:267-273`.

## Passing evidence retained

- Isolated dependency installation passed with zero reported vulnerabilities.
- Full build passed, including CLI, server, and Dashboard controlled distribution assets.
- Core suite passed: 376 files, 6512 tests, with 14 honest environment skips.
- Web suite passed: 97 files, 1737 tests.
- Current release-specific suite passed: 191/191.
- npm bootstrap checks passed: 52/52; legacy bootstrap compatibility passed: 1/1.
- Documentation checks passed: 11/11; identity checks and release workflow checks passed.
- Local clean install and repeated-install acceptance passed without touching the user's live
  installation.
- Isolated OpenSpec show, strict validation, archive rehearsal, and all-spec validation passed; the
  real canonical main specs remained byte-identical.

These passing results prove the covered paths only; they do not discharge the seven findings above.

## Required Build remediation

- Make the staged payload the sole activation identity, bracket candidate copying with digest proof,
  and require active/candidate digest equality in final ready evidence and recovery.
- Carry the already frozen absolute Bash executable through native runtime payload verification and
  add a hostile-`PATH` regression test.
- Resolve and prove the immutable remote tag and peeled commit before any installer host mutation;
  retain post-install ref, HEAD, origin, cleanliness, version, and payload proofs.
- Resolve/prove the stable target before the first fresh managed journal write while preserving
  frozen-target recovery for existing transactions.
- Read and safely supersede or complete old cleanup receipts when the legacy plugin is already absent,
  then prove convergence again on a repeated command.
- Add a production doctor identity check covering package, host, runtime, and Dashboard release
  identity, with fail-closed mismatch and unavailable-state tests.
- Put the official immutable installer directly in both quickstarts, state that release assets are
  used without source compilation, and extend documentation checks to cover both files.
- Add failing tests first for every item, rebuild all controlled distribution assets, and rerun the
  full review and three-lane Verify gate against a new frozen build.
