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
- `npm run test:web` — 56 files, 1001 tests
- `npm test` — 317 files, 5465 passed, 5 credential-gated skips
- `npm run build`
- architecture, comments, repository hygiene, docs, identity, npx package, and default-workflow
  freshness checks
- hooks 482/482, adapters 272/272, bundle 31/31, skill registry verification
- strict OpenSpec validation for `pr-6-merge-audit` and `verification-evidence-composer`

## Review result

Pending independent pre-Verify Spec/Correctness, Rules/Architecture, and Visual reviews against the
final committed fingerprint.
