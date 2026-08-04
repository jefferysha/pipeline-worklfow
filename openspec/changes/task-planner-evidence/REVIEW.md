# Build review

## Scope

- Change: `task-planner-evidence`
- Base: `codex/task-plan-contract-20260803`
- Worktree: `/Users/a1234/.codex/worktrees/task-planner-evidence-20260803/pipeline-worklfow`
- Review tracks: specification, repository architecture, security/privacy, frontend design,
  web accessibility, design taste, production browser acceptance

## Findings and resolutions

| Severity | Finding | Resolution |
|---|---|---|
| Critical | Production binding accepted a caller-supplied Project ID. | Project ID is now derived from the canonical repository root; WorkflowRun, definition, step, visit, WorkItem and attempt remain repository-checked. |
| Critical | Completed and interrupted events could be appended without an injected trust/recovery verdict. | Completion requires an exact adapter verdict; interrupted requires exact ownership recovery; adapter kind drift is rejected. |
| High | The initial codec joined the runtime decoder to the event union with an unchecked double assertion. | Decoder now constructs each discriminated event branch directly; `check:architecture` passes. |
| High | A macOS-only fd-path requirement rejected every legitimate read with 403. | Reader retains an opened Change directory fd and uses the repository's cross-platform path fallback with pre/post root, parent, Change identity and mutation-version checks; path-swap test returns 403 before data is returned. |
| Medium | Dashboard decoder initially accepted partial subject/question fields and unknown nested policy members. | Public DTO decoder is closed at every object boundary, requires TaskPlanRevision/WorkItem pairing and validates definition, non-negative StepVisit, schemas, bounded options, classifications, policy, artifact and validator enums. |
| Medium | Acceptance fixture test resolved its path differently under the Dashboard Vitest root. | The test resolves both workspace-root and package-root execution forms; the closed fixture test passes. |
| Critical | The package roots exposed raw append, caller-selected adapter/input/output/interactions and an injectable always-true completion verifier. | Root exports omit raw append, configurable command construction and caller-selected AFK fail/interrupt. The only AFK finish path requires one exact durable RunRecord and derives completed/failed/interrupted from its terminal cause. |
| Critical | Only the document producer called the application command; native Task Planner and the general AFK runner had no production lifecycle. | Canonical TaskPlan publication records a native `task-planner` started and completed/failed lifecycle. The production SDK scheduler records every selected loop-bundle Skill as AFK started and completed/failed, with shutdown interruption recovery. |
| High | AFK start followed by caller-selected interrupt could mint a terminal without proof that a runner executed. | Shutdown only aborts and drains the scheduler. After canonical settlement, AFK finish requires exact attempt/change/loop/workflow-run/snapshot bindings and derives interruption from the durable terminal's `scheduler-interrupted` cause. |
| Critical | A document confirmation could be replayed after leaving and re-entering the same named phase. | Confirmation v2, receipt digest and an exact history binding all include WorkflowRun ID and transition sequence. The producer independently compares them with the current canonical StepVisit and fails closed on drift. |
| High | Multiple canonical delta-spec records of the same kind were treated as ambiguous. | The command selects the just-recorded canonical entry by producer, timestamp and requested canonical path, then passes that exact ledger record and digest to the producer. Two capability delta-specs persist independent Invocation and artifact evidence even under one fixed clock. |
| High | A normal current-visit `CodexSkillRead` suppressed the v2 document binding, while the command ignored a missing Invocation. | Document reconciliation re-verifies the strict receipt/transcript even when ordinary history already contains the Skill. Missing confirmation is rejected before document registration, and a missing producer result is fail-loud. |
| High | Adjacent native invocations by the same producer could collide at the ledger's second-resolution timestamp, causing a completed, bound document to be associated with the next confirmation and rejected. | Evidence evaluation now accepts only the confirmation's exact invocation ID or the child ID derived from that confirmation plus canonical kind/path/digest/recordedAt. The timestamp-collision regression was RED before the fix and GREEN afterward; `backend-full` and all five oracle fixtures then returned zero mismatches. |
| Critical | A normal document record could mint canonical evidence without an exact current-visit host confirmation, and a caller-selected anchor could bind the wrong record. | Normal writes now require a trusted native or Codex confirmation bound to the current WorkflowRun and exact StepVisit sequence. The producer receives the exact canonical record selected by the command; no caller can override its path or digest. Backfill compatibility does not satisfy the normal gate. |
| Critical | Test-only producer bridges remained callable through compiled CLI artifacts and workspace package source subpaths. | CLI TypeScript excludes both test-support modules, architecture rejects all four possible emitted artifacts, package `exports` blocks every module subpath, and the published `files` allowlist contains only `dist/tenon.mjs`. Post-build import returns `ERR_PACKAGE_PATH_NOT_EXPORTED`; `npm pack --dry-run` contains exactly the CLI bundle and package manifest. |
| Medium | The Dashboard real-server fixture still registered documents directly and therefore failed the strengthened normal-write gate. | The test-only fixture now follows native confirmation → canonical document record → exact path/digest invocation binding. It fails loudly at every step, remains outside the production graph, and its focused plus full Web suites pass. |
| Medium | This report previously said there were no open C/H/M findings while new Build tasks remained incomplete. | The exact current diff received three independent review rounds. The final review reports Critical PASS, High PASS and Medium PASS with zero open findings. |

Open Critical/High/Medium findings: **0**.

## Build gates

- Package-export/AFK boundary regressions: 4 files/6 tests, then the expanded 6 files/14 tests,
  all passed. The final host-neutral document aggregation passed 13 files/311 tests; hooks passed
  511 checks; the timestamp-collision set passed 3 files/41 tests.
- Stable receipt bridge ownership moved from PR3 into PR2 as the minimal two-file patch from
  `66d3c91a`: `runtime/tenon-bootstrap.mjs` plus its stable-hook integration test. All 56 PR3
  governance files were excluded. The inherited Codex cache root is accepted only after ordinary
  directory-chain, manifest identity, version, required-file and no-symlink validation; invalid
  roots fail closed. The focused stable/runtime/receipt set passes 189 tests after updating one
  stale assertion to PR2's stricter exact-StepVisit rejection message; production behavior was not
  weakened.
- Final independent source review: 7 files/105 focused tests, then the sole Dashboard fixture delta,
  concluded Critical 0 / High 0 / Medium 0. The package-source import probe is blocked and the packed
  CLI contains exactly two entries (`dist/tenon.mjs` and `package.json`).
- Root suite: 356 files, 6228 passed, 26 honest environment skips, 0 failed (6254 total).
- Dashboard suite: 89 files, 1642 passed, 0 failed.
- TypeScript, production build, OpenSpec 38/38, default-workflow freshness, oracle 0 mismatches,
  architecture (771 production files), comment honesty and `git diff --check`: PASS.

## Production browser acceptance

The batch's single browser owner reused one Playwright connector and one tab; browser PID count did
not increase. Production server was `http://127.0.0.1:18772` (PID `16454`) with the current worktree
registered in an isolated runtime home.

- Real endpoint returned `skill-invocation-list/v1` empty and the region announced an honest status.
- An 8-second delayed response exposed the loading status.
- The checked-in ready fixture rendered completed, incomplete, failed and interrupted invocations;
  it exposed input/output counts, actually shown and not-shown questions, user answer,
  recommended default, frozen rule/rationale, and bound artifact.
- Chinese and English passed. English contained no Chinese product copy.
- Widths 1024×900, 1440×1000 and 1920×1080 had no body, drawer or evidence-region horizontal overflow.
- Native summary received visible keyboard focus; Enter expanded and Space collapsed it. The 409
  error exposed an alert and focus-visible Retry; changing the response to 200 and pressing Enter
  recovered. Escape closed the drawer and restored focus to the originating Change card.
- Each explicit reload issued exactly one evidence GET. The intentional error/retry sequence was
  409 then 200 with no extra card requests.
- Screenshots: `pr2-empty-1440.png`, `pr2-loading-1440.png`, `pr2-ready-1440.png`,
  `pr2-ready-en-1440.png`, `pr2-ready-en-1024.png`, `pr2-ready-en-1920.png`,
  `pr2-error-en-1920.png`.

Known external limitation: mounting the existing Context Bundle preview on macOS produces expected
`501 CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`, which the browser reports as a resource error. The
Skill Invocation API produced no unexpected request failure, JavaScript exception, or warning. The
501 is not reported as console-clean and remains an existing host-platform limitation outside this
Change.

## Verdict

PASS: exact-diff specification, security/privacy, backend architecture and UI review have zero open
Critical/High/Medium findings; the full Build gate chain and production browser acceptance passed.
The existing macOS Context Bundle 501 remains honestly recorded above as a host-platform limitation.
