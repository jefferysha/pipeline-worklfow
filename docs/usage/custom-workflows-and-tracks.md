# Custom Workflows and Tracks

## Goal

Create a declarative process whose graph, Skills, gates, and document reads
match the work, then bind it to a routing/policy Track.

## Prerequisites

- an initialized Tenon project
- a unique Workflow name other than reserved `default` or `simple`
- known step IDs, transition events, Skill IDs, and document ownership

## Author a Workflow

Project Workflows live at:

```text
.pipeline/workflows/<name>.yaml
```

A small example:

```yaml
name: release-note
steps:
  - id: shape
    label: Shape
    gate: review
    skills:
      - id: writer
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: shape-complete
        to: implement
  - id: implement
    label: Implement
    gate: null
    skills:
      - id: editor
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: implement-complete
        to: prove
  - id: prove
    label: Prove
    gate: review
    skills:
      - id: verifier
    inputs: []
    outputs: []
    guards: []
    transitions: []
document_contract:
  version: v1
  slots:
    - kind: proposal
      owner_step: shape
      producers: [writer]
  reads:
    - step: implement
      kinds: [proposal]
    - step: prove
      kinds: [proposal]
```

The contract is optional. Without it, Tenon does not infer documents
from the number or names of steps.

`openspec_contract: required` is the legacy complete seven-phase OpenSpec
contract and is appropriate only to that full phase shape. It is mutually
exclusive with `document_contract`.

The Dashboard Workbench provides a visual editor for Workflows. The saved YAML,
not the drawing alone, is the project definition.

## Use the Workflow

```bash
tenon init release-note-2026-07 \
  --track backend \
  --preset full \
  --workflow release-note
```

Status and Dashboard Todo now use `shape`, `implement`, and `prove`, not the
default seven phase names.

## Create a Track

Tracks overlay routing/coverage/automation/Skill policy on a Workflow:

```bash
tenon tracks create docs \
  --label "Documentation" \
  --workflow-default release-note \
  --workflow-allowed release-note \
  --policy free \
  --json
```

Allow any Workflow with `--workflow-any`:

```bash
tenon tracks create neutral \
  --label "Neutral" \
  --workflow-default default \
  --workflow-any \
  --policy free
```

Inspect and update:

```bash
tenon tracks list --json
tenon tracks show docs --json
tenon tracks update docs --set-label "Documentation delivery" --json
```

Built-in policy identity is protected. Built-in Tracks cannot be deleted, and
custom Tracks referenced by active Changes cannot be deleted.

## Skill DAG and guards

Workflow Skills are declarations, not proof they ran. Host hooks and the
internal Skill gate enforce the current step and dependencies; current-visit
provenance is recorded separately. Guards should express deterministic exit
conditions rather than duplicate agent instructions.

## Expected result

- graph validation succeeds;
- the Change has immutable Workflow/Track identity;
- CLI, hooks, Todo, and Dashboard use the same steps;
- only declared documents and reads are enforced.

## Verification

```bash
tenon status <change-name> --json
tenon workflow plan <change-name> --json
tenon tracks show <track-id> --json
tenon document status <change-name> --json
tenon check <change-name>
```

## Common failures

### Reserved name

Project files cannot override built-in `default` or `simple`.

### A short Workflow unexpectedly has no docs

Add `document_contract.version: v1` with real owner/producer/read declarations.

### A document producer is rejected

The current step must allow that document kind and the actual current-visit
Skill identity must match a declared producer.

### Track deletion is rejected

An active Change still references it. Preserve the active identity and archive
or migrate through an explicit supported operation first.

## Next action

Read [documents, Skills, and evidence](documents-skills-and-evidence.md) and
[CLI reference](cli-reference.md).
