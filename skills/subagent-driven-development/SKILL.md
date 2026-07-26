---
name: subagent-driven-development
description: First-party guidance for safely splitting independent implementation work.
license: MIT
metadata:
  author: tenon
---

# Subagent-driven Development

Use only when the work can be partitioned by non-overlapping files or contracts.

- Define an owner, bounded task, inputs, outputs, and verification command for each workstream.
- Keep shared schema/API changes in one owner stream.
- Reconcile output through tests and a final integration review.
- Do not delegate user confirmations, release actions, or destructive operations without the same
  authority available to the parent task.
