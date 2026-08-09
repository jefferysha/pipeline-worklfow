# Default workflow and review gates

## Goal

Operate the governed seven-phase default Workflow, including return edges and
exact review receipts.

## Prerequisites

- an active Change using `workflow=default`
- the phase Skill dispatched by the Tenon entrypoint
- current document evidence for the phase

## Workflow graph

```text
open → explore → spec ⇄ build ⇄ verify → ship → archive
          review   review         review
```

Transitions:

| From | Event | To | Meaning |
| --- | --- | --- | --- |
| open | `open-complete` | explore | framing is recorded |
| explore | `explore-complete` | spec | explored design is approved |
| spec | `spec-complete` | build | specification/plan is approved |
| build | `build-complete` | verify | implementation baseline is frozen |
| build | `requirements-changed` | spec | approved meaning changed |
| verify | `verify-pass` | ship | exact baseline passed review |
| verify | `verify-fail` | build | implementation needs correction |
| ship | `ship-complete` | archive | delivery evidence is applied |

Explore, Spec, and Verify are review-gated.

The Verify phase also opens exactly one automated Review attempt for the frozen
`build_sha`. Its standards, spec, and E2E lanes share the same attempt ID and
finite Workflow budget. E2E is a Review lane, not an independent Review count.
No Review Skill, reviewer agent, or E2E runner may start before that attempt is
active. Build TDD, unit tests, type checks, lint, and narrow integration tests
remain Build feedback and do not consume the Review budget.

Ship also has a machine-enforced migration guard. When the Change contains
`migration/spec-application.json`, the managed apply tool must produce a result bound to the
Change, input receipt, delta, target path, and final digest. Both `tenon check` and
`tenon transition ... ship-complete` revalidate that evidence and fail closed on drift.

## Phase operation

### 1. Inspect current truth

```bash
tenon status <change-name> --json
tenon document status <change-name>
```

### 2. Run the dispatched phase Skill

The coding agent reads the packaged phase Skill and the current Change
documents, performs the work, and records its current-visit evidence. Do not
replace real Skill execution with a claim in prose.

### 3. Check the exit

```bash
tenon check <change-name>
```

Exit `0` means current guard checks pass. Exit `2` means the report contains
unmet guards. Check does not transition.

### 4. Handle a review exit

Bind the request to the exact event:

```bash
tenon review request <change-name> --event <event>
```

After the user reviews and confirms:

```bash
tenon review acknowledge <change-name>
tenon transition <change-name> <event>
```

Use `--delegated` only when the user has already granted continuous authority
for this exact Change:

```bash
tenon review acknowledge <change-name> --delegated
```

Delegation records the confirmation fact. It does not remove evidence, guards,
or authority boundaries.

### 5. Use return edges honestly

If approved requirements/design meaning changes during Build:

```bash
tenon transition <change-name> requirements-changed
```

Revise and review in Spec. Do not overwrite an old digest in Build.

If verification fails:

```bash
tenon review request <change-name> --event verify-fail
tenon review acknowledge <change-name>
tenon transition <change-name> verify-fail
```

Fix in Build, freeze a new baseline, and verify again. A `verify-pass` receipt
cannot approve `verify-fail`, or vice versa.

## Expected result

Every transition has the correct Workflow edge, guard evidence, current
documents/reads, and exact review receipt where required.

## Verification

```bash
tenon status <change-name> --json
tenon document status <change-name> --json
tenon check <change-name>
```

At Build completion, status contains the frozen `build_sha` or in-place
workspace fingerprint used by Verify.

## Common failures

### Review acknowledged but transition still fails

Confirm the request was bound to the same event and current phase visit.

### Build wants to alter proposal/design meaning

Use `requirements-changed`; do not conceal drift by re-recording approval
documents from Build.

### Verify changed implementation files

Verify must inspect the frozen baseline. A correction belongs on the
`verify-fail → build` return path.

## Next action

Read [documents, Skills, and evidence](documents-skills-and-evidence.md) or
[Dashboard status semantics](dashboard-and-local-api.md).
