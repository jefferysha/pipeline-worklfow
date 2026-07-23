---
name: dispatching-parallel-agents
description: First-party protocol for parallel research or verification lanes.
license: MIT
metadata:
  author: pipeline-lite
---

# Dispatching Parallel Agents

Parallelize only independent lanes such as code search, test diagnosis, or visual verification.

- Give every lane a stable question, allowed files, and expected evidence.
- Avoid concurrent edits to the same file or shared generated artifacts.
- Merge findings before making a policy or architecture decision.
- Treat any disagreement as evidence to investigate, not a majority vote.
