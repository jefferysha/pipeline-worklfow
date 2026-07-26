---
name: openspec-archive-change
description: First-party OpenSpec archive preflight for a completed pipeline change.
license: MIT
metadata:
  author: tenon
  version: "2.0.0"
---

# OpenSpec Archive Change

Prepare a completed change for the pipeline archive phase without relying on an external OpenSpec
CLI.

1. Read `tenon status <change>` and `tenon document status <change>`. Confirm that
   verification passed, the applied-spec receipt is current, and `tasks.md` has no incomplete
   implementation work unless the user explicitly accepted an exception in the verification report.
2. Read the change delta specs and their main spec targets. If an unapplied delta remains, return to
   `openspec-apply-change`; never archive a change that only claims to have updated the main spec.
3. Check `tenon task children <change>` for active dependent changes and present any blocking
   dependency to the user.
4. Summarize the proposed archive: documents retained, main specs updated, evidence complete, and
   dependencies. The pipeline archive phase then performs the canonical `archived` transition; this
   skill must not move directories or edit canonical state directly.

Use `tenon document read <change> all` before the final archive check so the archive phase has a
fresh receipt for every earlier artifact.
