# Build review

## Scope

- Change: `workflow-decomposition-policy`
- Base: `codex/task-planner-evidence-20260803`
- Worktree: `/Users/a1234/.codex/worktrees/workflow-decomposition-policy-20260803/pipeline-worklfow`
- Review tracks: workflow contract and compatibility, authority and admission security,
  server/API boundary, Dashboard editor and accessibility, generated artifacts, production browser
  acceptance

## Findings and resolutions

| Severity | Finding | Resolution |
|---|---|---|
| Critical | A generic workflow ceiling could directly authorize decomposition materialization. | Materialization now requires the exact five-layer authority intersection, an explicit Skill action grant, canonical Run/fingerprint binding and the decomposition evaluator's condition, depth, item-limit and review checks. |
| Critical | Skill authority could be inferred from mandatory/recommended slots or prose. | `skill_action_authority/v1` is a closed, machine-readable manifest contract; the kernel parser and production provider reject unknown or missing grants and never infer capability from slot membership or prose. |
| Critical | AFK/recommended-default paths could accept caller-selected authorization context. | Admission derives exact Run, fingerprint, loop and iteration bindings from canonical state; AFK does not widen authority, and hard confirmation binds authority, action, Run and fingerprint. |
| High | V2 restore could produce a snapshot that was not self-consistent on a second restore. | Compatibility normalization is centralized and covered by restore -> snapshot -> restore regression tests for V1/V2 plus V3 tamper rejection. |
| High | Recommended-default decisions were not bound to the exact frozen question and options. | Decisions now require the frozen policy reference and the PR2 question/options identity; missing or drifting evidence fails closed. |
| Medium | Sparse YAML condition entries and optional policy DTOs could be partially accepted. | Workflow parsing and public Dashboard/server decoders are closed at every nested boundary; sparse/unknown values fail with stable validation errors. |
| Medium | Turning decomposition off could erase subordinate configuration or couple interaction behavior to decomposition. | Codec/API/Dashboard preserve subordinate policy while disabled and round-trip decomposition and interaction as independent axes. |

Open Critical/High/Medium findings: **0** in the current PR3 diff after independent read-only re-review.

## Build gates

- Root suite: 356 files, 6317 passed, 26 honest environment skips, 0 failed
  (`npm test -- --minWorkers=4 --maxWorkers=4`, exit 0, 144.61s).
- Dashboard suite: 90 files, 1651 passed, 0 failed
  (`npm run test:web -- --minWorkers=4 --maxWorkers=4`, exit 0).
- TypeScript, production build, OpenSpec 39/39, repository identity, default-workflow
  freshness, repository hygiene, Skill bundle verification (66 references / 62 directories),
  architecture (772 production files), comment honesty and `git diff --check`: PASS.
- Focused policy/admission/AFK/codec/server/Dashboard regressions and the three independent
  implementation tracks pass; the final independent review reports Critical/High/Medium = 0/0/0.

## Pending completion evidence

- The PR2 base is repairing a host-neutral native/Codex document invocation defect inherited from
  its current head. PR3 will integrate the new exact PR2 remote head and remove any duplicate patch
  before final verification.
- Oracle and the final full root/typecheck/build chain will be rerun only after that base integration.
- Production browser acceptance will use the existing single browser owner and tab after the
  integrated build is green; no additional browser instance will be started.

## Current verdict

The PR3 implementation diff has zero open Critical/High/Medium findings and its current local gate
chain is green. Final PASS remains pending the new PR2 base, real oracle reconciliation and
production browser acceptance.
