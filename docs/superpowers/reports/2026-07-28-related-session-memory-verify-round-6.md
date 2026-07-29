# Related Sessions Verify Round 6

## Decision

**FAIL** — return the exact `verify-fail` event to Build.

- Frozen build: `c490ee2904be40347be68109fe9783f3db68b0b7`
- Merge base: `2394ac71efc87193350d476266a3219c320bb5b1`
- Aggregate severity: Critical 0 / High 0 / Medium 2 / Low 0
- Earlier frozen-track evidence is not reusable after the next implementation change.

## Four-track result

| Track | Result | Evidence |
| --- | --- | --- |
| Code review | FAIL | `/tmp/tenon-rsm-c490ee-code-review/report.md` |
| E2E | FAIL | `/tmp/tenon-rsm-c490ee-e2e/SUMMARY.md` |
| Visual | PASS | `/tmp/tenon-rsm-c490ee-visual/visual-review.md` |
| Standards / contract rehearsal | PASS with unrelated repository limitations | Isolated strict delta validation and archive rehearsal |

The E2E track passed the protected API and Dashboard state matrix but failed the
frozen target after independently confirming the OpenCode WAL side effect. The
visual track passed desktop, narrow, light, dark, loading, empty, partial, busy,
error, retry, keyboard, IME, focus and 390px acceptance. Computed contrast was
6.7016:1 in light normal/hover and 8.1507:1 in dark normal/hover.

## Blocking findings

### Medium — the production OpenCode reader mutates host WAL coordination files

`packages/kernel/src/mem/adapters/opencode.ts` opens the live host
`opencode.db` with `DatabaseSync(..., { readOnly: true })`. A live WAL search
updates `opencode.db-shm`; when sidecars do not yet exist, a read can also create
`opencode.db-shm` and `opencode.db-wal`. The main database and WAL payload can
remain unchanged while persistent SHM bytes change. This violates the feature's
no-host-session-write contract.

Build must use a side-effect-free, consistency-honest path. It must not silently
ignore uncheckpointed WAL content. Add a production-path red/green regression
that fingerprints the main DB, WAL and SHM before and after a search with a live
writer.

### Medium — a symlinked descendant can escape the physical project root

`packages/kernel/src/mem/relatedSearch.ts` and
`packages/kernel/src/mem/filter.ts` admit a recorded cwd using lexical
`path.resolve` containment. A cwd such as
`<registered-real-root>/alias-outside`, where `alias-outside` resolves to a
sibling directory, is therefore exposed as an in-project hit.

Build must perform a Related-Sessions-only canonical containment check through
the injected filesystem boundary, fail closed with an honest partial warning
when the cwd cannot be resolved, and preserve the legacy CLI's lexical
contract. Add regressions for both a valid symlinked registered-root ancestor
and an escaping symlinked descendant.

## Rechecked prior findings

The frozen review confirmed that these earlier issues remain fixed:

- explicit single-host queries do not probe unrelated OpenCode storage;
- OpenCode graph identity uses `platform:id` and cannot merge cross-host IDs;
- global recent selection is applied after cross-host discovery;
- indexed OpenCode query plans fail closed when unavailable;
- the server passes the registered root's canonical `realPath`;
- the real synchronous production runner preserves the HTTP single-flight 429;
- stale Dashboard responses, keyboard/IME paths and non-lightening hover styles
  are covered by implementation and tests.

## Verification evidence

- Targeted kernel tests: 109/109 passed.
- Targeted server tests: 12/12 passed.
- Targeted Dashboard tests: 60/60 passed.
- `npm run build`: passed; only the existing Vite chunk-size warning remained.
- `npm test`: 319 files passed, 5,528 tests passed, 5 credential-gated tests
  honestly skipped.
- Generated CLI, server and Dashboard bundles matched the frozen commit.
- `git diff --check 2394ac71...c490ee2`: passed.
- `npx openspec validate related-session-memory --strict`: passed.
- Isolated `npx openspec archive related-session-memory --yes --json`
  rehearsal passed and applied six requirements.
- A repository-wide strict validation still reports seven unrelated,
  pre-existing spec failures: `automation-loop-init`,
  `declarative-document-governance`, `effective-workflow-plan`,
  `live-dashboard-project-anchor`, `simple-task-routing`,
  `skill-content-resolution`, and `workspace-verification-integrity`.

No external secret or production operation is required for either repair.
