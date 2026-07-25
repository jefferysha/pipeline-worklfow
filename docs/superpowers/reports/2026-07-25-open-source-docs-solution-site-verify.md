# Open-source documentation solution site verification

## Scope

- Change: `open-source-docs-solution-site`
- Track: `frontend`
- First frozen baseline:
  `workspace:sha256:f09349885985fd07824d685ca37fec36ffded0cbda9686b2790e09d7c13c1cf0`
- Verification status: failed; returned to Build for correction.

## First verification cycle

### Automated checks

- `npm run build`: passed. Vite emitted the existing warning that the main
  JavaScript chunk is larger than 500 kB.
- `npm test`: passed, 290 files and 5,118 tests; five environment-dependent
  tests were honestly skipped.
- `npm run test:web`: passed, 49 files and 929 tests. Existing React `act(...)`
  warnings remain.
- `npm run check:docs`: passed.
- `npm run check:architecture`: passed.
- `npm run check:default-workflow-freshness`: passed.
- `bash tools/test-hooks.sh`: passed.
- `bash tools/test-adapters.sh`: passed, 262 checks.
- `bash tools/verify-skills.sh`: passed.
- `bash tools/test-bundle.sh`: passed, 15 checks.
- `git diff --check`: passed.

### Independent review tracks

The reviewer, Codex CLI, visual/accessibility, and runtime E2E tracks all
returned `FAIL`. The implementation must be corrected before a new baseline is
frozen.

1. Product truth
   - The Overview incorrectly classifies research as Discussion even though the
     router sends research intents to the PM/default workflow.
   - The page claims that it makes no requests although `AppShell` mounts the
     local snapshot request and SSE connection.
   - Setup copy overstates the single-location boundary.
   - The Simple shape omits the `scope-expanded → escalated` path.
2. Contract fidelity
   - Several visible eyebrow labels bypass i18n.
   - Link transitions do not opt out under reduced-motion preferences.
3. Accessibility and responsive behavior
   - The independent visual review found horizontal clipping at 320 px.
   - Switching the UI to English does not update the document `lang`.
   - The light-theme primary CTA contrast is approximately 3.30:1.
   - The heading outline jumps from `h1` to `h3`.
4. Runtime E2E
   - Health, loopback-only binding, bundle identity, operational Progress
     regression, and setup dry-runs passed.
   - The independent browser session became unstable after reload, so it could
     not independently complete the fresh Overview interaction matrix.

## Correction requirements

- Align all route, setup, request, and Simple-workflow claims with source
  contracts.
- Localize every visible label and make reduced-motion behavior explicit.
- Fix 320 px layout, language metadata, CTA contrast, and heading semantics.
- Add App-level and focused regression tests for these issues.
- Rebuild, freeze a new baseline, and rerun every required Verify track.

## Final verification cycle

### Second frozen baseline

`workspace:sha256:ca7da1be87b22efc1d542759a20411bfd622eb60bd71077176afe38d0ae756c8`

The second cycle confirmed that the first-cycle product-truth, language
metadata, CTA contrast, heading outline, localized section labels, Simple
escalation, and most narrow-layout defects were fixed. Automated checks
passed:

- `npm test`: 290 files, 5,118 passed, five honest environment skips.
- `npm run test:web`: 49 files, 932 passed.
- documentation, architecture, comment-honesty, generated-workflow,
  adapter, hook, skill, bundle, and whitespace checks all passed.
- Browser checks confirmed brand navigation, bilingual metadata, both themes,
  5.02:1 light CTA contrast, ordered headings, and zero document overflow at
  320 px.

The cycle still failed for two independent findings:

1. The long hero badge remained a non-shrinking single line. At 320 px its
   right edge reached approximately 366.8 px and was visually clipped by the
   page overflow boundary even though document-level `scrollWidth` stayed 320.
2. The new Overview brand button still used `transition-colors` without an
   explicit `motion-reduce:transition-none` override.

The Change returned to Build again. A third frozen verification cycle is
required.

### Third frozen baseline

`workspace:sha256:a88d5053d809eddcdcf3ed71fdfcd966211d1a8347048247b39dd6261f5aad4d`

The third cycle passed the product-truth, visual, and runtime E2E tracks:

- 320 px hero badge was fully within the viewport;
- brand navigation and all five operational navigation items were present;
- reduced-motion CSS compiled and the final production asset identity remained
  stable;
- console, network failure, and HTTP error lists were empty;
- 70 focused tests, 932 frontend tests, and 5,118 root tests passed.

Codex review found one remaining medium state-contract inconsistency:
`setView('overview')` wrote `overview` to the persisted view key, while the
startup allowlist intentionally excluded Overview so that Progress remains the
default operational landing view. The write therefore had no matching read
contract. The selected correction is to persist only the five operational
views and leave the previous operational view unchanged when the brand
Overview opens.

The Change returned to Build. A fourth frozen verification cycle is required.

### Fourth frozen baseline

`workspace:sha256:c652119eb98fbed98dec29bd498b28c0e50b72636a485bb337a11831be9de21f`

Final result: **PASS**.

#### Independent tracks

- Reviewer track: PASS. The complete diff, bounded product claims, host setup
  language, mode shapes, Overview isolation, and operational-view memory
  contract have no actionable finding.
- Codex CLI track: PASS with no actionable finding.
- Runtime E2E track: PASS. The `index-CQATsymi.js` and
  `index-DxT-mCuu.css` assets were identical before and after the run.
  Projects persisted as the operational view, opening Overview left that value
  unchanged, and a fresh base URL restored Projects.
- Visual/accessibility track: PASS at 320, 390, 768, 1024, and 1440 px.
  Badge bounds remained inside the viewport, reduced-motion transitions
  computed to `none`, `html lang` followed the selected language, the light CTA
  measured 5.02:1, and the visible heading order remained `h1 → h2 → h3`.

#### Final automated evidence

- `npm run build`: passed; the existing Vite warning for the approximately
  741 kB main JavaScript chunk remains non-blocking.
- `npm test`: 290 files, 5,118 passed, five skipped because the required real
  agent credentials or canonical real-Codex CI flag were absent.
- `npm run test:web`: 49 files, 933 passed.
- `npm run check:docs`: eight checker tests and 21 canonical Markdown files
  passed.
- Type checking, architecture, comment honesty, generated default workflow,
  hook tests (426), adapter tests (262), skill verification, bundle tests (15),
  and `git diff --check` passed.
- The bounded secret scan found no private-key header, AWS access-key shape,
  GitHub classic token shape, or OpenAI-style secret in the delivery files.

#### Runtime acceptance

- The current Dashboard returned HTTP 200 on `127.0.0.1:18765`.
- The brand opened `view=overview` and exposed `aria-current="page"`.
- The five operational destinations remained unique and visible.
- Chinese/English and light/dark changes retained route state and synchronized
  the document language.
- At 320 px, document, body, and client widths were all 320 px with no overflow
  offender.
- Console warnings/errors, request failures, and HTTP responses at or above 400
  were empty in the final isolated run.

#### Specification-to-file review

- Truthful entry and community requirements:
  `README.md`, `README.zh-CN.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, and `SUPPORT.md`.
- Task-oriented manual requirement: all files under `docs/usage/`.
- Bundled Overview, mode/evidence/module, and bilingual/accessibility
  requirements: `packages/dashboard-app/src/solution/`,
  `packages/dashboard-app/src/App.tsx`, `packages/dashboard-app/src/i18n/`,
  `packages/dashboard-app/src/shell/Nav.tsx`,
  `packages/dashboard-app/src/shell/dashboardLocation.ts`, their focused tests,
  and the rebuilt `packages/dashboard-app/dist/`.
- Claim/link verification requirement: `tools/check-docs.mjs`,
  `tools/check-docs.node-test.mjs`, `package.json`, and
  `.github/workflows/ci.yml`.
- Governance evidence: the Change proposal/design/tasks/delta,
  `docs/superpowers/specs/`, `docs/superpowers/plans/`, the ADR, design review,
  and this report.

Every changed delivery file maps to an approved requirement. No unrelated
feature, dependency, port, router, API, persistence, or release-publication
change was introduced.

#### Spec merge and delivery boundary

The delta was merged without semantic change into
`openspec/specs/open-source-documentation-experience/spec.md`; a byte-for-byte
comparison is part of the final gate.

This Change prepares a local source delivery only. It does not publish a
package, deploy a public site, push Git, or promise a hosted service. The
Dashboard remains the single bundled SPA/API on loopback port 18765.

#### Remaining non-blocking risks

- The existing main-bundle size warning remains.
- Existing React `act(...)` and occasional GSAP test warnings remain, while all
  assertions pass.
- GitHub private vulnerability reporting depends on the repository setting;
  the security guide says “when available” and provides a non-public fallback.
