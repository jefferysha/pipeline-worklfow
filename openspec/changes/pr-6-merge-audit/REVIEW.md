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

## Review result

Pending independent pre-Verify Spec/Correctness, Rules/Architecture, and Visual reviews against the
final committed fingerprint.
