# Workflow Runtime Integrity Design

## Approved Outcome

The runtime will separate three concepts that were previously easy to conflate:

- `chat`: a discussion intent that does not create a Change;
- `simple`: a strictly bounded executable workflow;
- `free`: a neutral executable Track that can bind any Workflow and adds no
  PM/frontend/backend policy overlay.

The selected Workflow remains fully authoritative in free mode. Its steps,
skills, gates, OpenSpec contract, documents, and transitions still execute.
“Free” means freedom from a domain Track profile, not freedom from the selected
Workflow's own contract.

In-place verification will hash implementation content only. The project-local
`.pipeline/` tree is control-plane state and will be excluded alongside
`openspec/`, `docs/`, and verifier caches.

## Evidence and Failure Analysis

### Fingerprint self-invalidation

`fingerprintWorkspace()` excludes individual root markers but not the
`.pipeline/` directory. A Build visit freezes the workspace; the required
Verify skill then appends a receipt to
`.pipeline/codex-skill-receipts.jsonl`. Replaying that file at its Build-time
content reproduces the frozen digest, proving that the required evidence write,
not an implementation edit, caused the mismatch.

The defect is an ownership error: a control-plane append was treated as an
implementation mutation.

### Missing neutral execution identity

The registry has a `chat` Track with neutral policy fields, but prompt routing
also gives `chat` the non-execution meaning “answer directly and do not create
a Change.” Reusing that ID would make historical Change identity and prompt
intent ambiguous.

Creating a separate project Track for every Workflow would duplicate policy,
create migration work, and drift whenever Workflows are added. The existing
`TrackWorkflowBinding.allowed='*'` contract already models one Track that may
bind all Workflows.

## Alternatives

### 1. Rename or repurpose `chat`

Rejected. It breaks the existing discussion contract and makes old
`track=chat` Changes impossible to interpret consistently.

### 2. Generate one free Track per Workflow

Rejected. It duplicates identical policy, raises Track-count pressure, and
requires update hooks whenever a Workflow is created, renamed, or deleted.

### 3. Add one built-in `free` Track with `allowed='*'`

Chosen. It provides a stable executable identity, requires no project-file
migration, and automatically covers future Workflows.

## Domain Boundaries

| Boundary | Responsibility |
| --- | --- |
| Kernel Track registry | Owns the immutable `free` policy and allowed-Workflow invariant. |
| Kernel workspace fingerprint | Owns implementation/control-plane classification. |
| Router projection/cache | Carries all effective Tracks as bounded manual candidates while scoring only routable Tracks. |
| Prompt hook | Recognizes an explicit free-mode request; never chooses free from content scoring. |
| Pipeline skill | Validates the exact `free / workflow` pair before Change creation. |
| Dashboard | Shows free as a manual candidate and lists every allowed Workflow. |
| CLI/API | Remains the canonical validator and writer of selected Track/Workflow identity. |

No HTTP handler, UI component, or shell hook will manufacture a Track policy.
They consume the kernel registry projection.

## Router Contract

The router cache will move to a fail-closed schema version that distinguishes
manual candidates from routable scorers:

- every effective Track is represented with its validated default Workflow;
- `routing.enabled=false` rows carry no executable pattern and never enter the
  score loop;
- the candidate list may include `free/default` without forcing a picker in a
  clean project;
- an explicit “free mode / 自由模式” request selects `free` through a dedicated
  intent branch, not by a magic regex score;
- when a project has custom choices, the pipeline skill may pair `free` with
  any validated available Workflow because its kernel binding is `allowed='*'`.

Old caches are rejected by schema identity and regenerated. A release-owned
contract digest covers builtin Tracks plus manifest phase skills and
breadcrumbs; the bash loader compares it by content, so a newer cache mtime
cannot conceal an older plugin contract. Project-authored
bytes remain data-only and are never sourced or evaluated as shell.

Custom Workflow graphs keep terminal steps structurally honest with
`transitions: []`. The shared transition application supplies one reserved
`archived` completion operation only for a terminal step whose exact id is
`archive`; it runs after normal skill, guard, and document gates, then records
the archive self-transition and closes canonical state. User-authored graphs
therefore do not need a fake cycle merely to leave the active recovery set.

## State and Data Flow

1. Setup/update supplies the new built-in definition in the immutable runtime.
2. Registry load merges project overrides with the six built-ins.
3. Dashboard preview returns all six built-ins; disabled Tracks have
   `routable=false`.
4. Normal conversation either:
   - scores only routable Tracks, or
   - consumes an explicit free-mode request and selects `free`.
5. The root skill validates the exact Workflow against the free Track's `*`
   binding before `pipeline init --track free --workflow <id>`.
6. Change identity is immutable after creation; normal step execution follows
   that Workflow only.

## Error Handling and Compatibility

- Unknown `free` pairings fail through the existing `assertWorkflowAllowed`
  and Workflow loader paths.
- Missing or malformed router schema data fails closed and regenerates.
- Existing `chat`, `simple`, `pm`, `frontend`, `backend`, custom Track IDs, and
  serialized overrides retain their meaning.
- The built-in registry revision changes as expected after runtime update;
  no project migration file is written.
- Existing custom `builtins:` maps remain valid because `free` is additive.

## Verification Strategy

- Kernel: exact free policy, registry ordering, overrides, serialization,
  workspace receipt/control-plane stability.
- CLI: list/show/init free with default and custom Workflows; illegal Workflow
  rejection; policy template compatibility.
- Router/hook: non-routable rows never score; explicit free request; custom
  selection includes free; old cache rejection; hostile cache remains inert.
- Server/dashboard: preview shows free; unmatched create dialog falls back to
  free; selecting free lists default plus project Workflows.
- Distribution: skills, hooks, bundle, first-install/update acceptance.
- End to end: resume a fixture-backed custom Change, freeze a fresh in-place
  baseline, write Verify receipts, and pass Verify/Ship/Archive.

## Decision Log

- `free` is not AFK eligible because unattended execution is a separate policy
  decision, not a synonym for fewer domain overlays.
- `free` uses `coverageProfile=none` and `skills.matrix=false`; Workflow-declared
  skills still execute.
- `free` keeps `reviewSeed=pending`; a Workflow's review gates and document
  contracts remain enforceable.
- No automatic scorer may select free. Only explicit user choice or a direct UI
  selection may do so.

## Coverage

```coverage
touches:
L1_api:      filled -> #Router-Contract and #State-and-Data-Flow
L2_data:     filled -> #Evidence-and-Failure-Analysis and #Router-Contract
L3_rules:    filled -> #Approved-Outcome and #Router-Contract
L4_state:    filled -> #State-and-Data-Flow
L5_errors:   filled -> #Error-Handling-and-Compatibility
L6_security: filled -> #Router-Contract and #Error-Handling-and-Compatibility
L7_perf:     waived -> bounded Track registry and one-time cache regeneration
L8_deps:     waived -> no new runtime dependency
L10_terms:   filled -> #Domain-Boundaries and #Decision-Log
```
