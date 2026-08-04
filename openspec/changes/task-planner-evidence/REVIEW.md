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

Open Critical/High/Medium findings: **0**.

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

PASS: specification, security/privacy, backend architecture and UI review have no open C/H/M issue;
production browser acceptance passed with the existing macOS Context Bundle 501 recorded above.
