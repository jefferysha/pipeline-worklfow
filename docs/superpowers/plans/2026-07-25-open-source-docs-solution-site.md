# Open-source Documentation and Solution Overview Implementation Plan

change: `open-source-docs-solution-site`  
design-doc: `docs/superpowers/specs/2026-07-25-open-source-docs-solution-site-design.md`  
delta-spec: `openspec/changes/open-source-docs-solution-site/specs/open-source-documentation-experience/spec.md`

## Delivery constraints

- Preserve the existing Vite/React application, five operational rail views,
  Progress default, same-origin API, and production port 18765.
- Add no package, router, remote font, CDN, tracking, persistence, or public
  deployment.
- Use test-first implementation for every behavior change.
- Keep `solution/` presentation-only and below the frontend size limits.
- Use current CLI help, manifests, registries, source, specs, and tests as the
  only product claim sources.
- Do not publish, push, release, or deploy as part of implementation.

## Build subphase 1 — Tracer bullet: route one truthful overview slice

> This is the required frontend tracer bullet. It vertically connects component
> content → application assembly → navigation → URL state → rendering tests
> using the smallest useful overview before full content is added.

1. Add failing tests in:
   - `packages/dashboard-app/src/shell/dashboardLocation.test.tsx` for
     `view=overview` allowlisting and foreign-query preservation;
   - `packages/dashboard-app/src/shell/Nav.test.tsx` for an accessible brand
     navigation control while keeping `PRIMARY_VIEWS` at five;
   - `packages/dashboard-app/src/App.test.tsx` for direct overview rendering
     with zero projects and Progress remaining the fallback.
2. Add a minimal
   `packages/dashboard-app/src/solution/SolutionView.tsx` with a semantic `h1`
   and one verified setup command.
3. Extend `View`, the location allowlist, App assembly, and minimal symmetrical
   `solution.*` translations.
4. Run the focused Nav/location/App/i18n/component tests and
   `npm run typecheck:web`.

Rollback: remove the new view and brand handler; no state or API migration is
involved.

**此处建议 `/clear`。**

## Build subphase 2 — Complete the bilingual product overview

1. Add tests for:
   - mode, phase, evidence, module, installation, safety, and community content;
   - translated Chinese/English rendering;
   - safe external links and semantic heading order;
   - no solution-domain API/state imports or network calls.
2. Add `packages/dashboard-app/src/solution/solutionModel.ts` with typed,
   bounded mode/phase/module/link definitions.
3. Decompose the page into cohesive presentation components only when the main
   component approaches the 400-line hard limit.
4. Implement the complete responsive overview using existing tokens, Lucide,
   Button/Card/Badge primitives, and CSS/Tailwind utilities.
5. Verify 320-pixel reflow, internal command scrolling, focus styles, safe link
   attributes, dark/light tokens, and reduced-motion behavior.
6. Run focused tests, i18n completeness, full web tests, typecheck, and web
   build.

Rollback: the Overview feature is isolated behind one query view and can be
removed without operational view changes.

**此处建议 `/clear`。**

## Build subphase 3 — Replace the repository entry and add canonical manuals

1. Rewrite `README.md` in concise English and add a structurally equivalent
   `README.zh-CN.md`.
2. Add `docs/usage/README.md` as the task-oriented index.
3. Add:
   - `docs/usage/installation.md`;
   - `docs/usage/quickstart.md`;
   - `docs/usage/routing-and-workflows.md`;
   - `docs/usage/default-workflow.md`;
   - `docs/usage/custom-workflows-and-tracks.md`;
   - `docs/usage/documents-skills-and-evidence.md`;
   - `docs/usage/dashboard-and-local-api.md`;
   - `docs/usage/automation-and-loops.md`;
   - `docs/usage/advanced-tools.md`;
   - `docs/usage/updates-recovery-and-uninstall.md`;
   - `docs/usage/troubleshooting.md`;
   - `docs/usage/security-model.md`;
   - `docs/usage/contributor-development.md`;
   - `docs/usage/cli-reference.md`.
4. Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and
   `SUPPORT.md` with truthful GitHub-owned actions and no invented SLA.
5. Ensure README/docs commands match actual help, distinguish source setup from
   end-user host setup, and label optional/advanced boundaries.

Verification: inspect every new file, run a Markdown/link check, exercise safe
read-only commands, and use `git diff --check`.

Rollback: documentation changes are file-local; runtime behavior is unchanged.

**此处建议 `/clear`。**

## Build subphase 4 — Add claim/link drift checks

1. Add failing tests for broken repository-relative links and changed bounded
   claims.
2. Add `tools/check-docs.mjs` that:
   - resolves Markdown links safely within the repository;
   - checks Node 22+, 18765, key command families, default/simple YAML shapes,
     five operational views, and the separate Overview view from current files;
   - reports exact document/claim failures;
   - does not parse or duplicate complete runtime semantics.
3. Add `check:docs` to the root package scripts and CI after build/source
   generation gates.
4. Add unit coverage for the checker if its parsing helpers are non-trivial.

Verification: run `npm run check:docs`, mutate one fixture/temporary copy to
prove a failure where practical, then restore it and rerun.

Rollback: remove the checker/script entry; no runtime artifact depends on it.

**此处建议 `/clear`。**

## Build subphase 5 — Integration and production-bundle acceptance

1. Run:
   - focused solution/Nav/location/App/i18n tests;
   - `npm run typecheck:web`;
   - `npm run test:web`;
   - `npm run build:web`;
   - `npm run build:server`;
   - `npm run check:docs`;
   - `npm run check:architecture`;
   - `npm run check:comments`;
   - `git diff --check`.
2. Build the exact distribution, start/reuse the current `pipeline dashboard`
   on `127.0.0.1:18765`, and verify release/content identity before acceptance.
3. Perform real browser acceptance for:
   - direct `?view=overview`, brand navigation, history, reload, and return;
   - zero-project/offline states;
   - desktop/tablet/mobile including 320 pixels;
   - light/dark and zh/en;
   - keyboard/focus/semantics/reduced-motion;
   - links, console, network, assets, health, and operational-view regression.
4. Record exact commands, results, screenshots where useful, limitations, and
   any blocked gate in the verification report.

Rollback: the previous built release remains the recoverable runtime; do not
activate or publish a new external release in this Change.

## Spec/Ship/Archive work

1. During Build, check only completed Build tasks and re-record `tasks.md` with
   the current phase producer.
2. During Verify, create the governed verification report, run independent
   frontend/code/architecture review, and handle `verify-fail` honestly.
3. During Ship, apply the new capability spec under
   `openspec/specs/open-source-documentation-experience/spec.md`, re-read all
   evidence, and prepare a clean local delivery without external publication.
4. During Archive, verify the applied spec digest, archive through the
   workflow, and preserve the complete document/review chain.

