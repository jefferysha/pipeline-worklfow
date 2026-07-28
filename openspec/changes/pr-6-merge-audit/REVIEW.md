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
