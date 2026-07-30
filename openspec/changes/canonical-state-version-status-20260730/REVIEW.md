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

## Verify return loop: mixed-project visibility

The first frozen Verify at `fb47fda23605aa50c340b712b09b681afb278b1f` failed after the independent
reviewer found one High: the server preserved readable sibling Changes beside a compatibility issue,
but Dashboard progress/rules selectors skipped every `ok=false` project and Projects classified the
project as wholly unreachable.

### Red

- Added mixed-project regressions for project selection, Progress plus frozen workflow rules,
  Projects navigation, and the App shell.
- The initial focused run failed in `progressModel`, `ProjectsView`, and `App` for the intended
  reason: the readable sibling was absent and the project remained in the unreachable section.
- Renamed `projectSelectionModel.test.ts` to `.test.tsx` so it is actually discovered by the
  Dashboard Vitest configuration.

### Green and refactor

- Added `isProjectNavigable(ProjectSnapshot)` as the single structured exception to ordinary
  `ok=false`: a project with a non-empty `compatibilityIssues` array remains navigable because the
  server deliberately retains readable siblings and Progress owns the upgrade notice.
- `resolveProjectSelection`, `selectProgress`, `workflowRulesFromSnapshot`, and `buildProjectRows`
  now consume that predicate. Generic unreachable projects without compatibility issues remain
  excluded, and Workbench mutation routing remains restricted to `project.ok`.
- Focused recheck: 4 files, 123/123 tests; `typecheck:web` and `git diff --check` passed.

### UI quality re-review

The fix changes only project classification and reuses the existing Project row, Progress canvas,
and compatibility notice. It introduces no new visual primitive, copy, spacing, motion, or control.
The existing semantic button, visible focus, bilingual notice, loading/error/empty states, and token
usage remain intact. Critical: 0. High: 0. Medium: 0. Low: 0 after the behavioral fix.

### Repository evidence hygiene

The full hygiene gate exposed that the new fixed upstream-research path was not yet in the
capability-scoped reference allowlist. A failing node-test was added first, then the checker was
extended to allow only the two approved upstream identities in that one research file. Source,
design, and unrelated documentation paths remain rejected, as does the third restricted identity.
The focused test passes 9/9 and the live repository hygiene scan passes.

## Second Build convergence: read-only compatibility boundary

The independent Standards + Spec review rejected the first mixed-project fix with two High and
three Medium findings:

- the global readable-project selection also exposed Progress create/transition/cancel and AFK
  mutations, violating the design's refresh-only recovery contract;
- a project with both ordinary corruption and a future-version issue was treated as healthy,
  hiding the ordinary error;
- the decision badge still skipped readable siblings, `compatibilityIssues` had no explicit
  response bound, and the permanent public contract was not updated.

### Red

- Added regressions for mixed corruption + future version, read-only Progress actions, AFK routing,
  readable sibling decision badges, Projects classification, strict decoder bounds, and a real
  server project with 101 future-version Changes.
- The first Dashboard run failed 6 tests while 157 passed, and the server bound test failed with
  101 returned issues instead of 100. Each failure matched the intended missing boundary.

### Green and refactor

- `isProjectNavigable` now accepts the compatibility exception only when `project.error` is absent.
  Progress can still show readable siblings, but App passes an explicit read-only capability that
  removes create and drawer actions; AFK and Workbench require `project.ok=true`.
- `selectInbox` consumes the same readable projection, so the navigation badge matches visible
  sibling Changes without reopening mutation paths.
- Server projection sorts directory entries before collection, returns at most 100 compatibility
  issues, and adds a path-free project error when more are omitted. The Dashboard decoder rejects
  responses above the same bound.
- `docs/CONTRACT.md` now records the typed kernel error, bounded snapshot DTO, mixed-error priority,
  rolling optionality, and refresh-only Dashboard behavior.

### Final Build evidence

- Focused Dashboard: 186/186; server snapshot: 31/31.
- Dashboard full: 71 files, 1232/1232.
- Root full: 326 files, 5790 passed, 14 honest environment skips.
- Hooks: 512/512; migration CAS: 13/13; oracle: 0 mismatches.
- `npm run build`, `typecheck:web`, strict OpenSpec validation, architecture, comments, identity,
  docs, document templates, repository hygiene, generated bundle syntax, default workflow
  freshness, and `git diff --check` all pass.

The UI continues to reuse the existing Project row, Progress canvas, native refresh button, and
upgrade notice. The only visual change is removal of write controls while the compatibility warning
is active; hierarchy, bilingual copy, focus treatment, loading/error/empty states, and desktop
layout remain unchanged. Critical: 0. High: 0. Medium: 0. Low: 0 after the fixes.

## Final Build convergence: trusted write eligibility

The second full-diff re-review found two remaining High issues at the same trust boundary:

- the Dashboard decoder accepted contradictory projects that claimed `ok=true` while also carrying
  a compatibility issue or ordinary error, which could re-enable write surfaces for an untrusted
  response;
- AFK relied on an effect to redirect a compatibility-only project after render, allowing its
  write-capable view to mount transiently.

### Red

- Added a project-selection regression for positive write eligibility. It failed because the shared
  predicate did not yet exist.
- Added strict boundary cases for `ok=true` plus a compatibility issue and `ok=true` plus an error.
  The decoder accepted the first contradictory response.
- Strengthened the mixed-project App regression to prove that AFK never appears and no
  `/api/automation?root=` request is issued.

### Green

- `decodeProject` now rejects every `ok=true` response that also carries a non-empty compatibility
  issue list or a defined error.
- `isProjectWritable` centralizes the positive `project.ok === true` check for Workbench, Progress
  capabilities, the redirect effect, and the synchronous AFK mount gate.
- Focused recheck: project selection, boundary decoders, and App shell pass 79/79.

## Third Build return loop: bounded compatibility truth

The second frozen Verify at `185f0a0d602b5a5f5a16cdcb41876e592e2ccdd7` failed with three Medium
findings:

- Machine described a compatibility-only project as unreadable and skipped the automation risk on
  its readable sibling;
- the 101st future-version issue became a free-text project error, making every readable sibling
  unreachable instead of preserving a bounded typed result;
- the English HTTP 503 path displayed server-originated Chinese text and offered no generic retry.

### Red

- Added a real server fixture with 101 future-version Changes and required 100 stable structured
  issues plus an explicit truncation signal, without an ordinary project error.
- Added strict decoder cases for the literal truncation marker and its exact 100-item invariant.
- Added bilingual notice regressions, a readable-sibling Machine regression, and an App regression
  proving an English 503 never leaks Chinese text and can recover through the existing refresh
  channel.
- The focused tests failed for each missing contract before implementation: no server truncation
  signal, dropped decoder signal, missing omitted-copy, skipped sibling automation risk, and leaked
  server text.

### Green and refactor

- The snapshot DTO now exposes optional literal `compatibilityIssuesTruncated: true`. The server
  sorts entries, returns at most 100 structured issues, and sets that marker only when more issues
  were omitted; it no longer converts valid overflow into an ordinary project error.
- The Dashboard decoder accepts the marker only when it is exactly `true` and accompanies exactly
  100 issues. Progress renders bilingual omitted-copy while keeping refresh and readable siblings.
- Machine reserves project-unreadable for an actual `project.error` and still evaluates readable
  sibling automation risks for compatibility-only projects.
- `useSnapshot` retains the HTTP status while App owns presentation-localized generic error copy.
  `SnapshotInlineError` exposes a semantic Retry button wired to the same refresh channel and
  disabled during loading.
- The architecture gate exposed `ProgressView.tsx` above the 600-line limit, so the inline error
  was extracted into `SnapshotInlineError.tsx`; the recheck passed across 672 source files.

### Final Build evidence

- Server snapshot: 31/31; focused Dashboard: 86/86; App plus Progress refactor: 116/116.
- Dashboard full: 71 files, 1238/1238.
- Root full: 326 files, 5790 passed, 14 honest environment skips.
- Hooks: 512/512; adapters: 272/272; migration CAS: 13/13; bundle: 31/31;
  npx package: 39/39; legacy bridge: 1/1; oracle: 0 mismatches.
- `npm run build`, `typecheck:web`, architecture, comments, identity, docs, document templates,
  repository hygiene, default workflow freshness, generated bundle syntax, Skill verification, and
  `git diff --check` pass.
- Exact production assets: Dashboard `index-Cm7t-_BA.js`,
  `dist/index.html` SHA-256 `cbc1dbe4edcdae8a24728f9a9a4918c8d4caf9597971c5ec2017599729c59b2c`,
  server bundle SHA-256 `ceeff0820dc89e06562716e9d1f185990e250eb31e250cd545cd03f4c5e782ec`,
  and CLI bundle SHA-256 `63b273ae7a1fe33308df7ba871332e8505cc265a3a7bb2b735b48dad805fc2c8`.

### Browser and UI quality re-review

The v3 production-browser matrix passed at 1440×900 and 1024×768 in Chinese and English.
It covered baseline identity, zero global horizontal overflow, compatibility-only read-only
permissions, loading and disabled retry, strict empty state, keyboard Tab/Shift+Tab/Enter with
visible focus, localized English HTTP 503 plus successful generic Retry recovery, exactly 100
issues with bilingual omitted-copy and a readable sibling, and Machine automation-failed risk.
Network writes, AFK writes, console errors, and page errors were empty. The repository fingerprint
matched before and after, and evidence is retained outside the worktree at
`/tmp/tenon-version-status-visual-v3/`.

The new presentation remains within the existing notice, Machine risk row, and inline-error
patterns. Bilingual hierarchy, semantic controls, focus visibility, state distinctions, desktop
layout, and token usage all pass the frontend-design, web-design-guidelines, and
design-taste-frontend re-review. Critical: 0. High: 0. Medium: 0. Low: 0.

## Fourth Build convergence: retained snapshot recovery

The next full Standards + Spec review passed the canonical version boundary but found one Medium
and one Low in the global snapshot recovery contract:

- after a snapshot had loaded, a refresh failure was visible only inside Progress; Projects,
  Machine, AFK, and Workbench silently retained stale content without a localized failure state or
  generic retry;
- a successful HTTP 200 response with an invalid decoded body was labeled as an HTTP 200 failure.

### Red and green

- Added an App regression that loads a real snapshot, navigates to Projects, drives the product's
  EventSource reconnect and refresh path into a 503, and requires the retained Projects content,
  localized alert, generic Retry, and recovery to coexist. It failed because no alert rendered.
- Added a client regression requiring a 2xx decode failure to omit HTTP status. It failed because
  `ApiError.status` was 200.
- App now renders `SnapshotInlineError` for retained-snapshot failures in every snapshot-dependent
  non-Progress view; Progress retains its existing local placement and Host Plan remains
  independent.
- `fetchSnapshot` assigns status only to non-2xx transport failures. Decoder-invalid 2xx responses
  now select the localized unknown/generic presentation instead of claiming HTTP 200 failed.
- Focused App plus client recheck passed 85/85; `typecheck:web`, architecture, and
  `git diff --check` passed.

### Browser return and pending-state fix

The v4 production-browser return verified the 503, retained Projects, generic Retry recovery,
invalid-200 copy, keyboard Enter, empty console, and zero write requests, then found one Medium:
starting Retry cleared the error immediately, so a paused request had neither a visible alert nor
a disabled/loading control.

A failing App regression then held the retry promise open and required the existing alert and
button to remain mounted with the button disabled. `useSnapshot` now preserves the previous error
through the pending request and clears it only on a successful snapshot or replaces it with the
new failure. Focused App, `useSnapshot`, and client tests passed 89/89.

The final build passed:

- Dashboard full: 71 files, 1240/1240. One unchanged Progress drawer timing test failed once under
  full-suite load, then passed 64/64 in isolation and the immediate full rerun passed 1240/1240.
- Root full: 326 files, 5790 passed, 14 honest environment skips.
- `npm run build`, `typecheck:web`, architecture, and `git diff --check` pass.
- Exact final assets: Dashboard `index-DFk9L5Z3.js`,
  `dist/index.html` SHA-256 `69087e2563e8957fd1ba48b855560a7d6d06448483dc49547d5331844e8fc117`,
  server bundle SHA-256 `ceeff0820dc89e06562716e9d1f185990e250eb31e250cd545cd03f4c5e782ec`,
  and CLI bundle SHA-256 `63b273ae7a1fe33308df7ba871332e8505cc265a3a7bb2b735b48dad805fc2c8`.

The v5 production-browser matrix passed the final stable asset: English Projects retained its
real project content beside a localized 503; Enter-triggered Retry kept the alert and button
visible with the button disabled while the request was paused; success removed the alert; invalid
HTTP 200 content used generic unknown copy without `HTTP 200`. Console and page errors and write
requests were empty. Browser interception was cleared, and the repository fingerprint matched
before and after at
`workspace:sha256:eab016f14c3b1def8f7f3ecfb4089c235f45efdd366b6aa0e6f5f59b66b8ffe1`.
Evidence is retained outside the worktree at `/tmp/tenon-version-status-visual-v5/`.

The retained-data alert reuses the same semantic error/retry component in the existing page frame;
it adds no new visual language or motion. Localization, stale-data visibility, pending feedback,
keyboard behavior, focus styling, desktop layout, and token use pass the frontend-design,
web-design-guidelines, and design-taste-frontend re-review. Critical: 0. High: 0. Medium: 0. Low: 0.
