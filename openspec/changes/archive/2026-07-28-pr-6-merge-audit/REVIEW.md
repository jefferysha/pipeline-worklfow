# PR #6 Build review

## Review scope

- Compared the complete `origin/main...HEAD` delta with the audit proposal, delta spec,
  implementation plan, original archived Change evidence, and the latest shared Dashboard shell.
- Reviewed the semantic merge in `shared/Dialog.tsx`, generated Dashboard/server/CLI artifacts,
  formatter/kernel/API/client/UI boundaries, tests, error paths, nested modal behavior, localization,
  accessibility, rollback, and verification-governance non-interference.
- Exercised the built Dashboard at `http://127.0.0.1:18976/` with product version `1.0.1` and the
  registered root `/Users/a1234/.codex/worktrees/8d07/pipeline-worklfow`.

## Findings and disposition

### Resolved during Build

1. **High — PR head conflicted with the latest `main`.**
   - `shared/Dialog.tsx` and generated Dashboard HTML conflicted after PR #5 merged.
   - Resolved with a normal merge commit. The shared Dialog keeps the localized close label and
     topmost-event propagation guard while using the shared Lucide `X`; generated assets were
     rebuilt from source rather than hand-edited.

2. **Medium — workspace close control regressed to a hand-authored glyph.**
   - Added an exact red test requiring a localized label and `svg.lucide-x`.
   - The test failed on the PR head and passed after the semantic merge fix.

3. **Build-order diagnostic — partial package builds used stale kernel output.**
   - A web/server-only sequence exposed missing formatter exports in stale workspace output.
   - The official root `npm run build` rebuilt packages in dependency order and passed; all generated
     artifacts now derive from the merged source.

4. **Medium — tracked Dashboard dist was not reproducible from the merged source.**
   - Independent Rules/Architecture review rebuilt the exact commit in isolation and found the
     tracked CSS retained a stale `--tracking-tight` token, so the asset hashes and HTML references
     differed from a fresh build.
   - Reproduced in the primary worktree with `npm run build:web`, then ran the official root
     `npm run build`. The tracked Dashboard assets now use the reproducible
     `index-CsOnyT-V.js` / `index-De9VVOJA.css` pair after the keyboard and localization fixes;
     server and CLI bundles remained byte-identical.

5. **Medium — topmost Dialog could lose its Tab boundary after a focused child disappeared.**
   - Independent Spec and Visual reviews confirmed that removing or disabling the active control
     can move focus to `body`; the previous trap only wrapped when focus exactly matched the first
     or last focusable element.
   - Added a red forward/reverse regression, then changed the shared Dialog to pull out-of-container
     focus back to its first/last focusable element (or the container when none exist). The exact
     test now passes.

6. **Medium — readonly Markdown manual-copy fallback lacked a visible focus indicator.**
   - Added a red class contract for the output textarea, then supplied a visible
     `focus-visible` accent border and ring while retaining the selectable readonly value.
   - The focused Dialog/composer suite passes 21/21; full Web passes 56 files / 1005 tests.

7. **Low — root-level structured API errors used a literal English fallback in Chinese.**
   - Added a red localization regression for an empty error path, then introduced localized
     `request body` / `请求体` labels instead of falling back to the English word `request`.
   - The regression now passes in both locales.

8. **Low — the implementation plan named a nonexistent CLI build script.**
   - Independent Spec review found `npm run build:cli`, which is not declared in the root package.
   - Corrected the executable plan to use the repository's actual `npm run bundle` command; this
     is a command-name correction and does not change requirement semantics.

### Open findings

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

The existing Vite large-chunk warning and React test diagnostics are baseline observations, not
new correctness or UX defects in this delta.

## Real behavior evidence

- Dashboard identity: title `Tenon Dashboard`, health `ok=true`, version `1.0.1`, exact registered
  project root and audit Change visible.
- Shared Dialog: initial focus lands in the first field; Escape closes only the topmost dialog and
  returns focus to the `新建` trigger.
- Theme/layout: live dark and light themes both apply; at the 1280px browser viewport,
  `documentElement.scrollWidth === innerWidth === 1280`.
- The Verify-only composer matrix is intentionally deferred until the exact Build SHA enters Verify,
  so the browser test uses the real phase gate instead of a fabricated state.

## Build verification

- `npm run typecheck:web`
- `npm run test:web` — 56 files, 1005 tests after review regressions
- `npm test` — 317 files, 5465 passed, 5 credential-gated skips on the exact final source
- `npm run build`
- architecture, comments, repository hygiene, docs, identity, npx package, and default-workflow
  freshness checks
- hooks 482/482, adapters 272/272, bundle 31/31, skill registry verification
- strict OpenSpec validation for `pr-6-merge-audit` and `verification-evidence-composer`

## Initial Build review result

PASS at `986de487797c8df816518dd95f1c694f47a8503a`.

- Spec/Correctness: Critical 0 / High 0 / Medium 0 / Low 0.
- Rules/Architecture: Critical 0 / High 0 / Medium 0 / Low 0.
- Visual/Accessibility: Critical 0 / High 0 / Medium 0 / Low 0.

The final product source and generated assets are unchanged from the isolated reproducibility and
real-browser review baseline; the later commit only corrected the executable plan command and
recorded the required Tenon Spec return loop.

This result was subsequently superseded by the first frozen Verify at
`7280dd3d45be69e88a695b82580ea2c5b3779f88`, which correctly failed and returned the Change through
Spec to Build. The failure report is
`docs/superpowers/reports/2026-07-28-pr-6-merge-audit-verify-fail.md`.

## First Verify return-loop repairs

### Resolved during the second Build visit

1. **Medium — shared document surface imported the verification feature.**
   - `TaskDocumentsSection` now accepts only a neutral `ReactNode` slot.
   - `TaskDetail` forwards a neutral `documentsExtra` slot and `ProgressDrawer`, which owns the
     phase/root/locale/toast context, conditionally composes the Verify-only feature.
   - Architecture and the existing ProgressView integration matrix pass with the dependency
     direction restored.

2. **Medium — canonical title whitespace was trimmed.**
   - Kernel normalization now uses trim only to reject blank titles while preserving legal
     leading/trailing whitespace, Tab, newline and normalized CRLF content.
   - The UI sends the title draft byte content unchanged. Kernel, UI and real HTTP regressions
     confirm the preservation behavior.

3. **Medium — active compose requests could update a reopened dialog.**
   - The API client accepts `AbortSignal`.
   - The composer aborts on close/unmount and uses monotonic request identity so late resolve or
     reject paths cannot change a newer session.

4. **Low — absent or non-string root could fall through to root resolution.**
   - The route now rejects missing, blank and non-string `root` with a stable
     `verification_evidence_invalid` 400 envelope before calling the registered-root resolver.

5. **Low — structured field errors were not associated with their controls.**
   - Entry controls now expose stable evidence paths; the first matching invalid field receives
     `aria-invalid`, `aria-describedby` and focus while the live summary remains available.

6. **OpenSpec apply failure — the audit MODIFIED Requirement omitted an existing scenario.**
   - The delta now carries the complete existing keyboard scenario plus the new shared-slot,
     root, request-lifecycle and field-error scenarios.
   - A fresh isolated archive/apply changed two requirements, left the real capability digest at
     `39829bf745e187ee03849579099216912a8e736cdde830a4dd34c48ac3ae8fe5`, and produced a strict-valid
     isolated capability digest `927a7d42955acca081d559b92dac862fb6a4c81d704ae302143387f16d523bfc`.

### Second Build verification

- Targeted kernel/server: 292/292 passed.
- Targeted API/composer/progress: 67/67 passed.
- Full Web: 56 files / 1006 tests passed.
- Full repository: 317 files / 5466 tests passed, with 5 credential-gated skips.
- `npm run build`, Web typecheck, architecture, comments, docs and repository hygiene passed.
- Hooks 482/482, adapters 272/272, bundle 31/31 and Skill registry verification passed.
- Change and capability strict OpenSpec validation passed.
- Current production server at `http://127.0.0.1:18977/` served `Tenon Dashboard`, product
  version `1.0.1`, exact registered root and the rebuilt `index-C2cHWZ4f.js` asset.
- Real HTTP returned stable 400 envelopes for missing/non-string root, preserved title whitespace
  in Markdown, and left canonical state/document-ledger digests unchanged.
- The real Build-phase detail correctly hid the Verify-only composer, retained 1280px viewport
  width without horizontal overflow, and focused the localized detail close control.

## Current pre-Verify review status

PASS on the complete second-Build worktree relative to base
`2394ac71efc87193350d476266a3219c320bb5b1`.

- Spec/Correctness: Critical 0 / High 0 / Medium 0 / Low 0.
- Rules/Architecture/Security: Critical 0 / High 0 / Medium 0 / Low 0.
- Visual/Accessibility: Critical 0 / High 0 / Medium 0 / Low 0.

The first Visual re-review found one Low test-coverage gap: the neutral slot unit test still claimed
to prove the production Verify phase gate, while the ProgressView integration suite covered only
the Verify-positive path. The test was renamed to its actual neutral-slot scope, and a production
`ProgressView → ProgressDrawer → TaskDetail` parameterized regression now proves `build=false` and
`verify=true`. The same reviewer re-ran 65 focused tests, Web typecheck and diff check, then cleared
the Low finding.

The final reviewers covered all 211 base-diff product/test/document/spec/governance/generated paths,
the latest uncommitted return-loop changes, 347 JSON/JSONL values, dependency direction, trust
guards, concurrency, compatibility, rollback, accessibility and isolated reproducibility. Their
independent evidence included:

- full repository 317/317 files with 5466 passing and 5 credential-gated skips;
- kernel/server 292/292 and frontend API/composer/progress/Dialog 79/79;
- architecture across 626 production files, comments, typecheck, diff check and strict OpenSpec;
- isolated root build with Dashboard/server/CLI artifacts byte-identical to the tracked output;
- isolated OpenSpec archive/apply with two modified requirements and unchanged live main-spec digest.

The pre-Verify source/review conclusion is final. The exact committed SHA, non-force remote update
and fresh GitHub CI result remain Build exit evidence and must be recorded before freezing Verify.

This result was subsequently superseded by the second frozen Verify at
`a08e5ed3a3fb58a59c3de6ff9b377aab8c7af8aa`, which correctly failed and returned the Change to
Build. The failure report is
`docs/superpowers/reports/2026-07-28-pr-6-merge-audit-verify-fail-2.md`.

## Second Verify return-loop repairs

### Resolved during the third Build visit

1. **Medium — the kernel invoked methods on an untrusted entries array.**
   - Added a red adversarial regression covering sparse arrays, accessor-backed indices, named and
     symbol extensions, an overridden `flatMap`, and a mutated prototype.
   - The composer now canonical-snapshots only dense ordinary arrays through own data descriptors,
     copies them to a trusted frozen array, and normalizes entries with an explicit loop. It rejects
     malformed array containers without invoking their getters or methods.

2. **Medium — a valid ungoverned workflow could hide the Verify composer.**
   - Added a red production-path regression through
     `ProgressView → ProgressDrawer → TaskDetail` with `documents.governed=false`.
   - Governed workflows still render the normal document surface and its neutral extra slot.
     Ungoverned workflows now render an independent neutral verification-tools slot, so a real
     Verify step remains usable without fabricating document governance.

3. **Low — stale late rejection was not directly covered.**
   - Added the missing regression where an old request rejects after a reopened session already
     succeeded.
   - The existing monotonic request identity and abort behavior correctly preserved the newer
     Markdown result and left the dialog open.

4. **Medium — revoked proxies could escape the public kernel trust boundary.**
   - Independent Rules/Architecture/Security review proved that an `Array.isArray` call outside the
     guarded snapshot path threw for revoked top-level and entries proxies.
   - Red regressions reproduced both throws. Record and array classification now run inside the
     guarded snapshot boundary and return closed `not_array` / `invalid` / `too_many` / `ok`
     outcomes, so the exported `unknown` API always returns a bounded composition result.

5. **Medium — an oversized entries array was copied before the declared limit was enforced.**
   - The review measured avoidable work on a 100,000-entry input and showed that the old path reached
     `ownKeys` and copied every descriptor before returning `entries_too_many`.
   - A red proxy regression observed the premature enumeration. The snapshot now checks the safely
     read length against `maxEntries` before `ownKeys`, index descriptor reads or allocation.

### Third Build verification before independent review

- Focused kernel composer: 15/15 passed.
- Focused frontend production path and request lifecycle: 67/67 passed.
- Full repository: 317/317 files, 5469 passing and 5 credential-gated skips.
- Full Web: 56/56 files, 1010/1010 passed.
- Official root build, Web typecheck, architecture, comments, docs, document templates,
  repository hygiene, identity, npx package, default-workflow freshness and diff check passed.
- Hooks 482/482, adapters 272/272, migration CAS 13/13, bundle 31/31 and Skill inventory passed.
- Strict OpenSpec validation passed for both `pr-6-merge-audit` and
  `verification-evidence-composer`.
- The full repository suite passed when run serially with no competing sandcastle image writer.
  This resolves the prior stale-image failure as an environment race rather than a product defect.
- The rebuilt production server at `http://127.0.0.1:18978/` served `Tenon Dashboard`, the exact
  registered root and `index-CMPmAaKx.js`. The current real Build phase correctly hides the
  phase-gated composer.

## Current third pre-Verify review status

PASS on the complete third-Build worktree relative to base
`2394ac71efc87193350d476266a3219c320bb5b1`.

- Spec/Correctness: Critical 0 / High 0 / Medium 0 / Low 0 across 258 mutually exclusive paths.
- Rules/Architecture/Security: Critical 0 / High 0 / Medium 0 / Low 0 after the two Medium
  trust-boundary findings were fixed and independently re-probed.
- Visual/Accessibility: Critical 0 / High 0 / Medium 0 / Low 0 across the real Build-hidden and
  governed Verify journeys, field ARIA/focus, stale-request cancellation, nested keyboard behavior,
  responsive layouts, themes, locales and reduced motion. Evidence is under
  `/private/tmp/pr6-build3-visual.1vuw78`.

The Spec reviewer reproduced the five formal Dashboard/server/CLI artifacts byte-for-byte in an
isolated root. The Rules reviewer independently proved revoked and throwing proxies return stable
errors, and a 100,000-entry proxy returns `entries_too_many` without `ownKeys` or index-descriptor
reads. Product/review evidence commit `40892e0bab9f1f7302352ddc67ab60dfe29adacd` was fast-forward
pushed without force and exact-head GitHub CI run `30369887369` passed in 7m29s, including build
freshness, clean install, full repository and Dashboard tests, hooks, adapters, Skill inventory,
migration CAS, N-1 bundle and golden oracle. GitHub reports the PR MERGEABLE/CLEAN. The final
governance commit and its fresh exact-head CI remain required before freezing the third Verify.

## Third Verify return-loop repair

The third frozen Verify correctly failed with one High visual/interaction finding. The nested
evidence composer was rendered inside the transformed right drawer, so its fixed overlay covered
only the 559-pixel drawer instead of the viewport. A real pointer click on the exposed parent
scrim closed both the parent drawer and composer, removed the `change` route parameter, and lost a
non-empty draft. The registered failure report is
`docs/superpowers/reports/2026-07-28-pr-6-merge-audit-verify-fail-3.md`.

### Fourth Build implementation evidence

- A red `ProgressView` production-path regression proved the overlay was not owned by
  `document.body`. It also encoded the required parent-drawer survival and draft-preservation
  behavior.
- The shared Dialog now renders its overlay through a body portal. The outer progress drawer's
  Escape handler recognizes any active document-level modal and defers ownership to that modal.
- The focused Progress integration suite passed 57/57 after the repair. Full Web passed 56/56 files
  and 1011/1011 tests, Web typecheck passed, the official production build passed, and the full
  repository passed 317/317 files with 5469 tests and five honest credential-gated skips.
- The production artifact changed from `index-CMPmAaKx.js` to `index-D8Bc1TJ1.js`; the stylesheet
  remained `index-De9VVOJA.css`.

### Dashboard design and browser evidence

The user explicitly requires `design-taste-frontend` to cover Dashboard work. This review therefore
does not apply the skill's ordinary Dashboard exclusion. The established B2B engineering Dashboard
is preserved with `DESIGN_VARIANCE=3`, `MOTION_INTENSITY=2`, and `VISUAL_DENSITY=7`; existing Tenon
tokens, component geometry, dark/light themes, typography and interaction language remain the
source of truth. The repair changes modal ownership and hierarchy only, with no new visual system.

A real Codex in-app browser exercised the rebuilt production assets from an isolated Verify fixture:

- at 1440x900, the drawer remained x=880, width=560 while the composer overlay was a direct body
  child at x=0, y=0, width=1440, height=900;
- clicking x=100, y=450 closed only the composer, preserved the parent drawer and
  `change=pr-6-merge-audit`, and reopening restored `DRAFT_MUST_SURVIVE`;
- Escape closed only the composer, kept the route and drawer, and restored focus to
  `evidence-compose-open`;
- at 390x844, the overlay remained 390x844 and the panel was x=16, width=358, with document
  scroll width equal to client width;
- browser warning and error logs were empty.

The inspected screenshots are outside the repository at:

- `/private/tmp/pr6-build4-browser-20260728/01-portal-before-outside-click.png`
- `/private/tmp/pr6-build4-browser-20260728/02-portal-after-reopen-draft-preserved.png`
- `/private/tmp/pr6-build4-browser-20260728/03-mobile-390-portal.png`

For this narrow repair, the current design-taste and accessibility inspection has no remaining
Critical, High, Medium or Low finding. This is implementation evidence, not the fourth
pre-Verify PASS: complete Standards, Spec, frontend/backend architecture, security, shared Dialog
call-site review, fresh static gates, commit/push and exact-head GitHub CI remain mandatory.

## Fourth pre-Verify review status

PASS on the complete fourth-Build worktree relative to base
`2394ac71efc87193350d476266a3219c320bb5b1`, after one Medium review finding was fixed.

### Finding resolved during review

1. **Medium — the Workbench switch-confirm animation could not resolve a body-portal Dialog.**
   - The shared Dialog repair moved the overlay outside the Workbench `rootRef`, but
     `revealDialog` still received two string selectors scoped to that root. Real Web test logs
     reported both GSAP targets missing and the entrance animation no longer ran.
   - A red Workbench regression opened the real dirty-switch journey, proved the overlay was a body
     child, and failed on the GSAP warning. The Workbench now explicitly resolves the portal
     backdrop and dialog nodes and passes the elements to `revealDialog`. The regression and full
     Workbench file pass 72/72 with no switch-confirm target warning.
   - A fresh in-app browser loaded the rebuilt `index-CGj7mXYA.js` in the isolated fixture, created
     a temporary editable workflow, made it dirty and switched toward `default`. The real
     switch-confirm portal finished at backdrop `opacity: 1` and panel
     `transform: translate(0px, 0px); opacity: 1`; warning/error logs were empty. The temporary
     workflow was deleted from the fixture after the check.

### Final review coverage

- **Spec/Correctness — C0/H0/M0/L0.** The third Verify High is reproduced by its frozen report and
  is closed by the body-portal ownership test, real outside-pointer journey, Escape ownership,
  focus restoration, route preservation and draft preservation.
- **Rules/Architecture — C0/H0/M0/L0.** All shared Dialog call sites were inspected. The portal
  stays in the shared presentation layer; Progress owns only drawer state; Workbench animation
  receives concrete DOM elements without widening its GSAP context. No frontend-to-backend reverse
  dependency, public export drift or new abstraction was introduced.
- **Backend/Security — C0/H0/M0/L0.** The kernel still canonical-snapshots untrusted records and
  arrays without invoking accessors or overridden methods, caps input/error/output work, and emits
  fenced Markdown. The server uses the established bearer/content-type/body limits and validates
  the workflow root anchor both before and after composition. The fourth-Build portal changes do
  not alter API, persistence, logging, secrets, authorization or dependency surfaces.
- **Dashboard design/accessibility — C0/H0/M0/L0.** Under the user's explicit Dashboard coverage
  requirement, `design-taste-frontend` preserve mode used `DESIGN_VARIANCE=3`,
  `MOTION_INTENSITY=2`, and `VISUAL_DENSITY=7`. Desktop and 390-pixel mobile screenshots preserve
  the established visual language; the overlay hierarchy, keyboard ownership, focus, responsive
  fit and console are clean.

### Fresh fourth-Build evidence

- Full repository JSON result: 1388/1388 suites, 5469 passed, 5 credential-gated pending, 0 failed.
- Full Web: 56/56 files and 1012/1012 tests; Web typecheck passed.
- Kernel composer plus server route: 295/295 targeted tests.
- Official root build passed and produced `index-CGj7mXYA.js`, `index-De9VVOJA.css`, server and CLI
  bundles.
- Hooks, migration CAS, adapters, Skill inventory and bundle passed at 482, 13, 272, complete
  inventory, and 31 checks respectively.
- Architecture over 626 production files, comments, docs, document templates, repository hygiene,
  identity/interaction, npx package, default-workflow freshness, strict OpenSpec and diff check
  passed.
- Golden oracle completed all five fixtures with zero unrecognized difference; only the recorded
  in-place isolation and PM auto-queue product evolutions were classified as known.
- `origin/main` remains exactly `2394ac71efc87193350d476266a3219c320bb5b1`; PR #6 is OPEN,
  non-Draft, MERGEABLE/CLEAN at the prior remote head.

The optional separate `codex review --base` subprocess was attempted and honestly stopped by the
account usage limit before producing a review. It is not recorded as passing. The current Codex
host performed the complete review above, and the third frozen head already had an independent
Codex track; the fourth Verify must still re-run its required Codex track against the new frozen
head. Product/review commit, non-force push and fresh exact-head GitHub CI remain Build exit
evidence.

Product/review commit `0fa7f16d9466cfca68e1f33d5fe0f41ca4d178ed` was fast-forward pushed
without force. Exact-head GitHub CI run `30376107239` passed in 7m27s: build/release freshness,
clean install, documentation, sandcastle attestation, full repository and Dashboard tests, hooks,
adapters, Skill inventory, migration CAS, N-1 bundle, bundle smoke and golden oracle all passed.
The repository-secret-gated real-Codex H14 step used its explicit honest-skip path. The fourth Build
review is now eligible for canonical `pre_verify_review_result=pass`; a final governance commit and
its own fresh exact-head CI remain required before freezing Verify.
