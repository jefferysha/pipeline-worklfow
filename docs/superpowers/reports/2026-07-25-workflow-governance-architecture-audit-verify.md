# Workflow Governance Architecture Audit — Verification Report

## Final decision

- Change: `workflow-governance-architecture-audit`
- Track/workflow: `backend/default`
- Isolation: `in-place`
- Sixth frozen build baseline:
  `workspace:sha256:57a76f23a4f838b0c239c20c5b308de4db0cff15cd03be2768f81d14da5236dc`
- Decision: **PASS**

The implementation workspace matched this fingerprint before and after all
three independent final verification tracks. Verify changed only this
governance report and the Verify checkboxes, which are excluded governance
evidence rather than implementation drift.

## Independent verification tracks

### Architecture and code review

**PASS — no unresolved correctness, security, architecture, or error-handling
finding.**

- The fifth-loop reproducer `exit 0; <Skill read>` is now rejected and does not
  create evidence.
- Transcript command evidence accepts only a complete allowlisted sequence of
  physical sibling-plugin Skill reads: `cat`, `sed`, `head`, `tail`, or
  restricted `wc -l/-c/-w`. Unknown predecessors, `||`, mixed control flow,
  unreachable reads, and structured non-zero exits fail closed.
- Direct-development, custom-exec, and function-call Codex transcript ABIs
  remain compatible.
- Partial legacy run identity completion preserves the run and transition
  identity, adds the immutable document/workflow bindings, and rejects
  conflicts.
- Default and custom workflows use the same effective-plan Skill gate.
- Current-visit document receipts, full EffectiveWorkflowPlan authority, and
  immutable profile/workflow fingerprints did not regress.
- Focused reviewer suite: 5 files, 96 passed.
- Architecture scan: 555 production files, five exact size-only exceptions,
  PASS.
- Comment-honesty and `git diff --check`: PASS.

### E2E and regression

**PASS.**

- Focused regression: 3 files, 72/72:
  - Codex receipt and transcript evidence: 32/32.
  - WorkflowRun partial-binding migration/conflict behavior: 31/31.
  - Real default/custom host Skill gate: 9/9.
- Full root suite: 290/290 files; 5,118 passed and five honest credential-gated
  skips (5,123 total).
- Dashboard suite and typecheck: 48/48 files; 920/920.
- Hook suite: 426/426.
- Adapter conformance: 262/262.
- Bundle smoke: 15/15.
- Skill inventory: 64 path references, 63 bundled Skill directories, 63
  installable tokens, zero mandatory external Skill dependencies.
- Root TypeScript/Web/server/bundle build: PASS.
- Five-fixture old/new workflow oracle: zero inconsistencies. The explicitly
  documented `in-place` isolation and PM auto-queue behavior are known product
  extensions, not hidden divergences.

### Browser and runtime behavior

**PASS.**

- `127.0.0.1:18765` was checked against the current `dist`; the stale listener
  was replaced by the exact current dashboard process (PID 95672).
- `running` and `waiting` states render distinctly and correctly.
- Default shows the seven pipeline phases; simple shows four steps; free and a
  custom workflow retain their own effective plans.
- `/api/health` and `/api/snapshot` return 200.
- No console errors, unexpected 4xx/5xx responses, or abnormal network
  failures. Three SSE aborts caused by page navigation are expected.

## Agent Rule compliance re-check

The complete clause matrix in
`docs/superpowers/specs/2026-07-25-workflow-governance-architecture-audit-design.md`
was re-read against the final tree:

| Rule surface | Final enforcement/evidence | Result |
| --- | --- | --- |
| AGENTS / COMMON workflow truth | CLI-only canonical state, visit-bound document ledger, immutable effective-plan bindings, review receipts | PASS |
| COMMON package ownership and compatibility | Public facades preserved; cross-package imports checked; default-name compatibility sites occurrence-bounded | PASS |
| BACKEND DDD and boundaries | Aggregate/application/adapter ownership restored; HTTP DTOs reject unknown keys; loop state uses repository/codec | PASS |
| BACKEND persistence, error, and security | Atomic run completion, CAS/fingerprint conflict rejection, physical Skill-root containment, malformed input coverage | PASS |
| FRONTEND dependency direction | API client split into boundary decoders; feature/domain projections consume effective-plan DTOs | PASS |
| FRONTEND states and accessibility | Loading/error/empty paths, keyboard labels, responsive layouts, themes, Todo/status modes verified in tests and browser | PASS |
| File-size limits | `check:architecture` scans `packages/`, `hooks/`, and `runtime/`; 555 production files with five exact rule-owned exceptions | PASS |
| Distribution and CI | generated workflow, bundles, setup/update assets, Skill inventory, hook/adapter gates, and CI wiring verified | PASS |

## Step 1.5 — exhaustive changed-file to capability mapping

The final in-place inventory contains 184 tracked changes and 239 untracked
files, 423 paths total. The following mutually exhaustive path groups cover
every entry returned by `git diff --name-only` plus
`git ls-files --others --exclude-standard`; every group was diff-reviewed
against the listed canonical capability specifications.

| Exact path group | Count | Capability specs re-read | Result |
| --- | ---: | --- | --- |
| `.github/**`, `package.json`, `tools/**` | 6 | repository-architecture-compliance | PASS |
| `README.md`, `docs/**`, `openspec/changes/workflow-governance-architecture-audit/**`, `openspec/specs/**` | 83 | all four capability specs | PASS |
| `hooks/**`, `runtime/**`, `skills/**` | 10 | interaction-and-skill-provenance; effective-workflow-plan; repository-architecture-compliance | PASS |
| `packages/kernel/src/**` | 71 | declarative-document-governance; effective-workflow-plan; interaction-and-skill-provenance; repository-architecture-compliance | PASS |
| `packages/cli/src/**`, `packages/cli/dist/**` | 64 | declarative-document-governance; effective-workflow-plan; interaction-and-skill-provenance; repository-architecture-compliance | PASS |
| `packages/server/src/**`, `packages/server/dist/**` | 36 | effective-workflow-plan; repository-architecture-compliance | PASS |
| `packages/automation/src/**`, `packages/channel/src/**`, `packages/tap/src/**` | 43 | effective-workflow-plan; interaction-and-skill-provenance; repository-architecture-compliance | PASS |
| `packages/dashboard-app/src/**`, `packages/dashboard-app/dist/**` | 106 | effective-workflow-plan; declarative-document-governance; repository-architecture-compliance | PASS |
| `workflow-governance-*.png` | 3 | effective-workflow-plan; repository-architecture-compliance | PASS |
| **Total** | **423** | | **PASS** |

## Step 1.6 — delta to canonical OpenSpec merge

All four delta specifications were merged and compared byte-for-byte after
normalizing only the OpenSpec delta heading:

| Capability | Canonical SHA-256 | Result |
| --- | --- | --- |
| declarative-document-governance | `844e518a1903ff6f51e6b7f93eebef7a6bbbea133b5df241aa572ac1e144a92f` | exact |
| effective-workflow-plan | `a329f9126cf18ccd693a88ddd0d317f35f6e4a4a5a7accfb7c7e2c08919edd5b` | exact |
| interaction-and-skill-provenance | `23e45d9a575d820f9bf4921d6da1dc4addf71de489c4a171f6c963f548b9ba80` | exact |
| repository-architecture-compliance | `8108490a6f8bd50454f95555a3f044e089d6667fe1ddc103395f478fcb235cab` | exact |

## Verify-loop audit trail

The final pass was earned through five real return-to-Build loops:

1. Closed current-visit document receipts, exact receipt/root identity,
   complete EffectiveWorkflowPlan capabilities, and immutable plan/profile
   bindings.
2. Closed default/custom runtime authority and reserved-default architecture
   enforcement gaps.
3. Closed partial legacy WorkflowRun binding, custom outer transcript, and
   default host-gate bypass defects.
4. Closed mixed shell control flow and success-looking stdout overriding a
   structured non-zero exit.
5. Closed successful early shell termination before a nominal Skill read.

Each failure produced a registered report, exact `verify-fail` review receipt,
and a genuine `verify → build → verify` transition. No blocker was waived.

## Residual limits and non-blocking observations

- Five integration cases require real Codex/Claude credentials or
  `PIPELINE_REQUIRE_REAL_CODEX=1`; they remain explicit skips.
- Non-dry-run marketplace publication/update was not allowed to mutate the
  real user home. Immutable release packaging and isolated install/update
  behavior are covered by integration and bundle tests.
- Browser acceptance is behavioral and visual inspection, not a pixel-baseline
  comparison; no matching committed visual baseline exists.
- Vite reports a non-failing 715.89 kB main-chunk size warning.
- Some React tests emit existing `act(...)`/missing GSAP-target warnings while
  all assertions pass; these warnings are visible here rather than treated as
  silent success.
