# Canonical State Version Status Build review

## Scope

This review covers the kernel canonical decoder, server snapshot projection, Dashboard boundary and
Progress UI, bilingual copy, generated bundles, and the OpenSpec design for
`canonical-state-version-status-20260730`.

The UI pass used `frontend-design`, `web-design-guidelines`, and `design-taste-frontend`; the
correctness pass used `code-review` and checked compatibility, failure ordering, information
disclosure, mixed-project behavior, and the existing refresh/error boundaries.

## Correctness and security review

- The decoder parses JSON and proves only a safe integer `schemaVersion` above the exported current
  version before the v1 closed-schema check. Missing, string, fractional, unsafe, lower, and
  malformed current versions remain `RunStateCorruptError`.
- The typed incompatibility error is caught by class identity, not message parsing. The snapshot
  exposes only Change name, found/supported versions, a stable kind, and `upgrade-runtime`; local
  canonical paths, raw JSON, exception text, and future fields are not projected.
- A future Change fails closed without being decoded or counted, while readable sibling Changes
  remain available. Issues and Changes are sorted deterministically.
- The Dashboard treats the response field as optional for rolling compatibility and rejects
  unknown/extra fields, invalid numbers, invalid enums, blank or duplicate Change names.
- The notice is read-only and reuses the existing snapshot refresh. It never invokes an update,
  mutation endpoint, or a second transport.

## Visual and interaction review

- Production Dashboard identity: `Tenon Dashboard` at `http://127.0.0.1:18932`, serving this
  worktree's built server and Dashboard assets. The real snapshot identified
  `/Users/a1234/.codex/worktrees/ff60/pipeline-worklfow` and
  `canonical-state-version-status-20260730`.
- Forward-version fixture: one bounded `unsupported-canonical-version` issue, injected only at the
  browser network boundary; repository and canonical state were not modified.
- 1440×900 and 1024×768 both showed the warning, Change name, version comparison, upgrade command,
  and refresh action without page-level horizontal overflow.
- Chinese and English copy, disabled `正在刷新状态…` / `Refreshing status…`, strict empty snapshot,
  and HTTP 503 recovery state were exercised. The production console contained no errors.
- Browser pointer refresh issued the existing `/api/snapshot` request and showed its disabled
  loading state. The in-app browser's keyboard injector did not dispatch Tab/Enter events despite
  retaining focus on the native button; a Testing Library user-event regression therefore verifies
  actual Tab focus and Enter activation at the DOM boundary.

## Findings and fixes

### Keyboard regression coverage

- Severity: Medium.
- Evidence: the specification requires a keyboard-only refresh path, while the first component
  test covered pointer activation only.
- Fix: add a `userEvent.tab()` then `{Enter}` regression that asserts focus reaches the native
  refresh button and calls the shared refresh exactly once.
- Recheck: the component suite passes 3/3; browser inspection confirms the control is a unique,
  enabled native button with the expected accessible name and visible focus-ring classes.

### Canonical codec size boundary

- Severity: Medium.
- Evidence: the first implementation placed the version constant and typed errors in
  `run-revision-codec.ts`, increasing the storage/codec module to 519 lines and failing the
  repository's 500-line architecture gate.
- Fix: move version/error/record-validation primitives into `run-revision-validation.ts`; keep the
  public exports through `run-revision-store.ts` and `state/index.ts`.
- Recheck: the codec is 498 lines, architecture scans 671 production files successfully,
  kernel/server focused tests pass 62/62, and the complete build plus root suite pass.

## Final disposition

Critical: 0. High: 0. Medium: 0. Low: 0. Both Build-review findings were fixed and rechecked.
