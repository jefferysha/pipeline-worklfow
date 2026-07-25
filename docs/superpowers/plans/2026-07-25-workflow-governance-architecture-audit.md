# Workflow Governance Architecture Audit Implementation Plan

change: workflow-governance-architecture-audit  
design-doc: docs/superpowers/specs/2026-07-25-workflow-governance-architecture-audit-design.md  
adr: docs/adr/2026-07-25-workflow-governance-architecture-audit-explore.md

## Constraints

- Preserve all existing public CLI, HTTP, YAML/state, ledger, hook, dashboard,
  setup/update/rollback, and default/simple/free behavior unless the delta
  specs explicitly add a capability.
- Never hand-edit canonical run state, generated Workflow artifacts, tracked
  bundles, or immutable releases.
- Keep locks, revision/epoch CAS, atomic publication, Host/token/content-type,
  root trust, review receipts, and exact document digests fail closed.
- Each subphase ends with focused tests and a clean-context boundary.
- A disposable prototype is not selected: the repository is mature and has
  direct compiler, transition, hook, install, and browser characterization
  seams. The tracer-bullet tests below answer the unknowns without introducing
  an unshipped implementation path.

## Subphase 1 — Tracer bullet: one governed three-step Workflow end to end

Goal: prove the new vertical contract through schema → compiler → state →
CLI/server projection before broad refactoring.

1. Add characterization fixtures/tests for:
   - legacy default full governance;
   - legacy custom `openspec_contract: required`;
   - simple/no governance;
   - a three-step `shape → implement → verify` Workflow with declarative
     proposal/plan/read obligations.
2. Introduce the smallest kernel governance-profile value types and
   `EffectiveWorkflowPlan` compiler in
   `packages/kernel/src/workflow/`, exported only through
   `packages/kernel/src/index.ts`.
3. Make one CLI check/transition path and one server snapshot projection use
   the effective plan while preserving legacy behavior.
4. Add an integration test that initializes the three-step Workflow, records
   its two documents, proves missing reads fail, completes required reads, and
   verifies the projected three-step Todo.

Verification:

```bash
npm run build
npm test -- --run packages/kernel/src/workflow
npm test -- --run packages/cli/src/commands
npm test -- --run packages/server/src
```

Rollback boundary: new code is additive and fixtures remain; no persisted
schema is emitted until the tracer tests pass.

**此处建议 /clear**

## Subphase 2 — Complete governance schema and compatibility

1. Extend Workflow parse/serialize/compile/validate/IR/types for the bounded
   versioned document profile.
2. Compile `openspec_contract: required` to the existing full profile without
   changing its strict seven-phase validation.
3. Replace boolean-only state initialization with a versioned profile identity
   while retaining legacy boolean reads.
4. Generalize document owner/producer/read matrices from canonical phase names
   to compiled authored-step policy.
5. Update document ledger status/check/transition errors with owner-step
   repair context while preserving existing envelopes.
6. Add round-trip, malformed-schema, unknown-version, missing-step,
   duplicate-owner, stale-digest, legacy-state, and no-eager-migration tests.

Primary files:

- `packages/kernel/src/workflow/{types,ir,parse,serialize,compile,validate,document-contract}.ts`
- `packages/kernel/src/state/{workflow-run-repository,document-evidence}.ts`
- `packages/kernel/src/types.ts`
- `packages/cli/src/commands/{document,check,advance,artifact,review}.ts`
- matching kernel/CLI integration tests and fixtures.

Verification:

```bash
npm test -- --run packages/kernel/src/workflow packages/kernel/src/state
npm test -- --run packages/cli/src/commands/document packages/cli/src/commands/check
npm run check:default-workflow-freshness
```

Rollback boundary: legacy alias and boolean reader remain; new canonical writes
can be removed without rewriting old Changes.

**此处建议 /clear**

## Subphase 3 — Unify Skill, intent, and transition enforcement

1. Remove the whole-default bypass from current-visit Skill enforcement and
   derive declared Skills from the effective plan.
2. Preserve the exact `pipeline` entrypoint exemption.
3. Replace historical Codex cache enumeration with exact trusted roots passed
   by bootstrap/executing hook context.
4. Extract one source-only prompt intent classifier used by prompt routing,
   breadcrumb, and confirmation hooks.
5. Implement context-sensitive bare `继续`: approval only for the exact active
   pending interaction/review, resume-only otherwise.
6. Add negative tests for stale/unselected/global/symlink Skill paths,
   previous step visits, other Changes/events, new-objective precedence,
   continuous authority, revocation, and delegated-review prerequisites.

Primary files:

- `packages/cli/src/commands/internalSkillGate.ts`
- `packages/cli/src/codexSkillReceipt.ts`
- `hooks/{skill-evidence,prompt-intent,confirm-clear-prompt,router,breadcrumb,review-ack}.sh`
- `tools/test-hooks.sh`
- adapter tests and Workflow Skill orchestration integration tests.

Verification:

```bash
npm test -- --run workflow-skill-orchestration codexSkillReceipt
npm run test:hooks
npm run test:adapters
```

Rollback boundary: selected-root enforcement is fail-closed; existing managed
active/previous releases provide runtime rollback.

**此处建议 /clear**

## Subphase 4 — Restore backend ownership and DTO boundaries

1. Extract server routes by bounded context and share one authenticated route
   composition layer.
2. Add explicit unknown-to-request DTO decoders, including Workflow save and
   Change creation, before kernel compilation.
3. Move loop Change-state projection behind a kernel/application
   repository/codec contract; remove CLI private YAML parsing.
4. Export stable automation state/cancel-marker contracts from
   `@pipeline-lite/automation` and consume them in server/CLI through the public
   export.
5. Decompose every backend production file above its applicable hard limit by
   bounded context or use case, keeping stable public facades.
6. Remove non-null assertions and unsafe casts in every touched production
   boundary.

Primary areas:

- `packages/server/src/server.ts` and new route/decoder modules;
- `packages/server/src/{workflows,afk,automationConfig}.ts`;
- `packages/automation/src/` oversized admission/scheduler/lifecycle/triage/
  skill modules;
- `packages/channel/src/supervisor.ts`;
- oversized kernel workflow/state/loop/verification modules;
- oversized CLI setup/channel/program/AFK modules;
- `packages/tap/src/certs.ts`.

Verification:

```bash
npm run build
npm test -- --run packages/server packages/automation packages/channel packages/kernel packages/cli packages/tap
npm run test:integration
```

Rollback boundary: public facades and route paths remain; extraction commits
can be reverted by bounded context without state migration.

**此处建议 /clear**

## Subphase 5 — Restore frontend direction and decompose the dashboard

1. Move evidence/decision projection to neutral model ownership and Icon to
   shared ownership; reverse feature imports are removed.
2. Split `api/client.ts` into bounded-context clients with runtime response
   decoders and a stable facade.
3. Decompose every component >400 lines and every page/route >600 lines by
   stable view model, panel, dialog, and hook responsibility.
4. Preserve current i18n keys, accessibility semantics, keyboard behavior,
   loading/error/empty/disabled/success states, responsive layout, and themes.
5. Make Progress/Todo/Skill views consume effective-plan projection instead of
   Workflow-name inference.

Primary areas:

- `packages/dashboard-app/src/{api,model,shared,shell}/`;
- oversized Workbench, Progress, Loop, Task Detail, Skill Chain, Timeline,
  Governance, AFK, App, and Projects views/components.

Verification:

```bash
npm run test:web
npm run build:web
```

Rollback boundary: public component/API facades stay stable until all callers
and browser tests pass.

**此处建议 /clear**

## Subphase 6 — Objective architecture checks and generated projections

1. Add `tools/check-architecture.mjs` with exact rule citations and exact
   generated/config/schema/fixture/protocol exceptions.
2. Enforce backend/frontend hard-size limits, layer direction, public package
   imports, domain purity, production assertion discipline, no historical
   Skill-cache enumeration, and no adapter capability reconstruction.
3. Add `check:architecture` to root scripts and CI before the broad test suite.
4. Update templates, schemas, dashboard DTOs, docs, tracked CLI/server bundles,
   and install payload verification for the new profile projection.
5. Regenerate only through existing build/bundle commands and prove freshness.

Verification:

```bash
npm run check:architecture
npm run check:comments
npm run check:default-workflow-freshness
npm run bundle
npm run verify:skills
npm run test:bundle
```

Rollback boundary: checker/config is isolated; runtime schema remains
backward-readable.

**此处建议 /clear**

## Subphase 7 — Complete verification and installed-user acceptance

1. Run the full root build/test/integration/hook/adapter/Skill/bundle/freshness/
   comment/oracle suite.
2. Create clean temporary projects for default, simple, free, legacy governed,
   and declarative three-step Workflows.
3. Run clean `pipeline setup --codex`; verify bundled mandatory Skills,
   immutable selected release, stable launchers, update/rollback diagnostics,
   and dashboard health release/state scope on port 18765.
4. Start the actual installed dashboard and perform browser acceptance for
   Todo/step/document/Skill/review states at desktop/mobile and light/dark
   themes, including loading/error/empty/disabled/keyboard paths.
5. Run final architecture/code review, apply delta specs to canonical specs,
   refresh docs/changelog, and record all commands/results without
   manufacturing evidence.

Full gate:

```bash
npm run check:architecture
npm run check:comments
npm run check:default-workflow-freshness
npm run build
npm test
npm run test:integration
npm run test:web
npm run test:hooks
npm run test:adapters
npm run verify:skills
npm run bundle
npm run test:bundle
npm run test:workflow-oracle
```

Release condition: all required gates pass, installed dashboard identity
matches the selected release, browser evidence is from the intended app, and
no Agent Rule hard violation remains.
