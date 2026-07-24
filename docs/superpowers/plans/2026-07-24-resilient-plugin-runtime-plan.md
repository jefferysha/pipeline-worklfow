# Resilient Plugin Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the host-selectable pipeline plugin run only verified immutable local releases,
with an atomic active/previous selection and an auditable recovery-only rollback path.

**Architecture:** `packages/cli/src/runtime/` owns the host-runtime application and filesystem
adapters.  A small distributed `runtime/pipeline-bootstrap.mjs` is installed outside marketplace
checkouts and dispatches CLI/hook invocations to an active managed release.  Existing payload hooks
and workflow routing stay in the selected release; host manifests call only the stable launcher.

**Tech Stack:** TypeScript ESM, Node.js 22 built-ins, Bash 3.2-compatible shims, Vitest, existing
`tools/verify-skills.sh`, npm workspace/esbuild bundle pipeline.

## Global Constraints

- Preserve `pipeline setup --codex|--claude` as the explicit native-host installation interface.
- Keep every default workflow skill bundled; do not add a remote package manager or dependency.
- Use lock + temporary sibling + atomic rename for every mutable runtime record.
- Never use `any`, non-null assertions, or unchecked parsed JSON in modified production TypeScript.
- A valid workflow-policy denial is fail-closed; runtime degradation permits only fixed local
  rollback and never arbitrary project mutation.
- Preserve user-owned uncommitted router/guard work and integrate only after its tests establish
  its current contract.

---

### Task 1: Define runtime paths, records, and release-store transactions

**Files:**

- Create: `packages/cli/src/runtime/types.ts`
- Create: `packages/cli/src/runtime/paths.ts`
- Create: `packages/cli/src/runtime/release-store.ts`
- Create: `packages/cli/src/runtime/paths.test.ts`
- Create: `packages/cli/src/runtime/release-store.integration.test.ts`

**Interfaces:**

- Consumes: Node `crypto`, `fs/promises`, existing `atomicReplaceFile` / mkdir-lock conventions.
- Produces: `resolveRuntimePaths`, `RuntimeReleaseStore`, `RuntimeSelection`,
  `RuntimeReleaseManifest`, and `RuntimeFailure`.

- [ ] **Step 1: Write failing path and codec tests**

```ts
expect(resolveRuntimePaths({ platform: 'linux', homeDir: '/home/a' })).toMatchObject({
  dataRoot: '/home/a/.local/share/pipeline-lite',
  stateRoot: '/home/a/.local/state/pipeline-lite',
  configRoot: '/home/a/.config/pipeline-lite',
})
expect(resolveRuntimePaths({ platform: 'darwin', homeDir: '/Users/a' }).dataRoot)
  .toBe('/Users/a/Library/Application Support/pipeline-lite')
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run packages/cli/src/runtime/paths.test.ts packages/cli/src/runtime/release-store.integration.test.ts`

Expected: FAIL because runtime modules do not exist.

- [ ] **Step 3: Implement the isolated runtime store**

```ts
export interface RuntimeSelection {
  readonly version: 1
  readonly revision: number
  readonly activeRelease: string | null
  readonly previousRelease: string | null
  readonly updatedAt: string
}

export interface RuntimeReleaseStore {
  stageAndActivate(candidateRoot: string, source: RuntimeReleaseSource): Promise<RuntimeActivation>
  inspect(): Promise<RuntimeInspection>
  rollbackToPrevious(): Promise<RuntimeActivation>
}
```

Copy only the curated distributed payload paths into a non-symlink staging tree, compute a stable
SHA-256 tree digest, verify it, rename it into `releases/sha256-<digest>`, atomically update
`selection.json`, append audit JSONL, and prune only unprotected older releases under one runtime
lock.

- [ ] **Step 4: Add failure and concurrency coverage**

Test an invalid shell hook, a missing bundle, a symlinked candidate, duplicate activation,
concurrent activation, interrupted staging, and rollback preserving the previous release.

- [ ] **Step 5: Run the task tests**

Run: `npx vitest run packages/cli/src/runtime/paths.test.ts packages/cli/src/runtime/release-store.integration.test.ts`

Expected: PASS.

### Task 2: Add the independently distributed bootstrap and stable launchers

**Files:**

- Create: `runtime/pipeline-bootstrap.mjs`
- Create: `packages/cli/src/runtime/launchers.ts`
- Create: `packages/cli/src/runtime/launchers.test.ts`
- Create: `packages/cli/src/runtime/bootstrap.test.ts`

**Interfaces:**

- Consumes: Task 1 selection/release file schema.
- Produces: `writeStableLaunchers(paths)`, `installBootstrapSlot(...)`, and bootstrap CLI modes
  `cli`, `hook`, `runtime-status`, and `runtime-repair`.

- [ ] **Step 1: Write failing bootstrap tests**

```ts
expect(parseRecoveryArgs(['runtime', 'repair', '--rollback'])).toEqual({ kind: 'rollback' })
expect(parseRecoveryArgs(['runtime', 'repair', '--rollback', '/tmp/evil'])).toBeNull()
expect(degradedGateDecision({ tool_name: 'Edit' })).toEqual({ exitCode: 2 })
```

- [ ] **Step 2: Implement bootstrap behavior**

The bootstrap verifies the selected release manifest before spawning its CLI or payload hook.  For
normal payload execution it sets `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` to the active payload root.
If integrity fails, `hook gate` allows only the exact rollback command and rejects other write tools;
other hook events report a diagnostic and avoid executing an unknown payload.  `cli runtime repair
--rollback` performs only validated previous-release selection.

- [ ] **Step 3: Implement idempotent launcher generation**

Generate executable shell scripts at `~/.local/bin/pipeline` and `~/.local/bin/pipeline-hook` that
embed resolved managed paths and `exec node <bootstrap-active> <mode>`.  Replace legacy symlinks
only after a successful release activation.

- [ ] **Step 4: Run bootstrap tests and syntax checks**

Run: `npx vitest run packages/cli/src/runtime/launchers.test.ts packages/cli/src/runtime/bootstrap.test.ts && node --check runtime/pipeline-bootstrap.mjs`

Expected: PASS and no syntax output.

### Task 3: Integrate setup, update, auto-update, and runtime CLI commands

**Files:**

- Modify: `packages/cli/src/commands/setup.ts`
- Modify: `packages/cli/src/commands/setup.test.ts`
- Modify: `packages/cli/src/commands/update.ts`
- Modify: `packages/cli/src/commands/update.test.ts`
- Create: `packages/cli/src/commands/runtime.ts`
- Create: `packages/cli/src/commands/runtime.test.ts`
- Modify: `packages/cli/src/program.ts`
- Modify: `hooks/auto-update.sh`

**Interfaces:**

- Consumes: `RuntimeReleaseStore.stageAndActivate`, `writeStableLaunchers`, host root resolution.
- Produces: `pipeline runtime status` and `pipeline runtime repair --rollback` plus transactional
  `setup` / `update` behavior.

- [ ] **Step 1: Write failing command tests**

```ts
expect(await cmdUpdate(deps, { codex: true }, env)).toBe(1)
expect(env.launcherTarget).toBe(previousRelease)
expect(await cmdRuntime(deps, 'repair', { rollback: true })).toBe(0)
```

- [ ] **Step 2: Replace direct marketplace launcher switching**

After native install or update resolves a host-reported root, call the runtime release transaction.
Do not call `ensurePipelineOnPath` with a candidate bundle path.  Existing non-native adapters keep
using the active managed payload and do not claim an independent marketplace update.

- [ ] **Step 3: Make auto-update use the stable launcher**

Resolve the configuration root through the same platform contract and run the launcher as
`pipeline update --<host> --yes --auto`; remove dependence on a host-provided mutable plugin root.

- [ ] **Step 4: Add runtime diagnostics**

`pipeline runtime status --json` exposes selected release IDs, validation status, bootstrap status,
and last audit event without exposing arbitrary absolute candidate paths.  `pipeline doctor` adds
a managed-runtime light that distinguishes healthy, degraded-with-rollback, and unrecoverable.

- [ ] **Step 5: Run command tests**

Run: `npx vitest run packages/cli/src/commands/setup.test.ts packages/cli/src/commands/update.test.ts packages/cli/src/commands/runtime.test.ts`

Expected: PASS.

### Task 4: Change host hook ABI and payload verification

**Files:**

- Modify: `hooks/hooks.json`
- Modify: `tools/verify-skills.sh`
- Modify: `tools/test-hooks.sh`
- Modify: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/commands/doctor.test.ts`
- Modify: `packages/cli/src/skill-bundle-lifecycle.integration.test.ts`

**Interfaces:**

- Consumes: stable `pipeline-hook` launcher from Task 2.
- Produces: a host manifest whose hook commands no longer resolve `${PLUGIN_ROOT}` directly.

- [ ] **Step 1: Write manifest and verifier regression tests**

```bash
rg '\$\{PLUGIN_ROOT|\$\{CLAUDE_PLUGIN_ROOT' hooks/hooks.json && exit 1 || true
bash tools/verify-skills.sh --root "$PWD"
```

- [ ] **Step 2: Implement stable manifest commands**

Each Hook event calls `bash "${HOME}/.local/bin/pipeline-hook" <event-id>` and preserves stdin.
The verifier rejects direct mutable-root hook commands, verifies the bootstrap asset, and runs
`bash -n` across every distributed shell hook before a candidate can activate.

- [ ] **Step 3: Test legacy/missing launcher behavior**

Prove that a host with a new manifest but no completed setup does not execute mutable payload hooks,
and that setup makes the stable launcher available before reporting success.

- [ ] **Step 4: Run hook and doctor tests**

Run: `npx vitest run packages/cli/src/commands/doctor.test.ts packages/cli/src/skill-bundle-lifecycle.integration.test.ts && bash tools/test-hooks.sh && bash tools/verify-skills.sh`

Expected: PASS.

### Task 5: Preserve deterministic workflow ownership and repair evidence wiring

**Files:**

- Modify only after diff review: `hooks/router.sh`, `hooks/skill-tracker.sh`,
  `hooks/skill-evidence.sh`, `hooks/gate.sh`
- Modify only after diff review: `packages/cli/src/commands/gen-router.ts` and existing router
  integration tests
- Create: `packages/cli/src/runtime/workflow-ownership.integration.test.ts` if current coverage
  does not prove the required scenarios.

**Interfaces:**

- Consumes: active payload root supplied by the bootstrap; existing router intent protocol.
- Produces: `intent: new`, `intent: resume`, or `intent: select` with no mtime binding for a new
  objective; host-observed bundled-skill evidence remains distinct from synthetic test fixtures.

- [ ] **Step 1: Review user changes before editing**

Run: `git diff -- hooks/router.sh hooks/gate.sh hooks/skill-tracker.sh hooks/skill-evidence.sh packages/cli/src/commands/gen-router.ts`

Expected: identify existing user-owned normal-chat changes and preserve their behavior.

- [ ] **Step 2: Add only missing regression cases**

Test stale `.pipeline-active`, multiple active changes, explicit named resume, a new objective,
and a Codex bundled `SKILL.md` read.  The test may invoke the tracker fixture explicitly, but
production document evidence must still originate from an actual host tool event.

- [ ] **Step 3: Run routing/evidence tests**

Run: `npx vitest run packages/cli/src/commands/gen-router.test.ts packages/cli/src/workflow-skill-orchestration.integration.test.ts packages/cli/src/internal-skill-gate-hook.integration.test.ts`

Expected: PASS.

### Task 6: Package, document, and validate the release

**Files:**

- Modify: `README.md`
- Modify: `docs/DIST-RELEASE.md`
- Modify: `docs/CONTRACT.md`
- Modify: `openspec/changes/resilient-plugin-runtime/tasks.md`
- Modify: `openspec/specs/<capability>/spec.md` during ship, after the delta is verified

**Interfaces:**

- Consumes: completed runtime CLI, hook ABI, and candidate verifier.
- Produces: install/update/recovery documentation and tracked fresh distribution bundles.

- [ ] **Step 1: Document exact user operations**

Include `pipeline setup --codex`, `pipeline update --codex`, `pipeline runtime status`, and
`pipeline runtime repair --rollback`; explain host trust and that rollback cannot bypass workflow
gates.

- [ ] **Step 2: Build all distribution assets**

Run: `npm run generate:default-workflow && npm run build`

Expected: tracked CLI/server/dashboard artifacts reflect source changes.

- [ ] **Step 3: Run final gates**

Run: `npm test && npm run check:default-workflow-freshness && bash tools/test-hooks.sh && bash tools/test-adapters.sh && bash tools/verify-skills.sh && bash tools/test-bundle.sh && npm run oracle`

Expected: PASS; document any environment-only skips truthfully.

- [ ] **Step 4: Update task evidence and prepare the ship/verification records**

Mark only verified implementation tasks complete and record actual command output in the verification
report.  Do not fabricate OpenSpec producer evidence when the host does not emit a real skill event.
