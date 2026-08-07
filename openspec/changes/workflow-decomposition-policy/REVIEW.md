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
| High | A missing-authorization evaluator result could still enter the ordinary review-confirmation path. | Missing authorization is now an unconditional hard block and has a production/irreversible positive-control regression. |
| High | A require-review receipt trusted an opaque caller-supplied candidate fingerprint. | The kernel now computes a canonical SHA-256 candidate fingerprint over the normalized plan and re-computes it at confirmation time. |
| High | Workflow authority provider failures were converted into ordinary denials. | Provider calls now sit outside semantic-denial handling so storage or resolver failures propagate as observable state I/O errors. |
| Medium | Cancelling policy edits discarded unrelated stage/guard drafts. | Policy cancel and Escape now restore only decomposition/interaction fields and preserve unrelated drafts. |

Open tracked Critical/High/Medium findings: **0** after the recorded fixes; exact-HEAD independent
read-only re-review remains a Build exit gate.

## Build gates

- Root suite: 364 files, 6367 passed, 26 honest environment skips, 0 failed
  (`npm test -- --minWorkers=4 --maxWorkers=4`, exit 0).
- Dashboard suite: 90 files, 1654 passed, 0 failed
  (`npm run test:web -- --minWorkers=4 --maxWorkers=4`, exit 0).
- TypeScript, production build, OpenSpec 39/39, repository identity, default-workflow
  freshness, repository hygiene, Skill bundle verification (66 references / 62 directories),
  architecture (782 production files), comment honesty and `git diff --check`: PASS.
- Focused policy/admission/AFK/codec/server/Dashboard regressions and the three independent
  implementation tracks pass. The final exact-HEAD independent review is still pending.
- Hermetic bundle gate: 28 passed, 0 failed, including the frozen N-1 strict reader.

## Pending completion evidence

- The optional machine-managed previous runtime is an unlabeled 2026-08-04 cache and rejects the
  intentional V3 snapshot. It is recorded as environment-only evidence; the repeatable frozen-reader
  compatibility hard gate passes and the approved specification requires new runs to use V3.
- The exact-HEAD isolated full review and frozen Verify evidence remain pending.
- Production browser acceptance will use the existing single browser owner and tab after the
  integrated build is green; no additional browser instance will be started.

## Current verdict

The PR3 Build fixes and local gate chain are green. Final PASS remains pending exact-HEAD isolated
review, frozen Verify evidence and production browser acceptance.
