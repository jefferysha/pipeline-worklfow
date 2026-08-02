# Post-merge unified review — final Verify

## Frozen baseline

- Build state commit: `70ccd7dd91bfc63dde98b6f2b6c555c5191882ed`
- Reviewed source and distribution commit:
  `f6e164379e42fe6fca77a1245bf244e453329738`
- The intervening delta contains only review documentation, tasks, and
  official Tenon ledger/state/receipt files. `packages`, Dashboard `dist`,
  `.github`, tools and package manifests are byte-identical.
- Pull request: #20, non-draft and mergeable at the frozen head.

## Verification evidence

- Root Vitest: 330 files, 5879 passed, 26 honest environment skips.
- Dashboard Vitest: 78 files, 1533 passed.
- Machine regressions: 13/13, including Docker truth, collision-safe bounded
  root identity, unique localized action names and Unicode boundary handling.
- Snapshot security: 45/45, including `O_NOFOLLOW`, 256 KiB bounded fd reads
  and TOCTOU rejection.
- Architecture: 717 production files.
- Strict OpenSpec: 38/38.
- Release contracts: 24/24.
- Typecheck, full build, hooks, adapter conformance, migration CAS, package
  smoke, golden oracle, identity, comments, documentation and repository
  hygiene all pass locally, in isolated review, or in exact GitHub CI.
- A fresh isolated E2E pass on 2026-08-02 confirmed `npm ci` with zero audited
  vulnerabilities, a byte-clean full build, 24/24 release contracts, 38/38
  strict OpenSpec checks, 58/58 server snapshot/orchestration tests, 144/144
  focused Dashboard/API/App/Machine tests, 5879 root tests and 1533 Dashboard
  tests.
- Exact GitHub CI run `30553568153` and Documentation Pages build
  `30553568176` succeeded.

## Fresh review findings (2026-08-02)

The frozen baseline does **not** pass the fresh independent review:

1. **High — Track Settings dirty callback can enter an infinite render loop.**
   `WorkbenchView.tsx` creates a new inline `onDirtyChange` callback on every
   render. `TrackSettings.tsx` includes that callback in both the reporting and
   cleanup effect dependencies, so a dirty draft alternates parent updates from
   cleanup/setup without converging. Codex repo-aware review reproduced and
   reported this as P1.
2. **Medium — edits made while a track save is in flight are silently lost.**
   `TrackSettings.tsx` snapshots the submitted draft, but `TrackEditorFields`
   remains editable while the operation is busy. A successful response closes
   the editor and discards input entered after the request began.
3. **Medium — the final main-branch baseline bypassed Spec convergence.**
   `proposal.md` and `design.md` still freeze earlier baselines and omit PRs
   #27/#28 from the coverage matrix, while `tasks.md` later expands Build to
   `a86dabb481a8d20e0c50ce8c1b421fac45f886f9`. No later
   `requirements-changed` transition returned that expanded scope to Spec.

The independent reviewer covered all 526 changed files (19,305 additions and
3,639 deletions), with full-diff SHA-256
`b4e60c06a2ec4185c19905d36600ce3c070ef9ef533fa97ec332e3fb68c88680`.
The isolated E2E result remains useful regression evidence but cannot override
the High/Medium review findings.

## Production browser acceptance

The persistent project browser loaded `index-Ci4cbgx1.js` and captured all
seven Dashboard views at 1024, 1440 and 1920 CSS pixels across Chinese/English,
light/dark and reduced-motion settings. All 21 scenes have zero document
overflow, route-loading or busy residue, mobile navigation, console errors and
CDP exceptions. Machine exposes 21/21 distinct accessible action names at every
size. The three Progress scenes retain the expected source-backed
`CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE` precheck alert on the local
non-Linux runtime. Screenshots and bounded `audit.json` are stored at
`/tmp/tenon-unified-final-dashboard-Ci4cbgx1-v6`.

## Result

Verify result: **fail**. The branch remains pending and must return through the
official `verify-fail` review gate, then use `requirements-changed` to re-enter
Spec before implementation resumes. PR #20 must not merge until the three
findings are fixed, the documents are re-frozen, and fresh Verify evidence is
green. Merge, Ship, release and Archive are not claimed by this report.
