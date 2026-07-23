---
name: openspec-explore
description: First-party read-first OpenSpec exploration for active pipeline changes.
license: MIT
metadata:
  author: pipeline-lite
  version: "2.0.0"
---

# OpenSpec Explore

Explore a problem without implementing it. This skill reads the pipeline-owned OpenSpec files
directly and has no dependency on an external OpenSpec executable.

1. Resolve an explicitly named change, or list active changes with `pipeline list --json`. If the
   user did not identify one and more than one exists, ask them to choose.
2. Run `pipeline status <change>` and read `proposal.md`, `design.md`, `tasks.md`, relevant ADRs,
   and existing `openspec/specs/<capability>/spec.md` files.
3. Map facts, assumptions, options, risks, and unanswered questions. Use diagrams or comparison
   tables when they clarify a state transition, data flow, or trade-off.
4. Do not write application code. When the user approves a decision, offer to capture it in the
   appropriate proposal, design, ADR, delta spec, or task document.
5. Before leaving a governed phase, call `pipeline document read <change> all` so later phases have
   a digest-bound receipt of the documents actually consumed.

If no change exists, remain in discovery. Once the intent is clear, hand back to the packaged
`openspec-propose` or `pipeline-open` skill to create a new change.
