---
change: bundled-skill-authority
design-doc: docs/superpowers/specs/2026-07-24-bundled-skill-authority-design.md
track: backend
preset: tweak
---

# Bundled Skill Authority Plan

## Stage 1: tracer bullet

1. Add a failing runner-aware production-locator test with divergent bundled
   and global content.
2. Split the bundled root into its own lookup tier and make the test green.
3. Run the AFK wiring preflight against the real `default + pm` loop.

Verification:
`npx vitest run packages/automation/src/skills/production-content-locator.test.ts`

This stage spans manifest profile → production locator → AFK wiring.

此处建议 /clear。

## Stage 2: compatibility adapter

1. Add the equivalent regression for the runner-neutral production adapter.
2. Preserve not-found-only descent and namespaced behavior.
3. Run all skill-bundle, loop-wiring, admission, and AFK executor suites.

Verification:
`npx vitest run packages/cli/src/skillBundleAssembly.test.ts packages/cli/src/commands/loop-starter-wiring.test.ts packages/cli/src/commands/loop-admission-view.test.ts`

此处建议 /clear。

## Stage 3: production acceptance

1. Build CLI/server bundles before freezing Verify.
2. Re-run the real Docker-backed L1 PM AFK task.
3. Capture queued, running, and terminal UI/API evidence.

## Compatibility and rollback

No registry or workflow schema changes. Rollback is the locator-only commit;
external ambiguity behavior remains covered throughout.
