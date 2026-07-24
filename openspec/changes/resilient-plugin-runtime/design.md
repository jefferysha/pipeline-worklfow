# Initial design hypothesis: Resilient plugin runtime

## Proposed boundaries

The design separates the mutable marketplace payload from the host-facing trust boundary:

```text
host hook ABI
  -> stable bootstrap dispatcher
  -> active verified pipeline release
  -> workflow-owner router
  -> OpenSpec / Skill DAG / review guards
```

The bootstrap dispatcher is intentionally small and independently versioned.  It resolves a
runtime-manager state directory using platform-standard user data/state/config paths, validates
the active selection, and dispatches into a verified release.  It is not a second workflow engine
and has no operation that can approve a gated project action.

The runtime manager stores immutable, content-addressed release directories and separate
`active` / `previous` selection records.  A candidate copied from a host marketplace is verified
in a staging directory, then published atomically.  A valid policy rejection remains fail-closed.
If the release cannot be loaded or verified, the dispatcher enters recovery-only mode: it denies
normal project mutations and recognizes only a fixed repair/rollback command that may select an
already verified local release and append an audit record.

Above that runtime layer, the workflow router uses an explicit current-change ownership record.
It may route a request to exactly one matching change only when the user explicitly asks to resume
it.  New objectives must not consume a repository-level candidate, an mtime winner, or old task
content.

## Candidate implementation direction

- Keep domain invariants and release-state codecs in `packages/kernel`; put filesystem staging,
  locks, atomic publication, and platform paths in infrastructure adapters.
- Keep `packages/cli` as the command/host boundary: `setup`, `update`, `doctor`, and a dedicated
  runtime recovery command orchestrate application use cases rather than directly mutating state.
- Keep bash hooks as thin shims.  They call a stable dispatcher path rather than `${PLUGIN_ROOT}`
  payload hooks.  Complex selection and verification logic remains in TypeScript.
- Treat the marketplace checkout as an untrusted candidate input after installation.  The release
  verifier must include existing asset checks plus shell syntax validation and an executable
  dispatcher smoke test.
- Migrate existing launcher/configuration without deleting it until the first verified release is
  active.  Existing installations must remain usable if migration fails.

## Questions for explore

1. Which existing kernel persistence and locking primitives can represent active/previous release
   selection without inventing a parallel unsafe file protocol?
2. What stable absolute dispatcher path and host manifest syntax work for both Codex and Claude,
   including macOS and Linux standard user directories?
3. How should the bootstrap dispatcher distinguish a policy denial from runtime corruption without
   turning a corrupted payload into an unrestricted fail-open path?
4. Which candidate assets must be hashed and smoke-tested to cover every hook, CLI bundle, skill,
   dashboard asset, and host adapter contract?
5. How does the existing normal-chat router persist and validate explicit current-change ownership,
   and which parts of the in-progress router changes can be reused without overlapping them?
6. What migration and retention policy prevents release-store growth while preserving enough
   verified history for safe rollback?

## Risks

- Host hook manifests are a compatibility boundary and must not assume a marketplace cache layout.
- A bootstrap mechanism is necessarily part of the trusted computing base; it must be minimal,
  separately validated, dual-slot updated, and never accept arbitrary user-controlled execution.
- Release selection is a multi-file state transition.  It needs lock/CAS semantics, temporary
  publication, deterministic recovery after interruption, and tests that exercise concurrent
  setup/update/recovery calls.
- Existing uncommitted routing and guard changes are user work.  This change must integrate with,
  not overwrite, those edits after their actual contracts are understood.
